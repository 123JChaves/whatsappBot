import { Router, Request, Response } from "express";
import { AppDataSource } from "../data-source";
import { pingRedis, redisHabilitado } from "../infra/redis/RedisClient";
import { comTimeout } from "../infra/resiliencia/Resiliencia";
import { renderizarPrometheus } from "../infra/observabilidade/Metricas";
import { botInstance } from "../index";

const rotasSaude = Router();

/** LIVENESS: o processo está vivo? (usado pelo Docker/orquestrador para reiniciar o container) */
rotasSaude.get("/health", (req: Request, res: Response) => {
    res.status(200).json({ status: "UP", uptimeSegundos: Math.round(process.uptime()) });
});

/**
 * READINESS: a instância está pronta para receber tráfego?
 * - MySQL é dependência CRÍTICA (sem ele -> 503).
 * - Redis e WhatsApp são NÃO críticos (status DEGRADED, mas segue atendendo).
 */
rotasSaude.get("/health/ready", async (req: Request, res: Response) => {
    let mysql = false;
    try {
        if (AppDataSource.isInitialized) {
            await comTimeout(AppDataSource.query("SELECT 1"), 1000, "health.mysql");
            mysql = true;
        }
    } catch { mysql = false; }

    const redis = redisHabilitado() ? await pingRedis() : null;
    const whatsapp = !!botInstance?.conectado;

    const status = !mysql ? "DOWN" : (redis === false || !whatsapp) ? "DEGRADED" : "UP";
    res.status(mysql ? 200 : 503).json({
        status,
        dependencias: {
            mysql: mysql ? "UP" : "DOWN",
            redis: redis === null ? "DESABILITADO" : redis ? "UP" : "DOWN",
            whatsapp: whatsapp ? "UP" : "DESCONECTADO",
        },
        verificadoEm: new Date().toISOString(),
    });
});

/** Métricas no formato Prometheus (coletadas pelo Prometheus/Grafana Agent). */
rotasSaude.get("/metrics", (req: Request, res: Response) => {
    res.type("text/plain; version=0.0.4").send(renderizarPrometheus());
});

export default rotasSaude;
