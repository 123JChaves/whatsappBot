import { criarLogger } from "../logger/Logger";

const log = criarLogger("Resiliencia");

export class TimeoutErro extends Error {
    constructor(operacao: string, ms: number) {
        super(`Timeout de ${ms}ms excedido em "${operacao}"`);
        this.name = "TimeoutErro";
    }
}

export class CircuitoAbertoErro extends Error {
    constructor(nome: string) {
        super(`Circuit breaker "${nome}" está ABERTO: chamada rejeitada para proteger o sistema`);
        this.name = "CircuitoAbertoErro";
    }
}

/**
 * TIMEOUT: impede que uma dependência lenta (MySQL, Redis, WhatsApp) prenda a requisição.
 */
export async function comTimeout<T>(promessa: Promise<T>, ms: number, operacao: string): Promise<T> {
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => rejeitar(new TimeoutErro(operacao, ms)), ms);
    });
    try {
        return await Promise.race([promessa, limite]);
    } finally {
        if (temporizador) clearTimeout(temporizador);
    }
}

export interface OpcoesRetry {
    operacao: string;
    tentativas?: number;          // total de tentativas (incluindo a primeira)
    atrasoInicialMs?: number;     // atraso antes da 2ª tentativa
    fatorMultiplicador?: number;  // backoff exponencial
    atrasoMaximoMs?: number;
    deveRetentar?: (erro: unknown) => boolean;
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * RETRY com backoff exponencial + jitter: absorve falhas transitórias
 * (ex.: MySQL ainda subindo no container, queda momentânea de rede).
 */
export async function comRetry<T>(fn: () => Promise<T>, opcoes: OpcoesRetry): Promise<T> {
    const {
        operacao,
        tentativas = 3,
        atrasoInicialMs = 200,
        fatorMultiplicador = 2,
        atrasoMaximoMs = 5000,
        deveRetentar = () => true,
    } = opcoes;

    let ultimoErro: unknown;
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
        try {
            return await fn();
        } catch (erro) {
            ultimoErro = erro;
            if (tentativa === tentativas || !deveRetentar(erro)) break;

            const base = Math.min(atrasoInicialMs * Math.pow(fatorMultiplicador, tentativa - 1), atrasoMaximoMs);
            const atraso = Math.round(base / 2 + Math.random() * (base / 2)); // jitter
            log.warn({ operacao, tentativa, proximaEmMs: atraso, erro: (erro as Error)?.message }, "Falha transitória, nova tentativa agendada");
            await esperar(atraso);
        }
    }
    log.error({ operacao, tentativas, erro: (ultimoErro as Error)?.message }, "Todas as tentativas falharam");
    throw ultimoErro;
}

type EstadoCircuito = "FECHADO" | "ABERTO" | "MEIO_ABERTO";

/**
 * CIRCUIT BREAKER: após N falhas seguidas, para de chamar a dependência por um tempo
 * (falha rápida), evitando efeito cascata. Depois testa uma chamada (MEIO_ABERTO).
 */
export class CircuitBreaker {
    private estadoAtual: EstadoCircuito = "FECHADO";
    private falhasConsecutivas = 0;
    private abertoEm = 0;

    constructor(
        private readonly nome: string,
        private readonly limiteFalhas = 5,
        private readonly tempoAbertoMs = 30_000,
    ) {}

    get estado(): EstadoCircuito {
        if (this.estadoAtual === "ABERTO" && Date.now() - this.abertoEm >= this.tempoAbertoMs) {
            this.estadoAtual = "MEIO_ABERTO";
        }
        return this.estadoAtual;
    }

    async executar<T>(fn: () => Promise<T>): Promise<T> {
        if (this.estado === "ABERTO") throw new CircuitoAbertoErro(this.nome);
        try {
            const resultado = await fn();
            this.registrarSucesso();
            return resultado;
        } catch (erro) {
            this.registrarFalha(erro);
            throw erro;
        }
    }

    private registrarSucesso() {
        if (this.estadoAtual !== "FECHADO") log.info({ circuito: this.nome }, "Circuit breaker FECHADO novamente");
        this.estadoAtual = "FECHADO";
        this.falhasConsecutivas = 0;
    }

    private registrarFalha(erro: unknown) {
        this.falhasConsecutivas++;
        if (this.estadoAtual === "MEIO_ABERTO" || this.falhasConsecutivas >= this.limiteFalhas) {
            this.estadoAtual = "ABERTO";
            this.abertoEm = Date.now();
            log.error({ circuito: this.nome, falhas: this.falhasConsecutivas, erro: (erro as Error)?.message }, "Circuit breaker ABERTO");
        }
    }
}
