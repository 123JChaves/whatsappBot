import { ObjectLiteral } from "typeorm";
import IBuscarOuCriar from "../../interfaces/IBuscarOuCriar";

const BuscarOuCriar = async <T extends ObjectLiteral>(
  opcoes: IBuscarOuCriar<T>
): Promise<T | Partial<T>> => {

  const { repositorio, dados, criterio } = opcoes;
  
  if (dados.id) return dados;

  const existente = await repositorio.findOne({ where: criterio });

  return existente || dados;
};

export default BuscarOuCriar;