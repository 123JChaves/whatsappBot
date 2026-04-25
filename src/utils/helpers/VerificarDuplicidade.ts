import { FindOptionsWhere, ObjectLiteral } from "typeorm";
import IDuplicidade from "../../interfaces/IDuplicidade";
import RequisicaoInvalidaErro from "../../error/RequisicaoInvalida.400";

const VerificarDuplicidade = async <T extends ObjectLiteral>(
    opcoes: IDuplicidade<T>
): Promise<void> => {
    const { repositorio, dados, idParaIgnorar } = opcoes;

    // Em vez de mapear para um array (OR), usamos o objeto direto (AND)
    const condicao = dados as FindOptionsWhere<T>;

    if (Object.keys(dados).length === 0) return;

    // Busca um registro que combine todos os campos enviados
    const conflito = await repositorio.findOne({ where: condicao });

    if (conflito) {
        const conflitoRegistro = conflito as Record<string, unknown>;
        
        if (idParaIgnorar === undefined || conflitoRegistro.id !== idParaIgnorar) {
            // Personaliza a mensagem para casos compostos ou simples
            const chaves = Object.keys(dados);
            const mensagem = chaves.length > 1 
                ? `Este registro já consta no sistema.`
                : `O campo ${chaves[0]} já está cadastrado no sistema.`;

            throw new RequisicaoInvalidaErro(mensagem);
        }
    }
};

export default VerificarDuplicidade;