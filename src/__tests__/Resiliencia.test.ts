import { comRetry, comTimeout, CircuitBreaker, TimeoutErro, CircuitoAbertoErro } from "../infra/resiliencia/Resiliencia";

describe("Resiliência", () => {
    it("retry: tenta novamente até ter sucesso", async () => {
        const fn = jest.fn()
            .mockRejectedValueOnce(new Error("falha 1"))
            .mockRejectedValueOnce(new Error("falha 2"))
            .mockResolvedValue("ok");
        await expect(comRetry(fn, { operacao: "teste", tentativas: 3, atrasoInicialMs: 1 })).resolves.toBe("ok");
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it("retry: desiste após o limite de tentativas", async () => {
        const fn = jest.fn().mockRejectedValue(new Error("sempre falha"));
        await expect(comRetry(fn, { operacao: "teste", tentativas: 2, atrasoInicialMs: 1 })).rejects.toThrow("sempre falha");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("timeout: rejeita operações lentas", async () => {
        const lenta = new Promise((r) => setTimeout(r, 200));
        await expect(comTimeout(lenta, 10, "lenta")).rejects.toBeInstanceOf(TimeoutErro);
    });

    it("circuit breaker: abre após N falhas e rejeita rapidamente", async () => {
        const cb = new CircuitBreaker("whatsapp", 2, 60_000);
        const falha = () => Promise.reject(new Error("offline"));
        await expect(cb.executar(falha)).rejects.toThrow();
        await expect(cb.executar(falha)).rejects.toThrow();
        expect(cb.estado).toBe("ABERTO");
        await expect(cb.executar(() => Promise.resolve(1))).rejects.toBeInstanceOf(CircuitoAbertoErro);
    });
});
