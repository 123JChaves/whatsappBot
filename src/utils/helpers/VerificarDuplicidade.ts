import { FindOptionsWhere, ObjectLiteral, Not } from "typeorm"; 
import IDuplicidade from "../../interfaces/IDuplicidade"; 
import RequisicaoInvalidaErro from "../../error/RequisicaoInvalida.400"; 

const VerificarDuplicidade = async <T extends ObjectLiteral & { id: string | number }>( 
  opcoes: IDuplicidade<T> 
): Promise<void> => { 
  const { repositorio, dados, idParaIgnorar } = opcoes; 
  const chaves = Object.keys(dados); 
  if (chaves.length === 0) return; 
  const condicoes = chaves.map((chave) => {
    const condicaoIndividual: FindOptionsWhere<T> = { 
      [chave]: dados[chave] 
    } as FindOptionsWhere<T>;
    if (idParaIgnorar !== undefined) {
      condicaoIndividual.id = Not(idParaIgnorar) as FindOptionsWhere<T>['id'];
    }
    return condicaoIndividual;
  });
  const conflito = await repositorio.findOne({ where: condicoes }); 
  if (conflito) { 
    // Descobre qual dos campos específicos causou o conflito comparando os valores
    const campoConflitante = chaves.find(
      (chave) => String(conflito[chave]) === String(dados[chave])
    );
    const mensagem = campoConflitante 
      ? `O campo ${campoConflitante} já está cadastrado no sistema.`
      : `Este registro já consta no sistema.`;      
    throw new RequisicaoInvalidaErro(mensagem); 
  } 
}; 

export default VerificarDuplicidade;
