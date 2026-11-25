import { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { criarLogger } from "../infra/logger/Logger";
import { incrementar, observarLatencia } from "../infra/observabilidade/Metricas";

const log = criarLogger("HTTP");

/**
 * - Gera/propaga o Correlation ID (header X-Request-Id) para rastrear um fluxo ponta a ponta
 *   (App -> Nginx -> API -> logs).
 * - Registra 1 log estruturado por requisição (método, rota, status, duração).
 * - Alimenta as métricas de throughput, erros e latência (base dos SLIs).
 */
const ObservabilidadeHttp = (req: Request, res: Response, next: NextFunction) => {
    const inicio = process.hrtime.bigint();
    const idRequisicao = (req.headers["x-request-id"] as string) || randomUUID();
    res.locals.idRequisicao = idRequisicao;
    res.setHeader("X-Request-Id", idRequisicao);

    res.on("finish", () => {
        const duracaoMs = Number(process.hrtime.bigint() - inicio) / 1e6;
        // Usa o padrão da rota (/rota/:id) e não a URL real, para não explodir a cardinalidade
        const rota = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : "nao_mapeada";
        const classe = `${Math.floor(res.statusCode / 100)}xx`;

        incrementar("moove_http_requisicoes_total", { metodo: req.method, rota, status: classe });
        observarLatencia({ metodo: req.method, rota }, duracaoMs);

        if (rota === "/health" || rota === "/metrics") return; // evita ruído de probes

        const dados = {
            idRequisicao,
            metodo: req.method,
            url: req.originalUrl,
            rota,
            status: res.statusCode,
            duracaoMs: Math.round(duracaoMs),
            usuarioId: (req as any).usuario?.id,
        };
        if (res.statusCode >= 500) log.error(dados, "Requisição com erro no servidor");
        else if (res.statusCode >= 400) log.warn(dados, "Requisição rejeitada");
        else log.info(dados, "Requisição concluída");
    });

    next();
};

export default ObservabilidadeHttp;
