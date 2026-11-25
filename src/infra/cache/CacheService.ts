import { obterRedis } from "../redis/RedisClient";
import { criarLogger } from "../logger/Logger";
import { comTimeout } from "../resiliencia/Resiliencia";
import { incrementar } from "../observabilidade/Metricas";

const log = criarLogger("Cache");

/** Contrato mínimo do cliente Redis usado pelo cache (facilita testes com um dublê em memória). */
export interface ClienteCache {
    get(chave: string): Promise<string | null>;
    set(chave: string, valor: string, modo: "EX", segundos: number): Promise<unknown>;
    del(...chaves: string[]): Promise<number>;
    scan(cursor: string | number, ...args: (string | number)[]): Promise<[string, string[]]>;
}

/** TTLs (segundos) — podem ser ajustados por variável de ambiente sem novo deploy de código. */
export const TTL = {
    ROTAS: Number(process.env.CACHE_TTL_ROTAS || 120),
    EMPRESAS: Number(process.env.CACHE_TTL_EMPRESAS || 600),
    MOTORISTAS: Number(process.env.CACHE_TTL_MOTORISTAS || 60),
};

/** Catálogo central de chaves — evita chaves "mágicas" espalhadas pelo código. */
export const ChavesCache = {
    PREFIXO_ROTAS: "rotas:",
    PREFIXO_EMPRESAS: "empresas:",
    PREFIXO_MOTORISTAS: "motoristas:",
    rotasTodas: () => "rotas:todas",
    rotasPorTurno: (tipo: string) => `rotas:turno:${tipo}`,
    rotaPorId: (id: number) => `rotas:id:${id}`,
    empresasTodas: () => "empresas:todas",
    empresaPorId: (id: number) => `empresas:id:${id}`,
    motoristasTodos: () => "motoristas:todos",
};

const TIMEOUT_REDIS_MS = 300;

/**
 * Implementação do padrão CACHE-ASIDE (lazy loading):
 *  1. A aplicação consulta o cache;
 *  2. HIT  -> devolve o valor do Redis;
 *  3. MISS -> consulta o MySQL, grava no Redis com TTL e devolve;
 *  4. Em escritas, a aplicação INVALIDA as chaves afetadas.
 * Se o Redis estiver fora do ar, o cache é ignorado (bypass) e a resposta vem do banco.
 */
export class CacheService {
    constructor(
        private readonly obterCliente: () => ClienteCache | null = obterRedis as unknown as () => ClienteCache | null,
        private readonly namespace = "moove:",
    ) {}

    private k(chave: string) {
        return `${this.namespace}${chave}`;
    }

    async obterOuCarregar<T>(chave: string, ttlSegundos: number, carregar: () => Promise<T>): Promise<T> {
        const cliente = this.obterCliente();
        const chaveCompleta = this.k(chave);

        if (!cliente) {
            incrementar("moove_cache_total", { resultado: "bypass" });
            log.debug({ chave: chaveCompleta }, "Cache BYPASS (Redis indisponível)");
            return carregar();
        }

        try {
            const bruto = await comTimeout(cliente.get(chaveCompleta), TIMEOUT_REDIS_MS, "cache.get");
            if (bruto !== null) {
                incrementar("moove_cache_total", { resultado: "hit" });
                log.info({ chave: chaveCompleta }, "Cache HIT");
                return JSON.parse(bruto) as T;
            }
        } catch (erro) {
            incrementar("moove_cache_total", { resultado: "erro" });
            log.warn({ chave: chaveCompleta, erro: (erro as Error).message }, "Falha ao ler o cache; usando o banco");
            return carregar();
        }

        incrementar("moove_cache_total", { resultado: "miss" });
        log.info({ chave: chaveCompleta, ttlSegundos }, "Cache MISS: consultando o banco");
        const valor = await carregar();

        try {
            await comTimeout(cliente.set(chaveCompleta, JSON.stringify(valor), "EX", ttlSegundos), TIMEOUT_REDIS_MS, "cache.set");
        } catch (erro) {
            log.warn({ chave: chaveCompleta, erro: (erro as Error).message }, "Falha ao gravar no cache");
        }
        return valor;
    }

    async invalidar(...chaves: string[]): Promise<void> {
        const cliente = this.obterCliente();
        if (!cliente || chaves.length === 0) return;
        try {
            const removidas = await cliente.del(...chaves.map((c) => this.k(c)));
            incrementar("moove_cache_invalidacoes_total", {}, removidas);
            log.info({ chaves, removidas }, "Cache INVALIDADO");
        } catch (erro) {
            log.warn({ chaves, erro: (erro as Error).message }, "Falha ao invalidar o cache");
        }
    }

    /** Invalida todas as chaves que começam com o prefixo (usa SCAN, nunca KEYS, para não travar o Redis). */
    async invalidarPorPrefixo(prefixo: string): Promise<void> {
        const cliente = this.obterCliente();
        if (!cliente) return;
        try {
            let cursor = "0";
            let total = 0;
            do {
                const [proximo, chaves] = await cliente.scan(cursor, "MATCH", `${this.k(prefixo)}*`, "COUNT", 100);
                cursor = proximo;
                if (chaves.length > 0) total += await cliente.del(...chaves);
            } while (cursor !== "0");
            incrementar("moove_cache_invalidacoes_total", {}, total);
            log.info({ prefixo, removidas: total }, "Cache INVALIDADO por prefixo");
        } catch (erro) {
            log.warn({ prefixo, erro: (erro as Error).message }, "Falha ao invalidar o cache por prefixo");
        }
    }
}

export const cache = new CacheService();
