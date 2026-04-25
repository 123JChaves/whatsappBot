import { FindOptionsWhere, ObjectLiteral, Repository } from "typeorm";

interface IBuscarOuCriar<T extends ObjectLiteral> {
  repositorio: Repository<T>;
  dados: Partial<T>;
  criterio: FindOptionsWhere<T>
};

export default IBuscarOuCriar;