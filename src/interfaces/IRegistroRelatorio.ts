interface IRegistroRelatorio {
    posicao: number;
    motorista: {
    id: number;
    nome: string;
    };
    isPenalizado: boolean;
};

export default IRegistroRelatorio