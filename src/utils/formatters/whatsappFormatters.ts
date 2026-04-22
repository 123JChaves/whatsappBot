import { ListaJoia } from "../../models/ListaJoia";
import { RotasAtribuidas } from "../../models/RotasAtribuidas";

export function formatarEscalaParaWhatsApp(atribuicoes: RotasAtribuidas[], listaReferencia: ListaJoia): string {
    // Garantir que 'dia' seja um objeto Date (evita erro caso venha como string do banco)
    const dataObj = new Date(listaReferencia.dia);
    
    // 1. Identifica se a lista base é de um sábado para aplicar regra de 5 plantonistas
    const eSabado = dataObj.getDay() === 6;
    const limitePlantao = eSabado ? 5 : 4;

    // 2. Separação dos dados por tipo e período
    const rotasTarde = atribuicoes.filter(a => a.rota.tipo_rota === 'ROTA_TARDE' && a.rota.tipo !== 'APOIO');
    const rotasMadrugada = atribuicoes.filter(a => a.rota.tipo_rota === 'ROTA_MADRUGADA');
    const motoristaApoio = atribuicoes.find(a => a.rota.tipo === 'APOIO');

    // --- MONTAGEM DA MENSAGEM ---
    // Corrigido: usando 'identificador' em vez de 'tipoLista'
    let mensagem = `*📋 ESCALA - ${dataObj.toLocaleDateString('pt-BR')}*\n`;
    mensagem += `*Tipo:* ${listaReferencia.identificador.replace('_', ' ')}\n\n`;

    // LISTA 1: PLANTÃO (Baseado nos primeiros das rotas de madrugada)
    mensagem += `*🚔 PLANTÃO (MADRUGADA + APOIO):*\n`;
    
    // Pegamos os motoristas das primeiras rotas da madrugada (únicos)
    const plantonistas = [...new Set(rotasMadrugada.slice(0, limitePlantao).map(a => a.motorista.nome))];
    
    plantonistas.forEach((nome, i) => {
        mensagem += `${i + 1}º - ${nome}\n`;
    });

    if (motoristaApoio) {
        mensagem += `APOIO - ${motoristaApoio.motorista.nome}\n`;
    }

    // LISTA 2: ROTAS DA TARDE
    mensagem += `\n*☀️ ROTAS DA TARDE:*\n`; // Corrigido emoji de sol
    if (rotasTarde.length > 0) {
        rotasTarde.forEach(a => {
            mensagem += `• ${a.rota.nome}: ${a.motorista.nome}\n`;
        });
    } else {
        mensagem += `_Sem rotas para tarde_\n`;
    }

    // LISTA 3: ROTAS DA MADRUGADA
    mensagem += `\n*🌙 ROTAS DA MADRUGADA:*\n`;
    if (rotasMadrugada.length > 0) {
        rotasMadrugada.forEach(a => {
            mensagem += `• ${a.rota.nome}: ${a.motorista.nome}\n`;
        });
    } else {
        mensagem += `_Sem rotas para madrugada_\n`;
    }

    return mensagem;
}