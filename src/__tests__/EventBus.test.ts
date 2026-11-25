import { EventBus, CanaisEventos } from "../infra/eventos/EventBus";
import { RedisFalso } from "./RedisFalso";

describe("EventBus (Redis Pub/Sub)", () => {
    it("publica um envelope e entrega ao assinante do canal", async () => {
        const redis = new RedisFalso();
        const barramento = new EventBus(() => redis, () => redis, "teste");
        const recebidos: any[] = [];

        barramento.assinar(CanaisEventos.ROTA_ALTERADA, (evento) => { recebidos.push(evento); });
        await barramento.iniciar();
        await barramento.publicar(CanaisEventos.ROTA_ALTERADA, { rotaId: 10, acao: "EDITADA" });
        await new Promise((r) => setImmediate(r));

        expect(redis.publicados).toHaveLength(1);
        expect(recebidos).toHaveLength(1);
        expect(recebidos[0]).toMatchObject({ tipo: "moove.rota.alterada", origem: "teste", dados: { rotaId: 10 } });
        expect(recebidos[0].id).toBeDefined();
    });

    it("erro em um handler não impede os demais", async () => {
        const barramento = new EventBus(() => null, () => null);
        const segundo = jest.fn();
        barramento.assinar(CanaisEventos.ESCALA_GERADA, () => { throw new Error("falhou"); });
        barramento.assinar(CanaisEventos.ESCALA_GERADA, segundo);

        await barramento.despachar("moove.escala.gerada", JSON.stringify({ id: "1", dados: {} }));
        expect(segundo).toHaveBeenCalled();
    });

    it("sem Redis, publicar não lança erro (fire-and-forget)", async () => {
        const barramento = new EventBus(() => null, () => null);
        await expect(barramento.publicar(CanaisEventos.MOTORISTA_ALTERADO, {})).resolves.toBeNull();
    });
});
