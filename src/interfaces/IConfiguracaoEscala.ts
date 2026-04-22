import { TipoDia } from "./ITipos";

interface IConfiguracaoEscala {
    tipoDia: TipoDia;
    ehSegundaComum: boolean;
    qtdMaxRotas: number;
    dataReferencia: Date;
}

export default IConfiguracaoEscala;