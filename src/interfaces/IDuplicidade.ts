import { ObjectLiteral, Repository } from "typeorm";

interface IDuplicidade <T extends ObjectLiteral> {
    repositorio: Repository<T>;
    dados: Partial<T>;
    idParaIgnorar?: number;
}

export default IDuplicidade;