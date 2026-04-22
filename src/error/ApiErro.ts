class ApiErro extends Error {
    public readonly statusDeCodigo: number;

    constructor(mensagem: string, statusDeCodigo: number) {
        super(mensagem);
        this.statusDeCodigo = statusDeCodigo;
    }
}

export default ApiErro;