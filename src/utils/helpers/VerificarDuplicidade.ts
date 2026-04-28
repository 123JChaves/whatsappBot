import { FindOptionsWhere, ObjectLiteral, Not } from "typeorm"; 
import IDuplicidade from "../../interfaces/IDuplicidade"; 
import RequisicaoInvalidaErro from "../../error/RequisicaoInvalida.400"; 

/**
 * T agora é restrito a objetos que possuem a propriedade 'id'
 */
const VerificarDuplicidade = async <T extends ObjectLiteral & { id: string | number }>( 
  opcoes: IDuplicidade<T> 
): Promise<void> => { 
  const { repositorio, dados, idParaIgnorar } = opcoes; 

  if (Object.keys(dados).length === 0) return; 

  const condicao: FindOptionsWhere<T> = { ...dados } as FindOptionsWhere<T>; 

  if (idParaIgnorar !== undefined) {
    // Usamos o tipo de 'id' definido em FindOptionsWhere para manter a tipagem estrita
    condicao.id = Not(idParaIgnorar) as FindOptionsWhere<T>['id'];
  }

  const conflito = await repositorio.findOne({ where: condicao }); 

  if (conflito) { 
    const chaves = Object.keys(dados); 
    const mensagem = chaves.length > 1 
      ? `Este registro já consta no sistema.` 
      : `O campo ${chaves[0]} já está cadastrado no sistema.`; 
      
    throw new RequisicaoInvalidaErro(mensagem); 
  } 
}; 

export default VerificarDuplicidade;