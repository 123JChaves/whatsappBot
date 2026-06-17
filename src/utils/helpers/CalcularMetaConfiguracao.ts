import { AppDataSource } from "../../data-source";
import { IMetaConfiguracaoResult } from "../../interfaces/IMetaConfiguracaoResult";
import { DiasTipo } from "../../models/DiasTipo";
import { Rota } from "../../models/Rota";
import ordenarRotasMatematicamente from "./OrdenarRotasMatematicamente";


const calcularMetaConfiguracao = async (dataAlvo: Date): Promise<IMetaConfiguracaoResult> => {
    const diasTipoRepositorio = AppDataSource.getRepository(DiasTipo);
    const rotaRepositorio = AppDataSource.getRepository(Rota);

    // Extrai o texto puro AAAA-MM-DD para evitar problemas de fuso horário com o banco
    const ano = dataAlvo.getFullYear();
    const mes = String(dataAlvo.getMonth() + 1).padStart(2, '0');
    const dia = String(dataAlvo.getDate()).padStart(2, '0');
    const dataIsoStringStr = `${ano}-${mes}-${dia}`;

    // Busca o tipo de dia no calendário manual do banco de dados
    const registroManual = await diasTipoRepositorio.createQueryBuilder("dias")
        .where("DATE(dias.data) = :dataIsoStringStr", { dataIsoStringStr })
        .getOne();
    
    let tipoDia: 'DIA_COMUM' | 'DIA_LIVRE' = (dataAlvo.getDay() === 0 || dataAlvo.getDay() === 6) ? 'DIA_LIVRE' : 'DIA_COMUM';
    if (registroManual) {
        tipoDia = registroManual.tipo as any;
    }

    const ehSegundaFeira = dataAlvo.getDay() === 1 && tipoDia === 'DIA_COMUM';
    const limitePlantao = ehSegundaFeira ? 5 : 4;

    // Busca as listas de rotas cadastradas no sistema
    const [rotasTardeBrutas, rotasMadrugadaBrutas] = await Promise.all([
        rotaRepositorio.find({ where: { tipo_rota: 'ROTA_TARDE' } }),
        rotaRepositorio.find({ where: { tipo_rota: 'ROTA_MADRUGADA' } })
    ]);

    const rotasTarde = ordenarRotasMatematicamente(rotasTardeBrutas);
    const rotasMadrugada = ordenarRotasMatematicamente(rotasMadrugadaBrutas);

    const totalTarde = rotasTarde.length;
    const totalMadrugada = rotasMadrugada.length;

    // 🚀 A SUA REGRA MATEMÁTICA EXATA PARA A DEFINIÇÃO DO APOIO NA ESCALA:
    let posicaoDoApoio = 0;
    if (totalTarde > totalMadrugada) {
        posicaoDoApoio = totalTarde; // Coincide com a última rota da tarde
    } else {
        // Trata os cenários: (totalTarde < totalMadrugada) e (totalTarde === totalMadrugada)
        posicaoDoApoio = totalMadrugada + 1; 
    }

    const qtdMaxRotasValidas = Math.max(totalTarde, totalMadrugada);

    return {
        tipoDia, 
        ehSegundaFeira,
        limitePlantao,
        rotasTarde,
        rotasMadrugada,
        qtdMaxRotasValidas,
        posicaoDoApoio
    };
};

export default calcularMetaConfiguracao;