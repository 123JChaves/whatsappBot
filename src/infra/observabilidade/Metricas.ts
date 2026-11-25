/**
 * Métricas em memória expostas em formato Prometheus em GET /metrics.
 * Contadores simples e um histograma de latência HTTP.
 */
const BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000];

const contadores = new Map<string, number>();
const histograma = new Map<string, { buckets: number[]; soma: number; total: number }>();

const chave = (nome: string, rotulos: Record<string, string | number> = {}) => {
    const r = Object.entries(rotulos).map(([k, v]) => `${k}="${String(v).replace(/"/g, "'")}"`).join(",");
    return r ? `${nome}{${r}}` : nome;
};

export function incrementar(nome: string, rotulos?: Record<string, string | number>, valor = 1) {
    const k = chave(nome, rotulos);
    contadores.set(k, (contadores.get(k) || 0) + valor);
}

export function observarLatencia(rotulos: Record<string, string | number>, ms: number) {
    const k = chave("", rotulos);
    const atual = histograma.get(k) || { buckets: BUCKETS_MS.map(() => 0), soma: 0, total: 0 };
    BUCKETS_MS.forEach((limite, i) => { if (ms <= limite) atual.buckets[i]++; });
    atual.soma += ms;
    atual.total++;
    histograma.set(k, atual);
}

export function obterContador(nome: string, rotulos?: Record<string, string | number>): number {
    return contadores.get(chave(nome, rotulos)) || 0;
}

export function renderizarPrometheus(): string {
    const linhas: string[] = [];
    linhas.push("# TYPE moove_up gauge", "moove_up 1");
    linhas.push("# TYPE moove_processo_uptime_segundos gauge", `moove_processo_uptime_segundos ${Math.round(process.uptime())}`);
    linhas.push("# TYPE moove_processo_memoria_bytes gauge", `moove_processo_memoria_bytes ${process.memoryUsage().rss}`);
    for (const [k, v] of contadores) linhas.push(`${k} ${v}`);
    for (const [rotulos, h] of histograma) {
        const base = rotulos.slice(1, -1); // remove { }
        BUCKETS_MS.forEach((limite, i) =>
            linhas.push(`moove_http_duracao_ms_bucket{${base},le="${limite}"} ${h.buckets[i]}`));
        linhas.push(`moove_http_duracao_ms_bucket{${base},le="+Inf"} ${h.total}`);
        linhas.push(`moove_http_duracao_ms_sum{${base}} ${h.soma}`);
        linhas.push(`moove_http_duracao_ms_count{${base}} ${h.total}`);
    }
    return linhas.join("\n") + "\n";
}

export function zerarMetricas() {
    contadores.clear();
    histograma.clear();
}
