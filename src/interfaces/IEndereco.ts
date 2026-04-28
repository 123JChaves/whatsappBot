import IBairro from "./IBairro";

interface IEndereco {
    id?: number,
    nome: string,
    numero: number,
    bairro?: IBairro;
};

export default IEndereco;