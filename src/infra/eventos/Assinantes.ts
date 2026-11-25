import { cache, ChavesCache } from "../cache/CacheService";
import { CanaisEventos, EventBus, eventBus } from "./EventBus";
import { criarLogger } from "../logger/Logger";

const log = criarLogger("Assinantes");

/**
 * Consumidores dos eventos de domínio.
 * A invalidação via evento garante consistência mesmo com VÁRIAS instâncias do back-end
 * (cada instância recebe o evento e limpa o que for necessário), e o log de auditoria
 * comprova a circulação das mensagens.
 */
export function registrarAssinantes(barramento: EventBus = eventBus): void {
    barramento.assinar(CanaisEventos.ROTA_ALTERADA, async (evento) => {
        await cache.invalidarPorPrefixo(ChavesCache.PREFIXO_ROTAS);
        log.info({ eventoId: evento.id, dados: evento.dados }, "Rotas: cache sincronizado após evento");
    });

    barramento.assinar(CanaisEventos.EMPRESA_ALTERADA, async (evento) => {
        // Rotas embutem dados de empresas -> invalida os dois contextos
        await cache.invalidarPorPrefixo(ChavesCache.PREFIXO_EMPRESAS);
        await cache.invalidarPorPrefixo(ChavesCache.PREFIXO_ROTAS);
        log.info({ eventoId: evento.id, dados: evento.dados }, "Empresas: cache sincronizado após evento");
    });

    barramento.assinar(CanaisEventos.MOTORISTA_ALTERADO, async (evento) => {
        await cache.invalidarPorPrefixo(ChavesCache.PREFIXO_MOTORISTAS);
        log.info({ eventoId: evento.id, dados: evento.dados }, "Motoristas: cache sincronizado após evento");
    });

    barramento.assinar(CanaisEventos.PASSAGEIRO_ALTERADO, async (evento) => {
        await cache.invalidarPorPrefixo(ChavesCache.PREFIXO_ROTAS);
        log.info({ eventoId: evento.id, dados: evento.dados }, "Passageiros: rotas sincronizadas após evento");
    });

    barramento.assinar(CanaisEventos.ESCALA_GERADA, async (evento) => {
        log.info({ eventoId: evento.id, dados: evento.dados }, "📋 Auditoria: escala gerada/refeita");
    });
}
