import { CacheService } from "../infra/cache/CacheService";
import { RedisFalso } from "./RedisFalso";

describe("CacheService (cache-aside)", () => {
    let redis: RedisFalso;
    let cache: CacheService;

    beforeEach(() => {
        redis = new RedisFalso();
        cache = new CacheService(() => redis);
    });

    it("MISS na 1ª consulta: busca no banco e grava no Redis com TTL", async () => {
        const banco = jest.fn().mockResolvedValue([{ id: 1, nome: "ROTA 1" }]);

        const resultado = await cache.obterOuCarregar("rotas:todas", 120, banco);

        expect(resultado).toEqual([{ id: 1, nome: "ROTA 1" }]);
        expect(banco).toHaveBeenCalledTimes(1);
        expect(redis.ttlDe("moove:rotas:todas")).toBeGreaterThan(110);
    });

    it("HIT na 2ª consulta: não acessa o banco", async () => {
        const banco = jest.fn().mockResolvedValue([{ id: 1 }]);
        await cache.obterOuCarregar("rotas:todas", 120, banco);
        await cache.obterOuCarregar("rotas:todas", 120, banco);
        expect(banco).toHaveBeenCalledTimes(1);
    });

    it("TTL expirado força nova ida ao banco", async () => {
        const banco = jest.fn().mockResolvedValue("valor");
        await cache.obterOuCarregar("chave", 1, banco);
        redis.dados.get("moove:chave")!.expiraEm = Date.now() - 1; // simula expiração
        await cache.obterOuCarregar("chave", 1, banco);
        expect(banco).toHaveBeenCalledTimes(2);
    });

    it("invalidação por prefixo após update remove apenas o contexto afetado", async () => {
        await cache.obterOuCarregar("rotas:todas", 120, async () => 1);
        await cache.obterOuCarregar("rotas:id:7", 120, async () => 2);
        await cache.obterOuCarregar("empresas:todas", 120, async () => 3);

        await cache.invalidarPorPrefixo("rotas:");

        expect(redis.dados.has("moove:rotas:todas")).toBe(false);
        expect(redis.dados.has("moove:rotas:id:7")).toBe(false);
        expect(redis.dados.has("moove:empresas:todas")).toBe(true);
    });

    it("degradação graciosa: sem Redis, responde direto do banco", async () => {
        const semRedis = new CacheService(() => null);
        const banco = jest.fn().mockResolvedValue("ok");
        await expect(semRedis.obterOuCarregar("x", 60, banco)).resolves.toBe("ok");
        await expect(semRedis.invalidarPorPrefixo("x")).resolves.toBeUndefined();
    });

    it("se o Redis falhar na leitura, não derruba a requisição", async () => {
        redis.get = jest.fn().mockRejectedValue(new Error("ECONNRESET"));
        const banco = jest.fn().mockResolvedValue("do-banco");
        await expect(cache.obterOuCarregar("x", 60, banco)).resolves.toBe("do-banco");
    });
});
