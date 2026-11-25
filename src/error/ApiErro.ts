class ApiErro extends Error {
    public readonly statusDeCodigo: number;

    constructor(mensagem: string, statusDeCodigo: number) {
        super(mensagem);
        this.statusDeCodigo = statusDeCodigo;
        Object.setPrototypeOf(this, new.target.prototype);
    };
};

export default ApiErro;
