import { AppDataSource } from "../../data-source"; 
import { OrdemJoinha } from "../../models/OrdemJoinha"; 
import { Rota } from "../../models/Rota"; 
import { RotaAtribuida } from "../../models/RotaAtribuida"; 
import { Motorista } from "../../models/Motorista"; 
import { ListaJoia } from "../../models/ListaJoia"; 
import { DiasTipo } from "../../models/DiasTipo"; 
import { ListaRota } from "../../models/ListaRota"; 
import { Repository } from "typeorm"; 
import { TipoDia, PeriodoRota } from "../../interfaces/ITipos"; 
import IConfiguracaoEscala from "../../interfaces/IConfiguracaoEscala"; 
import IRotasAtivas from "../../interfaces/IRotasAtivas"; 
import IRegistroRelatorio from "../../interfaces/IRegistroRelatorio"; 
import MotoristaService from "../MotoristaService";
import formatarDataIsoPura from "../../utils/formatters/formatarDataPorDia";
import IContagemRotas from "../../interfaces/IContagemRotas";
import filtrarERecalcularEscala from "../../utils/helpers/FiltrarOuRecalcularEscala";
import calcularMetaConfiguracao from "../../utils/helpers/CalcularMetaConfiguracao";
import calcularPosicaoApoio from "../../utils/helpers/CalcularPosicaoApoio";

export class EscalaService { 
  private readonly LIMITE_PLANTAO_PADRAO = 4; 
  private readonly LIMITE_PLANTAO_SEGUNDA = 5; 
  private readonly DIA_SEMANA_SEGUNDA = 1; 

  private readonly ordemRepositorio: Repository<OrdemJoinha> = AppDataSource.getRepository(OrdemJoinha); 
  private readonly rotaRepositorio: Repository<Rota> = AppDataSource.getRepository(Rota); 
  private readonly atribuicaoRepositorio: Repository<RotaAtribuida> = AppDataSource.getRepository(RotaAtribuida); 
  private readonly listaRepositorio: Repository<ListaJoia> = AppDataSource.getRepository(ListaJoia); 
  private readonly diasTipoRepositorio: Repository<DiasTipo> = AppDataSource.getRepository(DiasTipo); 
  private readonly listaRotaRepositorio: Repository<ListaRota> = AppDataSource.getRepository(ListaRota); 

  private obterNomeDiaSemana(data: Date): string {
    const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    return dias[data.getDay()];
  }
  /**
   * Processador Principal: Orquestra a geração da escala cruzando a fila e rotas ativas.
   */
  async gerarEscalaCompleta(listaId: number): Promise<string> { 
  const listaJoinha = await this.buscarListaOuFalhar(listaId); 
  const motoristasFilaOriginal = await this.obterMotoristasOrdenados(listaId); 
  const { rotasTarde, rotasMadrugada } = await this.obterTodasAsRotasAtivas(); 
  const qtdMaxRotas = Math.max(rotasTarde.length, rotasMadrugada.length); 

  const dataMadrugadaAlvo = this.calcularDataFutura(listaJoinha.dia, 2); 
  const tipoDia = await this.identificarTipoDia(dataMadrugadaAlvo); 
  const ehSegundaComum = this.verificarSeEhSegundaComum(dataMadrugadaAlvo, tipoDia); 

  const contagemRotas = { qtdTarde: rotasTarde.length, qtdMadrugada: rotasMadrugada.length };
  
  // 🎯 Aplica a sua regra de negócio exata
  const posicaoApoioReal = calcularPosicaoApoio(contagemRotas);
  const indiceApoioReal = posicaoApoioReal - 1; // Converte posição humana para índice de Array (0-based)

  let motoristasFilaProcessada = [...motoristasFilaOriginal];

  // Move o motorista da vaga do apoio para o final das rotas ativas no banco
  if (tipoDia === 'DIA_COMUM' && motoristasFilaProcessada.length > indiceApoioReal) { 
    const apoioArray = motoristasFilaProcessada.splice(indiceApoioReal, 1); 
    const novaPosicao = Math.min(qtdMaxRotas, motoristasFilaProcessada.length); 
    motoristasFilaProcessada.splice(novaPosicao, 0, ...apoioArray); 
  }

  await this.limparAtribuicoesAnteriores(listaId); 

  await this.gravarEscalaNoBanco( 
    motoristasFilaProcessada, 
    { rotasTarde, rotasMadrugada }, 
    listaJoinha, 
    tipoDia, 
    qtdMaxRotas 
  ); 

  return this.montarRelatorioWhatsapp(
    motoristasFilaProcessada, 
    { tipoDia, ehSegundaComum, qtdMaxRotas, dataReferencia: dataMadrugadaAlvo }, 
    listaJoinha.dia,
    contagemRotas
  ); 
}

  static async obterMotoristaApoioEscalaMae(ano: number, mes: number, dia: number): Promise<any | null> {
    // 1. CÁLCULO TEMPORAL DO DIA X - 2 (Escala Mãe)
    const dataEscalaMaeAlvo = new Date(ano, mes, dia -2, 12, 0, 0, 0);
    
    // Extrai o texto puro AAAA-MM-DD para neutralizar qualquer interferência de fuso horário
    const anoStr = dataEscalaMaeAlvo.getFullYear();
    const mesStr = String(dataEscalaMaeAlvo.getMonth() + 1).padStart(2, '0');
    const diaStr = String(dataEscalaMaeAlvo.getDate()).padStart(2, '0');
    const dataIsoStringStr = `${anoStr}-${mesStr}-${diaStr}`;

    // Busca a lista de origem comparando a data limpa gerada pelo Node.js
    const listaEscalaMae = await AppDataSource.getRepository(ListaJoia).createQueryBuilder("listaMae")
        .where("DATE(listaMae.dia) = :dataIsoStringStr", { dataIsoStringStr })
        .getOne();

    if (!listaEscalaMae) return null;

    // 2. Busca a fila de joinhas daquela escala mãe
    const filaJoinhasMae = await AppDataSource.getRepository(OrdemJoinha).find({
        where: { listaJoia: { id: listaEscalaMae.id } },
        relations: ["motorista"],
        order: { 
            isPenalizado: "ASC",
            posicaoEfetiva: "ASC",
            horaDoJoinha: "ASC"
        }
    });

    // Filtra removendo quem não pode fazer rota
    const filaFiltradaValida = filaJoinhasMae.filter(reg => reg.motorista?.podeFazerRota !== false);

    // 3. Calcula as metas baseadas nas listas daquele dia antigo (X - 2)
    const metaMae = await calcularMetaConfiguracao(dataEscalaMaeAlvo);
    if (!metaMae) return null;

    // 4. Mapeia a categoria baseando-se estritamente na Posição do Apoio calculada pela regra
    const dadosFilaMapeada = filaFiltradaValida.map((reg, index) => {
        const posicao = index + 1;
        let category: "PLANTAO" | "ROTA" | "APOIO" | "BACKUP" | "LIVRE" = "BACKUP";

        if (metaMae.tipoDia === 'DIA_COMUM') {
            if (posicao <= metaMae.limitePlantao) {
                category = "PLANTAO";
            } else if (posicao === metaMae.posicaoDoApoio) {
                category = "APOIO"; 
            } else if (posicao > metaMae.limitePlantao && posicao <= metaMae.qtdMaxRotasValidas) {
                category = "ROTA"; 
            }
        } else {
            if (posicao <= metaMae.limitePlantao) category = "PLANTAO";
            else category = "LIVRE";
        }

        return {
            categoria: category,
            isApoioManual: reg.isApoioManual || false,
            motorista: reg.motorista
        };
    });

    // 5. Retorna o motorista correto do Apoio destacado
    const apoioManual = dadosFilaMapeada.find(p => p.isApoioManual === true);
    if (apoioManual && apoioManual.motorista) return apoioManual.motorista;

    const tipoApoioComum = dadosFilaMapeada.find(p => p.categoria === "APOIO");
    if (tipoApoioComum && tipoApoioComum.motorista) return tipoApoioComum.motorista;

    return null;
  }

  private async identificarTipoDia(data: Date): Promise<TipoDia> { 
    const dataIso = formatarDataIsoPura(data);
    const registroManual = await this.diasTipoRepositorio.createQueryBuilder("diasTipo")
      .where("DATE(diasTipo.data) = :dataIso", { dataIso })
      .getOne();

    if (registroManual) return registroManual.tipo; 

    const diaSemana = data.getDay(); 
    return (diaSemana === 0 || diaSemana === 6) ? 'DIA_LIVRE' : 'DIA_COMUM'; 
  }
  
  /**
   * GRAVAÇÃO INTELIGENTE: Aplica as regras complexas de restrição de rotas (podeFazerRota === false)
   * e as travas de plantão elástico por calendário comercial.
   */
  private async gravarEscalaNoBanco( 
    motoristas: OrdemJoinha[], 
    rotas: IRotasAtivas, 
    lista: ListaJoia, 
    tipo: TipoDia, 
    qtdMax: number 
  ): Promise<void> { 
    const novasAtribuicoes: RotaAtribuida[] = []; 
    const dataTarde = this.calcularDataFutura(lista.dia, 1); 
    const dataMadrugada = this.calcularDataFutura(lista.dia, 2); 

    // Inicialização regulamentar das tabelas de turnos legadas do sistema
    let listaRotaTarde = await this.listaRotaRepositorio.findOneBy({ dataReferencia: dataTarde, tipo_lista: 'ROTA_TARDE' }); 
    if (!listaRotaTarde) { 
      listaRotaTarde = this.listaRotaRepositorio.create({ 
        nomeLista: `Escala Tarde - ${dataTarde.getDate()}`, dataReferencia: dataTarde, tipo_lista: 'ROTA_TARDE' 
      }); 
      await this.listaRotaRepositorio.save(listaRotaTarde); 
    } 

    let listaRotaMadrugada = await this.listaRotaRepositorio.findOneBy({ dataReferencia: dataMadrugada, tipo_lista: 'ROTA_MADRUGADA' }); 
    if (!listaRotaMadrugada) { 
      listaRotaMadrugada = this.listaRotaRepositorio.create({ 
        nomeLista: `Escala Madrugada - ${dataMadrugada.getDate()}`, dataReferencia: dataMadrugada, tipo_lista: 'ROTA_MADRUGADA' 
      }); 
      await this.listaRotaRepositorio.save(listaRotaMadrugada); 
    } 

    let listaRotaTardeDiaSeguinte = await this.listaRotaRepositorio.findOneBy({ dataReferencia: dataMadrugada, tipo_lista: 'ROTA_TARDE' });
    if (!listaRotaTardeDiaSeguinte) {
      listaRotaTardeDiaSeguinte = this.listaRotaRepositorio.create({
        nomeLista: `Escala Tarde - ${dataMadrugada.getDate()}`, dataReferencia: dataMadrugada, tipo_lista: 'ROTA_TARDE' 
      });
      await this.listaRotaRepositorio.save(listaRotaTardeDiaSeguinte);
    }

    // Separa os motoristas baseando-se na habilitação de rotas para processamento molecular
    // Como default é false, apenas quem tiver 'true' de fato popula as rotas físicas
    const habilitadosParaRota = motoristas.filter(m => m.motorista?.podeFazerRota === true);

    // 1. ATRIBUIÇÃO AUTOMÁTICA DE ROTAS DA TARDE (Apenas motoristas habilitados populam as rotas)
    rotas.rotasTarde.forEach((rota, index) => {
      const registroMotorista = habilitadosParaRota[index];
      if (registroMotorista) {
        novasAtribuicoes.push(
          this.criarInstanciaAtribuicao(lista, registroMotorista.motorista, rota, listaRotaTarde, dataTarde, "ROTA")
        );
      }
    });

    // 2. ATRIBUIÇÃO AUTOMÁTICA DE ROTAS DA MADRUGADA (Apenas motoristas habilitados populam as rotas)
    rotas.rotasMadrugada.forEach((rota, index) => {
      const registroMotorista = habilitadosParaRota[index];
      if (registroMotorista) {
        novasAtribuicoes.push(
          this.criarInstanciaAtribuicao(lista, registroMotorista.motorista, rota, listaRotaMadrugada, dataMadrugada, "ROTA")
        );
      }
    });

        // 3. CLASSIFICAÇÃO INDIVIDUAL DE CATEGORIAS NO BANCO DE DADOS
    motoristas.forEach((registro, index) => { 
      const posicaoEfetiva = index + 1; 
      const ehRestritoRota = registro.motorista?.podeFazerRota === false;

      // 🔒 SE O MOTORISTA FOR APOIO MANUAL: Trava o fluxo e impede que o sistema mude ele de lugar
      if (registro.isApoioManual === true) {
        registro.posicaoEfetiva = qtdMax + 1;
        registro.posicao = qtdMax + 1;
        return;
      }

      const limitePlantao = (dataMadrugada.getDay() === this.DIA_SEMANA_SEGUNDA && tipo === 'DIA_COMUM') 
        ? this.LIMITE_PLANTAO_SEGUNDA 
        : this.LIMITE_PLANTAO_PADRAO;

      if (tipo === 'DIA_COMUM') {
        if (posicaoEfetiva <= limitePlantao) return; 

        // Se a vaga for a do Apoio e já houver alguém travado lá manualmente, pula
        if (posicaoEfetiva === qtdMax + 1) { 
          const ultimaRotaTarde = rotas.rotasTarde[rotas.rotasTarde.length - 1]; 
          if (ultimaRotaTarde && !ehRestritoRota) { 
            novasAtribuicoes.push(
              this.criarInstanciaAtribuicao(lista, registro.motorista, ultimaRotaTarde, listaRotaTardeDiaSeguinte, dataMadrugada, "APOIO")
            ); 
          } 
        }
      } else {
        // Dias livres empurram os motoristas sem rota para o fim
        if (ehRestritoRota) {
          registro.posicaoEfetiva = qtdMax + 50 + index; 
        }
      }
    });

    // Persiste as novas instâncias organizadas no banco em lotes otimizados
    if (novasAtribuicoes.length > 0) { 
      const tamanhoBloco = 100;
      for (let i = 0; i < novasAtribuicoes.length; i += tamanhoBloco) {
        const bloco = novasAtribuicoes.slice(i, i + tamanhoBloco);
        await this.atribuicaoRepositorio.save(bloco); 
      }
    } 
  }

  private criarInstanciaAtribuicao( 
    lista: ListaJoia, 
    motorista: Motorista, 
    rota: Rota, 
    listaRota: ListaRota, 
    data: Date, 
    tipo: "ROTA" | "APOIO" | "PLANTAO" 
  ): RotaAtribuida { 
    return this.atribuicaoRepositorio.create({ 
      listaJoia: lista, 
      motorista, 
      rota, 
      listaRota, 
      dataGeracao: data, 
      tipoAtribuicao: tipo 
    }); 
  } 

  private async obterTodasAsRotasAtivas(): Promise<IRotasAtivas> { 
    const [rotasTarde, rotasMadrugada] = await Promise.all([ 
      this.obterRotasPorPeriodo('ROTA_TARDE'), 
      this.obterRotasPorPeriodo('ROTA_MADRUGADA') 
    ]); 
    return { rotasTarde, rotasMadrugada }; 
  } 

  private async obterRotasPorPeriodo(periodo: PeriodoRota): Promise<Rota[]> { 
    const listaDeRotasBrutas = await this.rotaRepositorio.find({ 
      where: { tipo_rota: periodo }
    }); 

    return listaDeRotasBrutas.sort((rotaAvaliada, proximaRota) => {
      const strA = (rotaAvaliada.ordem || "").replace(/[^0-9]/g, '');
      const strB = (proximaRota.ordem || "").replace(/[^0-9]/g, '');

      const numA = strA ? parseInt(strA, 10) : NaN;
      const numB = strB ? parseInt(strB, 10) : NaN;

      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }

      if (!isNaN(numA)) return -1;
      if (!isNaN(numB)) return 1;

      return (rotaAvaliada.ordem || "").localeCompare(proximaRota.ordem || "");
    });
  }

// Importe a sua função no topo do arquivo do serviço:
// import calcularPosicaoApoio from "./caminho/para/calcularPosicaoApoio";

    private montarRelatorioWhatsapp(
    motoristas: OrdemJoinha[], 
    config: IConfiguracaoEscala, 
    dataGeracaoOrigem: Date,
    contagemRotas: IContagemRotas
  ): string { 
    const { tipoDia, ehSegundaComum, qtdMaxRotas } = config; 
    const titulo = ehSegundaComum ? 'MADRUGADA DE SEGUNDA' : tipoDia.replace('_', ' '); 
    const limitePlantao = ehSegundaComum ? this.LIMITE_PLANTAO_SEGUNDA : this.LIMITE_PLANTAO_PADRAO; 

    // 🧮 Executa a função matemática baseada nas listas de tarde e madrugada
    const posicaoPermitidaApoio = calcularPosicaoApoio(contagemRotas);

    const motoristasValidados = filtrarERecalcularEscala(motoristas, limitePlantao, tipoDia, posicaoPermitidaApoio);

    const dataX1 = this.calcularDataFutura(dataGeracaoOrigem, 1);
    const dataX2 = this.calcularDataFutura(dataGeracaoOrigem, 2);

    const txtDiaX = `${dataGeracaoOrigem.getDate().toString().padStart(2, '0')}/${(dataGeracaoOrigem.getMonth() + 1).toString().padStart(2, '0')}`; 
    const txtDiaX1 = `${dataX1.getDate().toString().padStart(2, '0')}/${(dataX1.getMonth() + 1).toString().padStart(2, '0')}`;
    const txtDiaX2 = `${dataX2.getDate().toString().padStart(2, '0')}/${(dataX2.getMonth() + 1).toString().padStart(2, '0')}`;

    let texto = `*Escala do dia ${txtDiaX1}* (${titulo})\n`; 
    texto += `*Execução:* Dia ${txtDiaX2}\n\n`;

    const blocoPlantao: string[] = [];
    let blocoApoio: string = "";
    const blocoRota: string[] = [];
    const blocoBackup: string[] = [];

    let contadorPlantao = 1;
    let contadorRotaVisual = limitePlantao + 1;

    motoristasValidados.forEach((reg) => {
      const { motorista } = reg;

      // ==========================================
      // LÓGICA: DIA LIVRE
      // ==========================================
      if (tipoDia === 'DIA_LIVRE') {
        if (!motorista.podeFazerRota) {
          blocoBackup.push(motorista.nome);
          return;
        }

        if (contadorPlantao <= limitePlantao) {
          if (contadorPlantao === 1) {
            blocoPlantao.push(`*Plantão até o fim das rotas*\n1 ${motorista.nome}`);
          } else {
            blocoPlantao.push(`${contadorPlantao} ${motorista.nome}`);
          }
          contadorPlantao++;
          return;
        }

        const posicaoAtualFila = blocoPlantao.length + blocoRota.length + 1;
        if (posicaoAtualFila <= qtdMaxRotas) {
          if (posicaoAtualFila === limitePlantao + 2) {
            blocoRota.push(`\n*Plantão das 04h00 às 06h00*\n${posicaoAtualFila} ${motorista.nome}`);
          } else {
            blocoRota.push(`${posicaoAtualFila} ${motorista.nome}`);
          }
        } else {
          blocoBackup.push(motorista.nome);
        }
        return;
      }

      // ==========================================
      // LÓGICA: DIA COMUM
      // ==========================================
      if (tipoDia === 'DIA_COMUM') {
        if (blocoPlantao.length < limitePlantao) {
          const idxPlantao = blocoPlantao.length + 1;
          blocoPlantao.push(`${idxPlantao} ${motorista.nome}`);
          return;
        }

        // INTERCEPTADOR DE VAGA DE APOIO
        if (contadorRotaVisual === posicaoPermitidaApoio) {
          blocoApoio = ` ${motorista.nome} (Apoio/Plantão)`;
          
          contadorRotaVisual++; 
          return; 
        }

        if (!motorista.podeFazerRota) {
          blocoBackup.push(motorista.nome);
          return;
        }

        if (contadorRotaVisual <= qtdMaxRotas) {
          blocoRota.push(`${contadorRotaVisual} ${motorista.nome}`);
          contadorRotaVisual++;
          return;
        }

        blocoBackup.push(motorista.nome);
      }
    });

    // ==========================================
    // MONTAGEM DO LAYOUT TEXTUAL
    // ==========================================
    if (tipoDia === 'DIA_COMUM') {
      texto += `*Plantão*\n${blocoPlantao.join('\n')}\n`;
      if (blocoApoio) texto += `${blocoApoio}\n`;
      if (blocoRota.length > 0) texto += `\n*Rota*\n${blocoRota.join('\n')}\n`;
      if (blocoBackup.length > 0) texto += `\n*Backup*\n${blocoBackup.join('\n')}\n`;
    } 
    else {
      texto += `${blocoPlantao.join('\n')}\n`;
      if (blocoRota.length > 0) texto += `${blocoRota.join('\n')}\n`;
      if (blocoBackup.length > 0) {
        const indexInicioBackup = blocoPlantao.length + blocoRota.length + 1;
        texto += `\n*Livre*\n${blocoBackup.map((nome, i) => `${indexInicioBackup + i} ${nome}`).join('\n')}\n`;
      }
    }

    texto += `\n*Escala gerada dia: ${txtDiaX}*\n`;
    return texto; 
  }

  public async obterMotoristasOrdenados(listaId: number): Promise<OrdemJoinha[]> { 
    return await this.ordemRepositorio.find({ 
      where: { listaJoia: { id: listaId } }, 
      relations: ["motorista"], 
      order: { 
        isPenalizado: "ASC", 
        posicaoEfetiva: "ASC", 
        horaDoJoinha: "ASC" 
      } 
    }); 
  }

/**
 * Constrói o texto formatado das escalas da Tarde (Dia X + 1) com ícones dinâmicos via banco de dados
 * GARANTIA: Lista absolutamente todas as rotas da tarde, inclusive as vagas/sem motorista.
 * CRUZA COM: Tabela solicitacao_corrida para exibir checks verdes dinâmicos.
 */
async obterTextoPeriodoTarde(diaDoJoinha: number): Promise<{ texto: string; mencoes: string[] }> {
    const dataAtual = new Date();
    let anoDigitado = dataAtual.getFullYear();
    let mesDigitado = dataAtual.getMonth(); // 0-indexed

    // 🚀 CORREÇÃO DE TRANSIÇÃO: Se o dia solicitado for maior que o dia atual, pertence ao mês anterior
    if (diaDoJoinha > dataAtual.getDate()) {
        const dataMesAnterior = new Date(anoDigitado, mesDigitado - 1, 1);
        anoDigitado = dataMesAnterior.getFullYear();
        mesDigitado = dataMesAnterior.getMonth();
    }

    // Criação das datas limites da lista de origem (Dia X)
    const inicioDiaJoia = new Date(anoDigitado, mesDigitado, diaDoJoinha, 0, 0, 0, 0);
    const fimDiaJoia = new Date(anoDigitado, mesDigitado, diaDoJoinha, 23, 59, 59, 999);

    // Busca a lista de origem usando o intervalo BETWEEN
    const listaJoia = await this.listaRepositorio.createQueryBuilder("lista")
      .where("lista.dia BETWEEN :inicioDiaJoia AND :fimDiaJoia", { inicioDiaJoia, fimDiaJoia })
      .getOne();

    if (!listaJoia) throw new Error(`Nenhuma lista encontrada para o dia ${diaDoJoinha}/${mesDigitado + 1}.`);

    // 🚀 CORREÇÃO DA DATA OPERACIONAL (X + 1): Usa a data do banco para o JavaScript virar o mês/ano sem erros
    const dataTardeOperacional = new Date(listaJoia.dia);
    dataTardeOperacional.setDate(dataTardeOperacional.getDate() + 1);
    dataTardeOperacional.setHours(12, 0, 0, 0);

    const dataTardeIsoString = `${dataTardeOperacional.getFullYear()}-${String(dataTardeOperacional.getMonth() + 1).padStart(2, '0')}-${String(dataTardeOperacional.getDate()).padStart(2, '0')}`;
    const dataFormatada = `${String(dataTardeOperacional.getDate()).padStart(2, '0')}/${String(dataTardeOperacional.getMonth() + 1).padStart(2, '0')}/${dataTardeOperacional.getFullYear()}`;
    const diaSemanaTexto = this.obterNomeDiaSemana(dataTardeOperacional);

    // Lógica de verificação do tipo de dia (Registro Manual ou Fim de Semana) usando BETWEEN seguro
    const inicioDiaTarde = new Date(dataTardeOperacional); inicioDiaTarde.setHours(0,0,0,0);
    const fimDiaTarde = new Date(dataTardeOperacional); fimDiaTarde.setHours(23,59,59,999);

    const registroManual = await AppDataSource.getRepository(this.diasTipoRepositorio.target).createQueryBuilder("diasTipo")
        .where("diasTipo.data BETWEEN :inicioDiaTarde AND :fimDiaTarde", { inicioDiaTarde, fimDiaTarde })
        .getOne();

    let tipoDiaAlvo: 'DIA_COMUM' | 'DIA_LIVRE' = 'DIA_COMUM';
    if (registroManual) {
        tipoDiaAlvo = (registroManual as any).tipo;
    } else {
        const diaSemana = dataTardeOperacional.getDay();
        if (diaSemana === 0 || diaSemana === 6) tipoDiaAlvo = 'DIA_LIVRE';
    }

    // Busca todas as rotas da tarde cadastradas
    const todasAsRotasTarde = await this.rotaRepositorio.find({
      where: { tipo_rota: 'ROTA_TARDE' },
      relations: [
        "passageiros", 
        "passageiros.endereco", 
        "passageiros.endereco.bairro", 
        "empresas"
      ],
      order: {
        ordem: "ASC" 
      }
    });

    todasAsRotasTarde.sort((a, b) => {
      const numA = parseInt((a.ordem || "").replace(/[^0-9]/g, ''), 10) || 0;
      const numB = parseInt((b.ordem || "").replace(/[^0-9]/g, ''), 10) || 0;
      return numA - numB;
    });

    const mencoes: string[] = [];
    if (todasAsRotasTarde.length === 0) return { texto: `📭 Nenhuma rota cadastrada para o turno da Tarde no sistema.`, mencoes };

    // Busca unificada na data real da tarde operacional usando BETWEEN seguro contra fuso horário
    const atribuicoes = await this.atribuicaoRepositorio.createQueryBuilder("atrib")
      .leftJoinAndSelect("atrib.motorista", "motorista")
      .leftJoinAndSelect("atrib.rota", "rota")
      .where("atrib.listaJoia = :listaId", { listaId: listaJoia.id })
      .andWhere("atrib.dataGeracao BETWEEN :inicioDiaTarde AND :fimDiaTarde", { inicioDiaTarde, fimDiaTarde })
      .getMany();

    let motoristaDoApoio: any = null;

    if (tipoDiaAlvo === 'DIA_COMUM') {
        motoristaDoApoio = await EscalaService.obterMotoristaApoioEscalaMae(
            dataTardeOperacional.getFullYear(), 
            dataTardeOperacional.getMonth(), 
            dataTardeOperacional.getDate()
        );
    }

    let texto = `🌅 *Atendimento do turno da tarde:*\n📅 *Execução:* ${diaSemanaTexto} (${dataFormatada})\n\n`;

    // Instancia o repositório de solicitações para os checks dinâmicos
    const solicitacoesRepo = AppDataSource.getRepository("SolicitacaoCorrida");

    for (const rota of todasAsRotasTarde) {
      const identificadorRota = (rota.ordem || '').trim(); 
      const nomeBairroOuTrajeto = (rota.nome || '').trim(); 
      const horario = rota.horario || '18h00';
      
      const ehApoioReal = (tipoDiaAlvo === 'DIA_COMUM') && (todasAsRotasTarde.indexOf(rota) === todasAsRotasTarde.length - 1);
      const atribExistente = atribuicoes.find(a => a.rota && a.rota.id === rota.id);

      let motoristaEscolhido = null;

      // 🔥 TRAVA DE PRIORIDADE: Se for a vaga de apoio, força o motorista do apoio. 
      // Não deixa cair na atribuição comum da rota.
      if (ehApoioReal) {
          motoristaEscolhido = motoristaDoApoio || null;
      } else if (atribExistente) {
          motoristaEscolhido = atribExistente.motorista || null;
      }

      let nomeMotorista = '_(Sem motorista escalado)_';
      
      if (motoristaEscolhido) {
        if (motoristaEscolhido.whatsAppLid) {
          const jidCompletoLid = motoristaEscolhido.whatsAppLid.includes('@') 
            ? motoristaEscolhido.whatsAppLid 
            : `${motoristaEscolhido.whatsAppLid}@lid`;
          mencoes.push(jidCompletoLid);
          nomeMotorista = `@${motoristaEscolhido.whatsAppLid}`;
        } else {
          nomeMotorista = `*${motoristaEscolhido.nome}*`;
        }
      }

      const empresasDaRota = rota.empresas || [];
      const nomeEmpresasUnificado = empresasDaRota.map(e => (e.nome || '').toUpperCase().trim()).join(' / ') || 'EMPRESA';
      
      let prefixo = '📌 ';
      if (empresasDaRota.length > 0 && (empresasDaRota[0] as any).icone) {
        prefixo = (empresasDaRota[0] as any).icone;
      }

      texto += `${prefixo}${nomeEmpresasUnificado} - ${identificadorRota} - ${nomeBairroOuTrajeto}: ${horario}/${nomeMotorista}\n\n`;

      const passageirosDaRota = rota.passageiros || [];

      if (passageirosDaRota.length > 0) {
        const passageirosOrdenados = [...passageirosDaRota].sort((a, b) => (a.ordem_na_rota || 0) - (b.ordem_na_rota || 0));
        
        for (let idx = 0; idx < passageirosOrdenados.length; idx++) {
          const p = passageirosOrdenados[idx];
          const logradouro = p.endereco?.nome || 'Endereço não cadastrado';
          const numeroCasa = p.endereco?.numero ? `, ${p.endereco.numero}` : '';
          
          // BUSCA DINÂMICA DE SOLICITAÇÃO NA TABELA COMPOSTA (Turno Tarde = IDA)
          const temConfirmacao = await solicitacoesRepo.findOneBy({
            passageiroId: p.id,
            dataViagem: dataTardeIsoString,
            tipoTurno: "IDA"
          });

          const emojiStatus = temConfirmacao ? '✅' : '❌';
          texto += `${idx + 1}️⃣ ${p.nome} - ${logradouro}${numeroCasa}${emojiStatus}\n`;
        }
      } else {
        texto += `_(Sem passageiros vinculados)_\n`;
      }
      texto += `\n`;
    }

    return { texto: texto.trim(), mencoes };
  }



/**
 * Constrói o texto formatado das escalas da Madrugada e Apoio (Dia X + 2) com ícones dinâmicos via banco de dados
 * GARANTIA: Lista absolutamente todas as rotas da madrugada cadastradas, inclusive as vagas/sem motorista.
 * CRUZA COM: Tabela solicitacao_corrida para exibir checks verdes dinâmicos.
 */
  async obterTextoPeriodoMadrugada(diaDoJoinha: number): Promise<{ texto: string; mencoes: string[] }> {
    const dataAtual = new Date();
    let anoDigitado = dataAtual.getFullYear();
    let mesDigitado = dataAtual.getMonth();

    // 🚀 CORREÇÃO DE TRANSIÇÃO: Se o dia solicitado for maior que o dia atual, pertence ao mês anterior
    if (diaDoJoinha > dataAtual.getDate()) {
        const dataMesAnterior = new Date(anoDigitado, mesDigitado - 1, 1);
        anoDigitado = dataMesAnterior.getFullYear();
        mesDigitado = dataMesAnterior.getMonth();
    }

    const dataListaJoia = new Date(anoDigitado, mesDigitado, diaDoJoinha, 0, 0, 0, 0);
    const dataIsoPura = formatarDataIsoPura(dataListaJoia);

    const listaJoia = await this.listaRepositorio.createQueryBuilder("lista")
      .where("DATE(lista.dia) = :dataIsoPura", { dataIsoPura })
      .getOne();

    if (!listaJoia) throw new Error(`Nenhuma lista encontrada para o dia ${diaDoJoinha}/${mesDigitado + 1}.`);

    // 🚀 CORREÇÃO DA DATA OPERACIONAL (X + 2): Usa a data do banco para o JavaScript virar o mês/ano sem erros
    const dataMadrugadaOperacional = new Date(listaJoia.dia);
    dataMadrugadaOperacional.setDate(dataMadrugadaOperacional.getDate() + 2);
    dataMadrugadaOperacional.setHours(0, 0, 0, 0);

    const dataMadrugadaIsoString = formatarDataIsoPura(dataMadrugadaOperacional);
    const dataFormatada = `${dataMadrugadaOperacional.getDate().toString().padStart(2, '0')}/${(dataMadrugadaOperacional.getMonth() + 1).toString().padStart(2, '0')}/${dataMadrugadaOperacional.getFullYear()}`;
    const diaSemanaTexto = this.obterNomeDiaSemana(dataMadrugadaOperacional);

    // 1. BUSCA PRIMEIRO TODAS AS ROTAS DO TURNO DA MADRUGADA CADASTRADAS NO SISTEMA
    const todasAsRotasMadrugada = await this.rotaRepositorio.find({
      where: { tipo_rota: 'ROTA_MADRUGADA' },
      relations: [
        "passageiros", 
        "passageiros.endereco", 
        "passageiros.endereco.bairro", 
        "empresas"
      ],
      order: {
        ordem: "ASC"
      }
    });

    todasAsRotasMadrugada.sort((a, b) => {
      const numA = parseInt((a.ordem || "").replace(/[^0-9]/g, ''), 10) || 0;
      const numB = parseInt((b.ordem || "").replace(/[^0-9]/g, ''), 10) || 0;
      return numA - numB;
    });

    const mencoes: string[] = [];
    if (todasAsRotasMadrugada.length === 0) return { texto: `📭 Nenhuma rota cadastrada para o turno da Madrugada no sistema.`, mencoes };

    // 2. BUSCA AS ATRIBUIÇÕES EFETUADAS DE FORMA ISOLADA NO DIA OPERACIONAL (X + 2)
    const atribuicoes = await this.atribuicaoRepositorio.createQueryBuilder("atrib")
      .leftJoinAndSelect("atrib.motorista", "motorista")
      .leftJoinAndSelect("atrib.rota", "rota")
      .where("atrib.listaJoiaId = :listaId", { listaId: listaJoia.id })
      .andWhere("DATE(atrib.dataGeracao) = :dataMadrugadaIsoString", { dataMadrugadaIsoString })
      .getMany();

    let texto = `🌌 *Atendimento do turno da madrugada:*\n📅 *Execução:* ${diaSemanaTexto} (${dataFormatada})\n\n`;

    // Instancia o repositório de solicitações para os checks dinâmicos
    const solicitacoesRepo = AppDataSource.getRepository("SolicitacaoCorrida");

    // 3. MAPEAMENTO COMPLETO PERCORRENDO AS ROTAS REAIS
    for (const rota of todasAsRotasMadrugada) {
      const identificadorRota = (rota.ordem || '').trim(); 
      const nomeBairroOuTrajeto = (rota.nome || '').trim();
      const horario = rota.horario || '04h00';
      
      const atribExistente = atribuicoes.find(a => a.rota?.id === rota.id);
      const sufixoApoio = atribExistente?.tipoAtribuicao === 'APOIO' ? '/Apoio' : '';
      
      let nomeMotorista = '_(Sem motorista escalado)_';
      
      if (atribExistente && atribExistente.motorista) {
        if (atribExistente.motorista.whatsAppLid) {
          const jidCompletoLid = atribExistente.motorista.whatsAppLid.includes('@') 
            ? atribExistente.motorista.whatsAppLid 
            : `${atribExistente.motorista.whatsAppLid}@lid`;
          mencoes.push(jidCompletoLid);
          nomeMotorista = `@${atribExistente.motorista.whatsAppLid}`;
        } else {
          nomeMotorista = `*${atribExistente.motorista.nome}*`;
        }
      }

      const empresasDaRota = rota.empresas || [];
      const nomeEmpresasUnificado = empresasDaRota.map(e => (e.nome || '').toUpperCase().trim()).join(' / ') || 'EMPRESA';

      let prefixo = '📌 ';
      if (empresasDaRota.length > 0 && (empresasDaRota[0] as any).icone) {
        prefixo = (empresasDaRota[0] as any).icone;
      }

      texto += `${prefixo}${nomeEmpresasUnificado} - ${identificadorRota} - ${nomeBairroOuTrajeto}: ${horario}${sufixoApoio}/${nomeMotorista}\n\n`;

      const passageirosDaRota = rota.passageiros || [];

      if (passageirosDaRota.length > 0) {
        const passageirosOrdenados = [...passageirosDaRota].sort((a, b) => (a.ordem_na_rota || 0) - (b.ordem_na_rota || 0));
        
        for (let idx = 0; idx < passageirosOrdenados.length; idx++) {
          const p = passageirosOrdenados[idx];
          const logradouro = p.endereco?.nome || 'Endereço não cadastrado';
          const numeroCasa = p.endereco?.numero ? `, ${p.endereco.numero}` : '';
          
          // BUSCA DINÂMICA DE SOLICITAÇÃO NA TABELA COMPOSTA (Turno Madrugada = VOLTA)
          const temConfirmacao = await solicitacoesRepo.findOneBy({
            passageiroId: p.id,
            dataViagem: dataMadrugadaIsoString,
            tipoTurno: "VOLTA"
          });

          const emojiStatus = temConfirmacao ? '✅' : '❌';
          texto += `${idx + 1}️⃣ ${p.nome} - ${logradouro}${numeroCasa}${emojiStatus}\n`;
        }
      } else {
        texto += `_(Sem passageiros vinculados)_\n`;
      }
      texto += `\n`;
    }

    return { texto: texto.trim(), mencoes };
  }

  /**
   * Retorna as rotas da tarde formatadas para o consumo do painel visando o payload isomórfico
   */
  public async obterEscalaTardeParaWhatsapp(dataParam: string): Promise<any> {
    const [ano, mes, dia] = dataParam.split('-').map(Number);
    const dataAlvoViagem = new Date(ano, mes - 1, dia, 0, 0, 0, 0);

    const dataOrigemJoia = new Date(dataAlvoViagem);
    dataOrigemJoia.setDate(dataOrigemJoia.getDate() - 2);
    dataOrigemJoia.setHours(0, 0, 0, 0);

    const dataIsoPura = formatarDataIsoPura(dataOrigemJoia);
    const listaJoia = await this.listaRepositorio.createQueryBuilder("lista")
      .where("DATE(lista.dia) = :dataIsoPura", { dataIsoPura })
      .getOne();

    if (!listaJoia) {
      throw new Error(`Nenhuma lista de Joinha processada para o dia correspondente.`);
    }

    const dataTardeOperacional = this.calcularDataFutura(listaJoia.dia, 1);

    const todasAsRotasTarde = await this.rotaRepositorio.createQueryBuilder("rota")
      .leftJoinAndSelect("rota.passageiros", "passageiro")
      .leftJoinAndSelect("passageiro.endereco", "endereco")
      .leftJoinAndSelect("passageiro.endereco.bairro", "bairro")
      .leftJoinAndSelect("rota.empresas", "empresas")
      .where("rota.tipo_rota = 'ROTA_TARDE'")
      .orderBy("CAST(REGEXP_REPLACE(rota.ordem, '[^0-9]', '') AS UNSIGNED)", "ASC")
      .getMany();

    const atribuicoes = await this.atribuicaoRepositorio.find({
      where: { 
        // 🚀 CORREÇÃO 1: Mudado de 'listaJoiaId' para objeto relacional do TypeORM
        listaJoia: { id: listaJoia.id }, 
        dataGeracao: dataTardeOperacional 
      },
      relations: ["motorista", "rota"]
    });

    const dadosMapeados = todasAsRotasTarde.map((rota, index) => {
      // 🚀 CORREÇÃO 2: Mudado o filtro de 'a.rotaId' para o ID interno do objeto de relação 'a.rota?.id'
      const atribExistente = atribuicoes.find(a => a.rota?.id === rota.id);
      const motoristaFinal = atribExistente?.motorista || null;
      const posicaoJoinhaFinal = motoristaFinal ? index + 1 : null;

      return {
        id_atribuicao: atribExistente?.id || null,
        tipo_atribuicao: atribExistente?.tipoAtribuicao || "ROTA",
        motorista: motoristaFinal ? {
          id: motoristaFinal.id,
          nome: motoristaFinal.nome,
          whatsAppLid: motoristaFinal.whatsAppLid,
          posicaoJoinha: posicaoJoinhaFinal
        } : null,
        rota: {
          id: rota.id,
          nome: rota.nome,
          ordem: rota.ordem,
          horario: rota.horario
        },
        passageiros: (rota.passageiros || [])
          .sort((a, b) => (a.ordem_na_rota || 0) - (b.ordem_na_rota || 0))
          .map(p => ({
            id_passageiro: p.id,
            nome: p.nome,
            telefoneWhatsApp: p.telefoneWhatsApp,
            ordem_na_rota: p.ordem_na_rota,
            bairro: p.endereco?.bairro?.nome || null,
            logradouro: p.endereco?.nome || "Não cadastrado",
            numero: p.endereco?.numero || null
          }))
      };
    });

    const diaTexto = String(dataTardeOperacional.getDate()).padStart(2, '0');
    const mesTexto = String(dataTardeOperacional.getMonth() + 1).padStart(2, '0');

    return {
      dataExibicaoTexto: `${diaTexto}/${mesTexto}`,
      dados: dadosMapeados
    };
  }

  /**
 * MOTOR DE CONSULTA ESPECIALISTA: Descobre com precisão absoluta quem é o motorista
 * responsável por uma rota em uma determinada data operacional, blindado contra as regras do Apoio.
 */
public async encontrarMotoristaResponsavel(rotaId: number, listaOrigemId: number, dataOperacional: Date): Promise<any | null> {
    const atribuicaoRepo = AppDataSource.getRepository(RotaAtribuida);
    const rotaRepo = AppDataSource.getRepository(Rota);

    const rotaFisica = await rotaRepo.findOneBy({ id: rotaId });
    if (!rotaFisica) return null;

    // 1. Identifica se é a última rota da tarde (Vaga do Apoio)
    let ehUltimaRotaTarde = false;
    if (rotaFisica.tipo_rota === 'ROTA_TARDE') {
      // 🚨 CORREÇÃO ESSENCIAL: Sincroniza a ordenação numérica com o controlador
      const todasTarde = await rotaRepo.createQueryBuilder("rota")
        .where("rota.tipo_rota = 'ROTA_TARDE'")
        .orderBy("CAST(REGEXP_REPLACE(rota.ordem, '[^0-9]', '') AS UNSIGNED)", "ASC")
        .getMany();

      if (todasTarde.length > 0 && todasTarde[todasTarde.length - 1].id === rotaId) {
        ehUltimaRotaTarde = true;
      }
    }

    // 2. REGRA ESTRITA PARA A VAGA DE APOIO
    if (ehUltimaRotaTarde) {
      console.log(`[ESCALA-CONSULTA] Rota ${rotaId} é Apoio. Rastreando escala mãe...`);
      
      // Busca exclusivamente o motorista que cumpre a regra do Apoio na Escala Mãe
      const motoristaApoioMae = await EscalaService.obterMotoristaApoioEscalaMae(
        dataOperacional.getFullYear(),
        dataOperacional.getMonth(),
        dataOperacional.getDate()
      );

      if (motoristaApoioMae) {
        return motoristaApoioMae;
      }

      // 🔥 TRAVA REAL: Se a regra do apoio não foi cumprida na escala mãe,
      // retorna NULL. Impede o vazamento para o motorista comum da lista X-1.
      return null;
    }

    // 3. REGRA PARA ROTAS COMUNS (Não Apoio) - Mantida 100% original
    const atribuicaoDiretaComum = await atribuicaoRepo.findOne({
      where: { rota: { id: rotaId }, listaJoia: { id: listaOrigemId } },
      relations: ["motorista"]
    });

    if (atribuicaoDiretaComum && atribuicaoDiretaComum.motorista) {
      return atribuicaoDiretaComum.motorista;
    }

    return null;
  }
  /**
   * Remove o vínculo do motorista da lista baseado no ID da lista e reorganiza a fila
   */
  async removerMotoristaDaListaPorId(whatsappId: string, listaId: number): Promise<void> {
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@')[0];
    const motorista = await MotoristaService.buscarPorLid(lidLimpo);
    
    if (!motorista) throw new Error("Motorista não cadastrado.");

    const resultado = await this.ordemRepositorio.delete({
      motoristaId: motorista.id,
      listaJoiaId: listaId
    });

    if (resultado.affected === 0) {
      throw new Error("O motorista não está escalado nesta lista.");
    }

    const filaRestante = await this.ordemRepositorio.find({
      where: { listaJoiaId: listaId },
      order: { isPenalizado: 'ASC', posicaoEfetiva: 'ASC', horaDoJoinha: 'ASC' }
    });

    for (let i = 0; i < filaRestante.length; i++) {
      filaRestante[i].posicaoEfetiva = i + 1;
      filaRestante[i].posicao = i + 1;
    }
    await this.ordemRepositorio.save(filaRestante);
  }

  /**
   * Insere um motorista cadastrado exatamente na posição alvo usando indexação inteira em lote
   */
  async inserirEmPosicaoEspecifica(whatsappId: string, listaId: number, posicaoAlvo: number): Promise<void> {
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@')[0];
    const motorista = await MotoristaService.buscarPorLid(lidLimpo); 
    if (!motorista) throw new Error("Motorista não cadastrado."); 

    const listaAtual = await this.ordemRepositorio.find({
      where: { listaJoiaId: listaId },
      order: { isPenalizado: 'ASC', posicaoEfetiva: 'ASC', horaDoJoinha: 'ASC' }
    });

    const listaFiltrada = listaAtual.filter(item => item.motoristaId !== motorista.id);

    let registroMotorista = listaAtual.find(item => item.motoristaId === motorista.id);
    if (!registroMotorista) {
      registroMotorista = this.ordemRepositorio.create({
        motoristaId: motorista.id,
        listaJoiaId: listaId,
        posicao: 1,
        isPenalizado: false
      });
    }

    const indiceAlvo = Math.max(0, posicaoAlvo - 1);
    listaFiltrada.splice(indiceAlvo, 0, registroMotorista);

    for (let i = 0; i < listaFiltrada.length; i++) {
      listaFiltrada[i].posicaoEfetiva = i + 1; 
      listaFiltrada[i].posicao = i + 1; 
    }

    await this.ordemRepositorio.save(listaFiltrada);
  }

  /**
   * Altera a posição do motorista removendo lacunas e sincronizando as rotas associadas
   */
  async moverMotoristaNaLista(whatsappId: string, listaId: number, novaPosicaoAlvo: number): Promise<void> {
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@')[0];
    const motorista = await MotoristaService.buscarPorLid(lidLimpo);
    
    if (!motorista) throw new Error("Motorista não cadastrado.");

    const registroExistente = await this.ordemRepositorio.findOne({
      where: { motoristaId: motorista.id, listaJoiaId: listaId }
    });

    if (!registroExistente) {
      throw new Error("O motorista informado não está escalado nesta lista para ser movido.");
    }

    await this.inserirEmPosicaoEspecifica(whatsappId, listaId, novaPosicaoAlvo);
  }

  /**
   * FUNÇÃO ADMINISTRATIVA MANUAL: Aloca um motorista na Escala do Apoio de forma fixa.
   * Ativa a flag 'isApoioManual' para blindar o motorista contra qualquer alteração do robô.
   */
  public async forcarMotoristaNaEscalaApoioManual(whatsappId: string, listaId: number): Promise<void> {
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@')[0];
    const motorista = await MotoristaService.buscarPorLid(lidLimpo);
    if (!motorista) throw new Error("Motorista não cadastrado no sistema.");

    const { rotasTarde, rotasMadrugada } = await this.obterTodasAsRotasAtivas();
    const qtdMax = Math.max(rotasTarde.length, rotasMadrugada.length);
    
    // A vaga oficial do apoio fica imediatamente após o término da maior fila
    const posicaoVagaApoio = qtdMax + 1;

    // 🔒 BARREIRA DE PROTEÇÃO: Remove o status de Apoio Manual de qualquer outro motorista
    // desta lista do dia, garantindo que exista apenas um Apoio Fixo regulamentar
    await this.ordemRepositorio.update(
      { listaJoiaId: listaId, isApoioManual: true },
      { isApoioManual: false }
    );

    // Localiza ou força o registro do motorista na lista do dia
    let registroOrdem = await this.ordemRepositorio.findOne({
      where: { motoristaId: motorista.id, listaJoiaId: listaId }
    });

    if (!registroOrdem) {
      registroOrdem = this.ordemRepositorio.create({
        motoristaId: motorista.id,
        listaJoiaId: listaId,
        posicao: posicaoVagaApoio,
        isPenalizado: false
      });
    }

    // Cravamos o motorista manualmente na posição do Apoio e ativamos a blindagem estática
    registroOrdem.posicaoEfetiva = posicaoVagaApoio;
    registroOrdem.posicao = posicaoVagaApoio;
    registroOrdem.isApoioManual = true;

    await this.ordemRepositorio.save(registroOrdem);

    // Força o recálculo do turno para consolidar os espelhos e amarrações
    await this.gerarEscalaCompleta(listaId);
  }

  /**
   * FUNÇÃO ADMINISTRATIVA MANUAL 2: Vincula um motorista diretamente na Rota do Apoio.
   * Insere ou atualiza um registro fixo com o tipo 'APOIO' na tabela 'atribuicao_final'.
   */
  public async forcarMotoristaNaRotaApoioManual(whatsappId: string, listaId: number, rotaId: number): Promise<void> {
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@')[0];
    const motorista = await MotoristaService.buscarPorLid(lidLimpo);
    if (!motorista) throw new Error("Motorista não cadastrado no sistema.");

    // 🔒 VALIDAÇÃO DE SEGURANÇA EXIGIDA: Se o motorista possuir restrição cadastral, barra o vínculo imediatamente
    if (motorista.podeFazerRota === false) {
      throw new Error(`🚫 Operação abortada! O motorista ${motorista.nome} está configurado como 'Apenas Plantão' e nunca poderá assumir uma rota.`);
    }

    const listaJoia = await this.buscarListaOuFalhar(listaId);
    const dataMadrugada = this.calcularDataFutura(listaJoia.dia, 2);
    const dataMadrugadaIso = formatarDataIsoPura(dataMadrugada);

    // Localiza a lista de rotas do turno da tarde correspondente à execução do dia seguinte
    const listaRotaTardeDiaSeguinte = await this.listaRotaRepositorio.findOneBy({ 
      dataReferencia: dataMadrugada, 
      tipo_lista: 'ROTA_TARDE' 
    });

    if (!listaRotaTardeDiaSeguinte) {
      throw new Error("A lista de rotas operacionais do dia seguinte ainda não foi inicializada.");
    }

    // Limpa qualquer motorista que estivesse alocado na rota do apoio daquela data para não duplicar
    await this.atribuicaoRepositorio.manager.query(
      "DELETE FROM `atribuicao_final` WHERE `listaJoiaId` = ? AND `rotaId` = ? AND `tipoAtribuicao` = 'APOIO' AND `dataGeracao` = ?",
      [listaId, rotaId, dataMadrugadaIso]
    );

    // Insere o novo vínculo manual forçado na tabela de atribuições estáticas
    const novaAtribuicaoApoio = this.atribuicaoRepositorio.create({
      listaJoia,
      motorista,
      rota: { id: rotaId } as any,
      listaRota: listaRotaTardeDiaSeguinte,
      dataGeracao: dataMadrugada,
      tipoAtribuicao: "APOIO"
    });

    await this.atribuicaoRepositorio.save(novaAtribuicaoApoio);
  }

  async definirTipoDiaManual(dataBr: string, tipo: TipoDia): Promise<void> { 
    const [dia, mes, ano] = dataBr.split('/').map(Number); 
    const dataAlvo = new Date(ano, mes - 1, dia, 0, 0, 0, 0); 

    let registro = await this.diasTipoRepositorio.findOneBy({ data: dataAlvo }); 
    if (registro) { 
      registro.tipo = tipo; 
    } else { 
      registro = this.diasTipoRepositorio.create({ data: dataAlvo, tipo }); 
    } 
    await this.diasTipoRepositorio.save(registro); 
  } 

  async removerTipoDiaManual(dataBr: string): Promise<void> { 
    const [dia, mes, ano] = dataBr.split('/').map(Number); 
    const dataAlvo = new Date(ano, mes - 1, dia, 0, 0, 0, 0); 
    await this.diasTipoRepositorio.delete({ data: dataAlvo }); 
  } 

  async listarDiasManuais(): Promise<string> { 
    const dias = await this.diasTipoRepositorio.find({ order: { data: "ASC" } }); 
    if (dias.length === 0) return "📅 Nenhuma data manual cadastrada."; 

    let texto = "*Datas Manuais Cadastradas:*\n"; 
    dias.forEach(d => { 
      const dataObjeto = new Date(d.data);
      const dia = dataObjeto.getDate().toString().padStart(2, '0');
      const mes = (dataObjeto.getMonth() + 1).toString().padStart(2, '0');
      const ano = dataObjeto.getFullYear();
      
      texto += `• ${dia}/${mes}/${ano}: *${d.tipo}*\n`; 
    }); 
    return texto; 
  }

  private calcularDataFutura(base: Date, dias: number): Date { 
    const data = new Date(base); 
    data.setDate(data.getDate() + dias); 
    data.setHours(0, 0, 0, 0); 
    return data; 
  } 

  private verificarSeEhSegundaComum(data: Date, tipo: TipoDia): boolean { 
    return data.getDay() === this.DIA_SEMANA_SEGUNDA && tipo === 'DIA_COMUM'; 
  } 

  private async buscarListaOuFalhar(id: number): Promise<ListaJoia> { 
    const lista = await this.listaRepositorio.findOneBy({ id }); 
    if (!lista) throw new Error("Lista de joinha não encontrada."); 
    return lista; 
  } 

  private async limparAtribuicoesAnteriores(id: number): Promise<void> { 
    await this.atribuicaoRepositorio.delete({ listaJoia: { id } }); 
  }
}