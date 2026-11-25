import pino from "pino";

/**
 * Logger estruturado (JSON) da aplicação.
 * - Um log por linha, pronto para ser coletado por Loki/ELK/CloudWatch.
 * - Campos fixos: servico, ambiente, nivel, time.
 * - Use `criarLogger("Modulo")` para identificar a origem do log.
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "silent" : "info"),
    base: {
        servico: "moove-backend",
        ambiente: process.env.NODE_ENV || "development",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
        level: (label) => ({ nivel: label }),
    },
});

export const criarLogger = (modulo: string) => logger.child({ modulo });
