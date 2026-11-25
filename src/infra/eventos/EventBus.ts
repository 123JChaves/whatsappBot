import { randomUUID } from "crypto";
import { obterAssinante, obterRedis } from "../redis/RedisClient";
import { criarLogger } from "../logger/Logger";
import { incrementar } from "../observabilidade/Metricas";

const log = criarLogger("EventBus");

/** Canais (tópicos) de eventos de domínio publicados no Redis Pub/Sub. */
export const CanaisEventos = {
    ROTA_ALTERADA: "moove.rota.alterada",
    EMPRESA_ALTERADA: "moove.empresa.alterada",
    MOTORISTA_ALTERADO: "moove.motorista.alterado",
    PASSAGEIRO_ALTERADO: "moove.passageiro.alterado",
    ESCALA_GERADA: "moove.escala.gerada",
} as const;

export type CanalEvento = (typeof CanaisEventos)[keyof typeof CanaisEventos];

export interface EnvelopeEvento<T = unknown> {
    id: string;
    tipo: CanalEvento;
    ocorridoEm: string;
    origem: string;
    dados: T;
}

export type ManipuladorEvento<T = any> = (evento: EnvelopeEvento<T>) => Promise<void> | void;

interface Publicador { publish(canal: string, mensagem: string): Promise<number>; }
interface Assinante {
    subscribe(...canais: string[]): Promise<unknown>;
    on(evento: "message", ouvinte: (canal: string, mensagem: string) => void): unknown;
}

/**
 * Barramento de eventos sobre Redis Pub/Sub.
 * - publicar(): nunca derruba a operação de negócio (fire-and-forget com log).
 * - assinar(): registra handlers; iniciar() faz o SUBSCRIBE em uma conexão dedicada.
 */
export class EventBus {
    private manipuladores = new Map<string, ManipuladorEvento[]>();
    private iniciado = false;

    constructor(
        private readonly obterPublicador: () => Publicador | null = obterRedis as unknown as () => Publicador | null,
        private readonly obterAssinanteRedis: () => Assinante | null = obterAssinante as unknown as () => Assinante | null,
        private readonly origem = `moove-backend:${process.pid}`,
    ) {}

    async publicar<T>(canal: CanalEvento, dados: T): Promise<EnvelopeEvento<T> | null> {
        const evento: EnvelopeEvento<T> = {
            id: randomUUID(),
            tipo: canal,
            ocorridoEm: new Date().toISOString(),
            origem: this.origem,
            dados,
        };
        const publicador = this.obterPublicador();
        if (!publicador) {
            log.warn({ canal, eventoId: evento.id }, "Evento NÃO publicado: Redis indisponível");
            incrementar("moove_eventos_publicados_total", { canal, resultado: "descartado" });
            return null;
        }
        try {
            const receptores = await publicador.publish(canal, JSON.stringify(evento));
            incrementar("moove_eventos_publicados_total", { canal, resultado: "ok" });
            log.info({ canal, eventoId: evento.id, receptores, dados }, "📤 Evento PUBLICADO");
            return evento;
        } catch (erro) {
            incrementar("moove_eventos_publicados_total", { canal, resultado: "erro" });
            log.error({ canal, eventoId: evento.id, erro: (erro as Error).message }, "Falha ao publicar evento");
            return null;
        }
    }

    assinar<T>(canal: CanalEvento, manipulador: ManipuladorEvento<T>): void {
        const lista = this.manipuladores.get(canal) || [];
        lista.push(manipulador as ManipuladorEvento);
        this.manipuladores.set(canal, lista);
    }

    /** Distribui uma mensagem recebida aos handlers registrados (público para facilitar testes). */
    async despachar(canal: string, mensagem: string): Promise<void> {
        let evento: EnvelopeEvento;
        try {
            evento = JSON.parse(mensagem);
        } catch {
            log.error({ canal, mensagem }, "Mensagem de evento inválida (JSON malformado)");
            return;
        }
        log.info({ canal, eventoId: evento.id, origem: evento.origem }, "📥 Evento RECEBIDO");
        incrementar("moove_eventos_recebidos_total", { canal });

        for (const manipulador of this.manipuladores.get(canal) || []) {
            try {
                await manipulador(evento);
            } catch (erro) {
                // Um handler com erro não impede os demais (isolamento de falhas)
                log.error({ canal, eventoId: evento.id, erro: (erro as Error).message }, "Erro no handler do evento");
            }
        }
    }

    async iniciar(): Promise<void> {
        if (this.iniciado) return;
        const assinante = this.obterAssinanteRedis();
        const canais = [...this.manipuladores.keys()];
        if (!assinante || canais.length === 0) {
            log.warn("Assinaturas de eventos não iniciadas (Redis indisponível ou nenhum handler registrado)");
            return;
        }
        assinante.on("message", (canal, mensagem) => { void this.despachar(canal, mensagem); });
        await assinante.subscribe(...canais);
        this.iniciado = true;
        log.info({ canais }, "Assinaturas de eventos ativas");
    }
}

export const eventBus = new EventBus();
