import IPais from "./IPais";

interface IEstado {
    id?: number;
    nome: string;
    pais?: IPais;
};

export default IEstado;