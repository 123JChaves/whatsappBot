import ICidade from "./ICidade";

interface IBairro {
    id?: number
    nome: string; 
    cidade?: ICidade;
};

export default IBairro;