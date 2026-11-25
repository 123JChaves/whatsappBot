import Redis, { RedisOptions } from "ioredis";
import { criarLogger } from "../logger/Logger";

const log = criarLogger("Redis");

let cliente: Redis | null = null;      // comandos normais + PUBLISH
let assinante: Redis | null = null;    // conexão dedicada ao SUBSCRIBE (exigência do protocolo Redis)

export const redisHabilitado = (): boolean =>
    process.env.REDIS_ENABLED !== "false" && process.env.NODE_ENV !== "test";

function opcoes(): RedisOptions {
    return {
        host: process.env.REDIS_HOST || "localhost",
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        lazyConnect: true,
        connectTimeout: 2000,          // timeout de conexão
        commandTimeout: 1000,          // timeout por comando
        maxRetriesPerRequest: 1,       // não segura a requisição HTTP esperando o Redis
        enableOfflineQueue: false,     // se o Redis cair, falha rápido e o cache é ignorado (degradação graciosa)
        retryStrategy: (tentativa) => Math.min(tentativa * 200, 5000), // reconexão com backoff
    };
}

function registrarEventos(conexao: Redis, nome: string) {
    conexao.on("ready", () => log.info({ conexao: nome }, "Redis conectado"));
    conexao.on("error", (erro) => log.warn({ conexao: nome, erro: erro.message }, "Erro na conexão Redis"));
    conexao.on("reconnecting", (ms: number) => log.warn({ conexao: nome, emMs: ms }, "Reconectando ao Redis"));
    conexao.on("end", () => log.warn({ conexao: nome }, "Conexão Redis encerrada"));
}

export async function conectarRedis(): Promise<boolean> {
    if (!redisHabilitado()) {
        log.info("Redis desabilitado (REDIS_ENABLED=false): cache e eventos operam em modo degradado");
        return false;
    }
    try {
        cliente = new Redis(opcoes());
        assinante = new Redis(opcoes());
        registrarEventos(cliente, "principal");
        registrarEventos(assinante, "assinante");
        await Promise.all([cliente.connect(), assinante.connect()]);
        return true;
    } catch (erro) {
        log.error({ erro: (erro as Error).message }, "Não foi possível conectar ao Redis; a API segue funcionando sem cache");
        return false;
    }
}

/** Retorna o cliente somente se estiver pronto; caso contrário, null (o chamador faz fallback). */
export const obterRedis = (): Redis | null => (cliente && cliente.status === "ready" ? cliente : null);
export const obterAssinante = (): Redis | null => (assinante && assinante.status === "ready" ? assinante : null);

export async function pingRedis(): Promise<boolean> {
    const c = obterRedis();
    if (!c) return false;
    try {
        return (await c.ping()) === "PONG";
    } catch {
        return false;
    }
}

export async function desconectarRedis(): Promise<void> {
    await Promise.allSettled([cliente?.quit(), assinante?.quit()]);
    cliente = null;
    assinante = null;
}
