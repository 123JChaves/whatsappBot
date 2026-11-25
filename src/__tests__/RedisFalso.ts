/** Dublê de teste em memória que imita o subconjunto do Redis usado pela aplicação. */
export class RedisFalso {
    dados = new Map<string, { valor: string; expiraEm: number }>();
    chamadasGet = 0;
    publicados: { canal: string; mensagem: string }[] = [];
    private ouvintes: ((canal: string, mensagem: string) => void)[] = [];

    async get(chave: string) {
        this.chamadasGet++;
        const item = this.dados.get(chave);
        if (!item || item.expiraEm < Date.now()) return null;
        return item.valor;
    }
    async set(chave: string, valor: string, _modo: "EX", segundos: number) {
        this.dados.set(chave, { valor, expiraEm: Date.now() + segundos * 1000 });
        return "OK";
    }
    async del(...chaves: string[]) {
        let n = 0;
        chaves.forEach((c) => { if (this.dados.delete(c)) n++; });
        return n;
    }
    async scan(_cursor: string | number, _match: string, padrao: string): Promise<[string, string[]]> {
        const prefixo = String(padrao).replace(/\*$/, "");
        return ["0", [...this.dados.keys()].filter((k) => k.startsWith(prefixo))];
    }
    ttlDe(chave: string) {
        const item = this.dados.get(chave);
        return item ? Math.round((item.expiraEm - Date.now()) / 1000) : -2;
    }
    // Pub/Sub
    async publish(canal: string, mensagem: string) {
        this.publicados.push({ canal, mensagem });
        this.ouvintes.forEach((o) => o(canal, mensagem));
        return this.ouvintes.length;
    }
    async subscribe(..._canais: string[]) { return _canais.length; }
    on(_evento: "message", ouvinte: (canal: string, mensagem: string) => void) { this.ouvintes.push(ouvinte); return this; }
}
