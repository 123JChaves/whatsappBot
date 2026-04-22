import RequisicaoInvalidaErro from "../../error/RequisicaoInvalida.400";

const validarCamposObrigatorios = <T>(dados: T, campos: (keyof T)[]) => {
    
    const camposVazios = campos.filter(campo => {
        const valor = dados[campo];
        return valor === undefined || valor === null || 
        (typeof valor === 'string' && valor.trim() === "")
    });

    if(camposVazios.length > 0) {
        const plural = camposVazios.length > 1;
        const listaCampos = camposVazios.join(', ');

        const mensagem = plural
            ? `Os campos (${listaCampos}) são obrigatórios!`
            : `O campo (${listaCampos}) é obrigatório!`;

        throw new RequisicaoInvalidaErro(mensagem)
    };
};
export default validarCamposObrigatorios;