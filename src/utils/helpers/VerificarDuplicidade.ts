import { ObjectLiteral, FindOptionsWhere } from "typeorm";
import IDuplicidade from "../../interfaces/IDuplicidade";
import RequisicaoInvalidaErro from "../../error/RequisicaoInvalida.400";

const VerificarDuplicidade = async <T extends ObjectLiteral>(

    opcoes: IDuplicidade<T>

): Promise<void> => {

    const { repositorio, dados, idParaIgnorar } = opcoes;
    const chaves = Object.keys(dados) as (keyof T)[];
    const condicoes = chaves.map(chave => ({ [chave]: dados[chave] })
    ) as FindOptionsWhere<T>[];

    if(condicoes.length === 0) return;

    const conflito = await repositorio.findOne({ where: condicoes });
    if(conflito) {
        const conflitoRegistro = conflito as Record<string, unknown>
        if(idParaIgnorar === undefined || conflitoRegistro.id !== idParaIgnorar) {
            const campoConflito = chaves.find((chave) => conflito[chave] === dados[chave]);
            throw new RequisicaoInvalidaErro(
                `O campo ${String(campoConflito)} já está cadastrado no sistema`
            );
        };
    };
};

export default VerificarDuplicidade;