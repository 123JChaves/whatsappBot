import { NextFunction, Request, Response } from "express";
import ApiErro from "../error/ApiErro";
import { criarLogger } from "../infra/logger/Logger";
import { TimeoutErro, CircuitoAbertoErro } from "../infra/resiliencia/Resiliencia";

const log = criarLogger("Erro");

/**
 * Tratamento centralizado de erros:
 * - Erros de negócio (ApiErro) -> status definido pela própria classe (400, 404...).
 * - Timeout / Circuito aberto -> 503 (dependência indisponível, cliente pode tentar de novo).
 * - Demais -> 500 sem vazar detalhes internos; o stack vai apenas para o log, com o Correlation ID.
 */
const MiddlewareErro = (
    erro: Error & Partial<ApiErro>,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const idRequisicao = res.locals.idRequisicao;

    if (erro instanceof ApiErro) {
        log.warn({ idRequisicao, status: erro.statusDeCodigo, erro: erro.message, url: req.originalUrl }, "Erro de negócio");
        return res.status(erro.statusDeCodigo).json({ message: erro.message, idRequisicao });
    }

    if (erro instanceof TimeoutErro || erro instanceof CircuitoAbertoErro) {
        log.error({ idRequisicao, erro: erro.message, url: req.originalUrl }, "Dependência indisponível");
        return res.status(503).json({ message: "Serviço temporariamente indisponível. Tente novamente.", idRequisicao });
    }

    log.error({ idRequisicao, erro: erro.message, stack: erro.stack, url: req.originalUrl }, "Erro não tratado");
    return res.status(500).json({ message: "Erro interno no servidor", idRequisicao });
};

export default MiddlewareErro;
