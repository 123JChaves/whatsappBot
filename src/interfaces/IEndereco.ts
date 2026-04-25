import { Bairro } from "../models/Bairro";

interface IEndereco {
    id: number,
    nome: string,
    numero: number,
    bairro: Bairro;
};

export default IEndereco;