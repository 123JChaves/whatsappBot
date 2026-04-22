import ApiErro from "./ApiErro";

class NaoEncontradoErro extends ApiErro {
    constructor (mensagem = 'Recurso não encontrado!' ) {
        super(mensagem, 404)
    };
};

export default NaoEncontradoErro;