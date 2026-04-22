import ApiErro from './ApiErro';

class RequisicaoInvalidaErro extends ApiErro {
    constructor(mensagem = 'Dados Inválidos!') {
        super(mensagem, 400);
    };
};

export default RequisicaoInvalidaErro;