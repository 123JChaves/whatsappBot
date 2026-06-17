import { Rota } from "../models/Rota";

export interface IMetaConfiguracaoResult {
    tipoDia: 'DIA_COMUM' | 'DIA_LIVRE';
    ehSegundaFeira: boolean;
    limitePlantao: number;
    rotasTarde: Rota[];
    rotasMadrugada: Rota[];
    qtdMaxRotasValidas: number;
    posicaoDoApoio: number;
}