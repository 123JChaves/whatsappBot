import { AppDataSource } from "../../data-source"; 
import { ListaJoia } from "../../models/ListaJoia"; 
import { Motorista } from "../../models/Motorista"; 
import { OrdemJoinha } from "../../models/OrdemJoinha"; 
import { Banimento } from "../../models/Banimento"; 
import { IdentificadorLista } from "../../interfaces/ITipos"; 
import MotoristaService from "../MotoristaService"; 
import { jidNormalizedUser, WASocket } from "@whiskeysockets/baileys";
import { Between, IsNull } from "typeorm";
import { Passageiro } from "../../models/Passageiro";
import { EscalaService } from "./EscalaService";
import { SolicitacaoCorrida } from "../../models/SolicitaçãoCorrida";

export class RegistroService { 
  private readonly ordemRepositorio = AppDataSource.getRepository(OrdemJoinha); 
  private readonly listaRepositorio = AppDataSource.getRepository(ListaJoia); 
  private readonly banimentoRepositorio = AppDataSource.getRepository(Banimento); 

  /**
   * Busca todos os motoristas que foram penalizados (queimaram a largada) em uma lista específica.
   */
  public async buscarMotoristasPenalizados(listaId: number): Promise<Motorista[]> { 
    const registros = await this.ordemRepositorio.find({ 
      where: { listaJoia: { id: listaId }, isPenalizado: true }, 
      relations: ["motorista"], 
      order: { horaDoJoinha: "ASC" } 
    }); 
    return registros.map(reg => reg.motorista); 
  } 

  /**
   * LIMPAR LISTA: Remove todos os joinhas de uma lista específica
   */
  public async limparLista(listaId: number): Promise<void> { 
    await this.buscarListaOuFalhar(listaId); 
    await this.ordemRepositorio.delete({ listaJoia: { id: listaId } }); 
    console.log(`[SERVICE] Fila da lista ${listaId} foi zerada.`); 
  } 

  /** 
   * Registro Normal (Janela Oficial) com tratamento anti-concorrência estrito
   */ 
  async adicionarJoinha(whatsappId: string, listaId: number, client: WASocket, timestampOficialWhatsApp?: number): Promise<OrdemJoinha> { 
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '');
    const motorista = await this.buscarMotoristaAtivoOuFalhar(lidLimpo); 
    const listaAtiva = await this.buscarListaOuFalhar(listaId); 

    try {
      await this.ordemRepositorio
        .createQueryBuilder()
        .insert()
        .into(OrdemJoinha)
        .values({
          posicao: 1, 
          isPenalizado: false, 
          motoristaId: motorista.id, // 🏅 CORREÇÃO: Passa o ID numérico estrito da coluna
          listaJoiaId: listaAtiva.id, // 🏅 CORREÇÃO: Passa o ID numérico estrito da coluna
          horaDoJoinha: () => "NOW(6)" 
        })
        // Força a restrição apontando para os nomes das colunas físicas exatas do MySQL
        .orUpdate(["horaDoJoinha", "isPenalizado"], ["motoristaId", "listaJoiaId"])
        .execute();

      return await this.ordemRepositorio.findOneOrFail({
        where: { motoristaId: motorista.id, listaJoiaId: listaAtiva.id }
      });
    } catch (error) {
      console.error("[ERRO CONCORRÊNCIA ADICIONAR JOINHA]", error);
      throw error;
    }
  } 

  /** 
   * Registro de Penalidade (Queimou a largada) com microssegundos nativos do banco
   */ 
  async adicionarJoinhaPenalizado(whatsappId: string, listaId: number, client: WASocket, timestampOficialWhatsApp?: number): Promise<OrdemJoinha> { 
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '');
    const motorista = await this.buscarMotoristaAtivoOuFalhar(lidLimpo); 
    const listaAtiva = await this.buscarListaOuFalhar(listaId); 

    try {
      await this.ordemRepositorio
        .createQueryBuilder()
        .insert()
        .into(OrdemJoinha)
        .values({
          posicao: 1, 
          isPenalizado: true, 
          motoristaId: motorista.id, // 🏅 CORREÇÃO: Passa o ID numérico estrito da coluna
          listaJoiaId: listaAtiva.id, // 🏅 CORREÇÃO: Passa o ID numérico estrito da coluna
          horaDoJoinha: () => "NOW(6)" 
        })
        .orUpdate(["horaDoJoinha", "isPenalizado"], ["motoristaId", "listaJoiaId"])
        .execute();

      return await this.ordemRepositorio.findOneOrFail({
        where: { motoristaId: motorista.id, listaJoiaId: listaAtiva.id }
      });
    } catch (error) {
      console.error("[ERRO CONCORRÊNCIA ADICIONAR PENALIZADO]", error);
      throw error;
    }
  }

  /** 
   * Registra um banimento para quem enviou mensagem de texto na janela proibida 
   * ESTE MÉTODO ESTÁ 100% CORRETO E PRONTO
   */ 
  async registrarBanimentoAntecipado(whatsappId: string, client: WASocket): Promise<void> { 
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '');
    const hoje = this.obterDataHoje(); 
    
    // 1. Busca o motorista no banco para capturar o Nome Real
    const motorista = await MotoristaService.buscarPorLid(lidLimpo); 
    if (!motorista) return; 

    const jaBanido = await this.banimentoRepositorio.findOne({
      where: {
        motorista: { id: motorista.id },
        dia: hoje
      }
    }); 

    if (!jaBanido) {
      const novoBan = this.banimentoRepositorio.create({ 
        dia: hoje, 
        motorista: motorista, 
        motivo: "Mensagem enviada na janela de banimento (Queimou a largada)" 
      }); 
      await this.banimentoRepositorio.save(novoBan); 

      // 💡 CORREÇÃO: Dispara o aviso no grupo mostrando o NOME REAL do motorista
      // Substitua 'this.grupoId' pelo ID do seu grupo de escala se o escopo permitir, 
      // ou envie de volta para o chat de origem se capturado no fluxo.
      const msgAviso = `⚠️ O motorista *${motorista.nome}* enviou mensagem na janela de banimento e foi penalizado!`;
      
      // Se você quiser notificar o grupo oficial:
      await client.sendMessage(whatsappId, { text: msgAviso });
    } 
  }
 

  /** 
   * Busca ou cria a lista para a data atual 
   */ 
  async buscarOuCriarListaDoDia(identificador: IdentificadorLista = 'CAPTURA_DIARIA', dataAlvo?: Date): Promise<ListaJoia> { 
    const dataBusca = dataAlvo ? this.formatarDataParaMeiaNoite(dataAlvo) : this.obterDataHoje(); 
    let lista = await this.listaRepositorio.findOneBy({ dia: dataBusca }); 

    if (!lista) { 
      lista = this.listaRepositorio.create({ dia: dataBusca, identificador }); 
      try { 
        await this.listaRepositorio.save(lista); 
      } catch (error) { 
        lista = await this.listaRepositorio.findOneBy({ dia: dataBusca }) as ListaJoia; 
      } 
    } 
    return lista; 
  } 

  /** 
   * Adiciona um motorista manualmente na lista via LID
   */ 
  /**
   * Adiciona um motorista manualmente na cauda da lista baseado em uma DATA ESPECÍFICA da escala
   */ 
  public async adicionarMotoristaManualmente(whatsappId: string, dataLista: Date, client: WASocket): Promise<OrdemJoinha> { 
      const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@')[0];
      const motorista = await MotoristaService.buscarPorLid(lidLimpo); 
      if (!motorista || !motorista.ativo) throw new Error("Motorista não encontrado ou inativo."); 
      
      // Busca a lista exata usando o intervalo do fuso horário
      const inicioDia = new Date(dataLista); inicioDia.setHours(0, 0, 0, 0);
      const fimDia = new Date(dataLista); fimDia.setHours(23, 59, 59, 999);
      const listaAtiva = await this.listaRepositorio.findOne({ where: { dia: Between(inicioDia, fimDia) } });

      if (!listaAtiva) throw new Error("Lista não encontrada para a data informada.");

      let registro = await this.ordemRepositorio.findOne({
        where: { motoristaId: motorista.id, listaJoiaId: listaAtiva.id }
      });

      if (!registro) {
        const ultimaOrdem = await this.ordemRepositorio.findOne({
          where: { listaJoiaId: listaAtiva.id },
          order: { posicaoEfetiva: 'DESC' }
        });
        
        const proximaPosicao = ultimaOrdem && ultimaOrdem.posicaoEfetiva ? ultimaOrdem.posicaoEfetiva + 1 : 1;

        registro = this.ordemRepositorio.create({
          motoristaId: motorista.id,
          listaJoiaId: listaAtiva.id,
          posicao: proximaPosicao,
          posicaoEfetiva: proximaPosicao,
          isPenalizado: false,
          horaDoJoinha: new Date()
        });
      } else {
        registro.isPenalizado = false;
        registro.horaDoJoinha = new Date();
      }

      const salvo = await this.ordemRepositorio.save(registro);

      // Recalcula sem disparar mensagens automáticas
      const { EscalaService } = require("./EscalaService");
      const escalaServiceNativo = new EscalaService();
      await escalaServiceNativo.gerarEscalaCompleta(listaAtiva.id);

      return salvo;
  }
  
    /**
   * Insere um motorista cadastrado exatamente na posição alvo.
   * ACEITA ESTRITAMENTE: 'dataLista: Date' para manter compatibilidade total com o bot.
   */
  async inserirEmPosicaoEspecifica(whatsappId: string, dataLista: Date, posicaoAlvo: number): Promise<void> {
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@')[0];
    const motorista = await MotoristaService.buscarPorLid(lidLimpo); 
    if (!motorista) throw new Error("Motorista não cadastrado."); 

    // Define o intervalo de segurança para capturar a lista correta do fuso
    const inicioDia = new Date(dataLista);
    inicioDia.setHours(0, 0, 0, 0);
    const fimDia = new Date(dataLista);
    fimDia.setHours(23, 59, 59, 999);

    const listaDoDia = await this.listaRepositorio.findOne({
      where: { dia: Between(inicioDia, fimDia) }
    });

    if (!listaDoDia) {
      throw new Error("Não foi encontrada nenhuma lista criada para o dia informado.");
    }

    // Calcula os metadados do calendário para obter a vaga congelada do Apoio
    const meta = await require("../../utils/helpers/CalcularMetaConfiguracao").default(listaDoDia.dia);
    const posicaoApoioFixa = meta.tipoDia === 'DIA_COMUM' ? meta.qtdMaxRotasValidas + 1 : -1;

    const listaAtual = await this.ordemRepositorio.find({
      where: { listaJoia: { id: listaDoDia.id } },
      relations: ["motorista", "listaJoia"],
      order: { isPenalizado: 'ASC', posicaoEfetiva: 'ASC', horaDoJoinha: 'ASC' }
    });

    const listaFiltrada = listaAtual.filter(item => item.motorista?.id !== motorista.id);

    let registroMotorista = listaAtual.find(item => item.motorista?.id === motorista.id);
    if (!registroMotorista) {
      registroMotorista = this.ordemRepositorio.create({
        motorista: motorista,
        listaJoia: listaDoDia,
        posicao: 1,
        isPenalizado: false
      });
    }

    const indiceAlvo = Math.max(0, posicaoAlvo - 1);
    listaFiltrada.splice(indiceAlvo, 0, registroMotorista);

    let contadorPosicao = 1;
    for (let i = 0; i < listaFiltrada.length; i++) {
      // 🔒 TRAVA DO APOIO: Se o contador atingir a vaga do Apoio, pula ela para mantê-lo congelado
      if (contadorPosicao === posicaoApoioFixa) {
        contadorPosicao++;
      }

      // Se for o motorista de Apoio (e a ação não for mover o próprio Apoio), mantém a posição estática
      if (listaFiltrada[i].posicaoEfetiva === posicaoApoioFixa && posicaoAlvo !== posicaoApoioFixa) {
        continue;
      }

      listaFiltrada[i].posicaoEfetiva = contadorPosicao;
      listaFiltrada[i].posicao = contadorPosicao;
      contadorPosicao++;
    }

    await this.ordemRepositorio.save(listaFiltrada);
    
    // Instanciação dinâmica que quebra a dependência circular e executa na hora
    const { EscalaService } = require("./EscalaService");
    const escalaServiceNativo = new EscalaService();
    await escalaServiceNativo.gerarEscalaCompleta(listaDoDia.id);
  }

  /** 
   * Remove um motorista da lista baseado na data e reorganiza as posições sem mexer no Apoio
   */ 
  public async removerMotoristaDaLista(whatsappId: string, dataLista: Date): Promise<void> { 
    const lidLimpo = whatsappId.replace(/:[0-9]+/, '').split('@')[0];
    const motorista = await MotoristaService.buscarPorLid(lidLimpo); 
    if (!motorista) throw new Error("Motorista não cadastrado."); 
    
    const inicioDia = new Date(dataLista);
    inicioDia.setHours(0, 0, 0, 0);
    const fimDia = new Date(dataLista);
    fimDia.setHours(23, 59, 59, 999);

    const listaAtiva = await this.listaRepositorio.findOne({
      where: { dia: Between(inicioDia, fimDia) }
    });

    if (!listaAtiva) throw new Error("Lista não encontrada para a data informada.");
    
    const filaAtual = await this.ordemRepositorio.find({
      where: { listaJoia: { id: listaAtiva.id } },
      relations: ["motorista"],
      order: { isPenalizado: 'ASC', posicaoEfetiva: 'ASC', horaDoJoinha: 'ASC' }
    });

    const meta = await require("../../utils/helpers/CalcularMetaConfiguracao").default(listaAtiva.dia);
    const posicaoApoioFixa = meta.tipoDia === 'DIA_COMUM' ? meta.qtdMaxRotasValidas + 1 : -1;

    await this.ordemRepositorio.delete({ motorista: { id: motorista.id }, listaJoia: { id: listaAtiva.id } }); 

    const filaRestante = filaAtual.filter(item => item.motorista?.id !== motorista.id);

    let contadorPosicao = 1;
    for (let i = 0; i < filaRestante.length; i++) {
      if (contadorPosicao === posicaoApoioFixa) {
        contadorPosicao++; 
      }
      if (filaRestante[i].posicaoEfetiva === posicaoApoioFixa) {
        continue;
      }
      filaRestante[i].posicaoEfetiva = contadorPosicao;
      filaRestante[i].posicao = contadorPosicao;
      contadorPosicao++;
    }

    await this.ordemRepositorio.save(filaRestante);

    const { EscalaService } = require("./EscalaService");
    const escalaServiceNativo = new EscalaService();
    await escalaServiceNativo.gerarEscalaCompleta(listaAtiva.id);
  }



  /**
   * 🔥 NOVO MÉTODO AUXILIAR: Reconstrói os vínculos da tabela 'atribuicao_final' por ordem de chegada
   */
  private async sincronizarAtribuicoesFinais(listaJoiaId: number, dataGeracao: Date): Promise<void> {
      const queryRunner = this.ordemRepositorio.manager;

      // 1. Coleta todas as rotas físicas do turno cadastradas no banco pela ordem de prioridade
      const rotasCadastradas = await queryRunner.query(
        "SELECT `id` FROM `rota` ORDER BY `ordem` ASC"
      );

      // 2. Busca a fila de joinhas já reordenada
      const filaAtualizada = await this.ordemRepositorio.find({
        where: { listaJoiaId },
        order: { isPenalizado: 'ASC', posicaoEfetiva: 'ASC', horaDoJoinha: 'ASC' }
      });

      // 3. Limpa todas as atribuições engessadas daquela lista para evitar registros duplicados
      await queryRunner.query(
        "DELETE FROM `atribuicao_final` WHERE `listaJoiaId` = ?",
        [listaJoiaId]
      );

      // 4. Cria os novos vínculos: o 1º da fila pega a 1ª rota, o 2º pega a 2ª rota...
      for (let i = 0; i < filaAtualizada.length; i++) {
          const motoristaId = filaAtualizada[i].motoristaId;
          const rotaId = rotasCadastradas[i] ? rotasCadastradas[i].id : null;
          
          // Se houver rota física para a posição, atribui como ROTA, senão vira PLANTAO/BACKUP
          const tipoAtribuicao = rotaId ? 'ROTA' : 'PLANTAO';

          if (motoristaId) {
              await queryRunner.query(
                `INSERT INTO \`atribuicao_final\` 
                (\`listaJoiaId\`, \`motoristaId\`, \`rotaId\`, \`tipoAtribuicao\`, \`dataGeracao\`) 
                VALUES (?, ?, ?, ?, ?)`,
                [listaJoiaId, motoristaId, rotaId, tipoAtribuicao, dataGeracao]
              );
          }
      }
  }

  /**
   * CADASTRO HÍBRIDO: Preserva o número de telefone isolando-o e mapeia o LID.
   */
  async cadastrarMotorista(nome: string, whatsAppId: string, client: WASocket): Promise<Motorista> { 
    const lidLimpo = whatsAppId.replace(/:[0-9]+/, '');
    const partesJid = lidLimpo.split('@');
    const idNumerico = partesJid[0].replace(/\D/g, '');
    
    return await MotoristaService.cadastrarMotorista({ 
      nome, 
      telefoneWhatsApp: idNumerico, 
      ativo: true,
      whatsAppLid: lidLimpo
    }); 
  }

  async verificarSeEhAdmin(whatsappId: string, client: WASocket): Promise<boolean> { 
    if (!whatsappId) return false;

    // 1. Isola a string numérica pura, limpando qualquer domínio ou sufixo residual
    const idNumericoPuro = await this.obterNumeroReal(whatsappId, client);
    if (!idNumericoPuro) return false;

    const administradorRepositorio = AppDataSource.getRepository(
      require("../../models/Administrador").Administrador
    );

    // 2. BUSCA INTELIGENTE EM DOIS PASSOS:
    // Primeiro passo: Tenta localizar o administrador assumindo que o ID numérico puro recebido seja um LID
    const adminPorLid = await administradorRepositorio.findOneBy({
      whatsappLid: idNumericoPuro
    });
    if (adminPorLid) return true;

    // Segundo passo (Fallback): Se não achou pelo LID, tenta localizar assumindo que seja o número de telefone
    const adminPorTelefone = await administradorRepositorio.findOneBy({
      telefoneWhatsApp: idNumericoPuro
    });

    return !!adminPorTelefone;
  }

  /** Gerencia a viagem do passageiro localizando-o de forma 100% segura via LID da rede
   * Sincronizado com o motor especialista para blindagem das regras complexas do Apoio.
  */
  public async gerenciarSolicitacaoPorLid(
    autorLid: string, 
    diaDigitado: number, 
    turnoString: string,
    operacao: "CONFIRMAR" | "CANCELAR"
  ): Promise<{ motoristaLid: string | null; textoRota: string; dataFormatada: string; nomePassageiro: string }> {
    
    const passageiroRepo = AppDataSource.getRepository(Passageiro);
    
    // 🚀 ALINHAMENTO COM A ENTIDADE: Instancia o repositório utilizando a classe SolicitacaoCorrida diretamente
    const solicitacoesRepo = AppDataSource.getRepository(SolicitacaoCorrida);

    // Remove portas de dispositivos (:1, :2) do LID para evitar quebras de igualdade exata
    const lidLimpoParaBusca = autorLid.replace(/:[0-9]+/, '').split('@')[0].trim();
    const fonePuroFallback = autorLid.replace(/\D/g, '');
    
    // 1. Busca o passageiro ativo checando prioritariamente o LID, com Fallback para o número puro
    const passageiro = await passageiroRepo.createQueryBuilder("p")
      .leftJoinAndSelect("p.rota", "rota")
      .leftJoinAndSelect("p.endereco", "endereco")
      .where("p.whatsAppLid = :lidLimpoParaBusca AND p.ativo = true", { lidLimpoParaBusca })
      .orWhere("p.telefoneWhatsApp = :fonePuroFallback AND p.ativo = true", { fonePuroFallback })
      .getOne();

    if (!passageiro || !passageiro.rota) {
      throw new Error("Seu perfil não foi localizado ou não possui uma rota ativa vinculada. Peça para o administrador cadastrar seu número.");
    }

    // 2. Se o passageiro veio pelo fallback do telefone, grava o LID de forma atômica protegida
    if (!passageiro.whatsAppLid) {
      try {
        await passageiroRepo.createQueryBuilder()
          .update(Passageiro)
          .set({ whatsAppLid: lidLimpoParaBusca })
          .where("id = :id AND whatsAppLid IS NULL", { id: passageiro.id })
          .execute();
        console.log(`[LID PASSAGEIRO AUTOMÁTICO] Vinculado LID ${lidLimpoParaBusca} ao passageiro ${passageiro.nome}`);
      } catch (errLid) {
        console.warn("[LID PASSAGEIRO] Ignorado update automático por concorrência ou duplicidade.");
      }
    }

    // 3. Resolve dinamicamente o calendário tratando a virada de mês de forma segura
    const hoje = new Date();
    let anoAlvo = hoje.getFullYear();
    let mesAlvo = hoje.getMonth();
    if (diaDigitado > hoje.getDate()) {
      mesAlvo -= 1;
      if (mesAlvo < 0) { 
        mesAlvo = 11; 
        anoAlvo -= 1; 
      }
    }
    const dataAlvoObj = new Date(anoAlvo, mesAlvo, diaDigitado, 12, 0, 0, 0);
    const dataViagemIso = `${dataAlvoObj.getFullYear()}-${String(dataAlvoObj.getMonth() + 1).padStart(2, '0')}-${String(dataAlvoObj.getDate()).padStart(2, '0')}`;
    const dataFormatadaBr = `${String(dataAlvoObj.getDate()).padStart(2, '0')}/${String(dataAlvoObj.getMonth() + 1).padStart(2, '0')}`;

    const tipoTurno: "IDA" | "VOLTA" = turnoString.includes("volt") ? "VOLTA" : "IDA";

    // 4. PERSISTÊNCIA ATÔMICA: Modificado para ler a classe SolicitacaoCorrida de forma tipada
    if (operacao === "CANCELAR") {
      await solicitacoesRepo.createQueryBuilder()
        .delete()
        .from(SolicitacaoCorrida) // 🚀 CORREÇÃO: Passa a classe da Entidade em vez de String crua
        .where("passageiroId = :passageiroId AND dataViagem = :dataViagem AND tipoTurno = :tipoTurno", {
          passageiroId: passageiro.id,
          dataViagem: dataViagemIso,
          tipoTurno
        })
        .execute();
    } else {
      await solicitacoesRepo.createQueryBuilder()
        .insert()
        .into(SolicitacaoCorrida) // 🚀 CORREÇÃO: Passa a classe da Entidade em vez de String crua
        .values({ 
          passageiroId: passageiro.id, 
          dataViagem: dataViagemIso, 
          tipoTurno: tipoTurno 
        })
        .orIgnore() // Anula erros caso o gatilho sofra dupla inserção concorrente no UNIQUE KEY
        .execute();
    }

    // 5. Cruzamento de motoristas tratando fuso horário de forma segura via BETWEEN
    const diasSubtracao = passageiro.rota.tipo_rota === 'ROTA_MADRUGADA' ? 2 : 1;
    const dataListaOrigem = new Date(dataAlvoObj);
    dataListaOrigem.setDate(dataListaOrigem.getDate() - diasSubtracao);

    const inicioDiaOrigem = new Date(dataListaOrigem);
    inicioDiaOrigem.setHours(0, 0, 0, 0);
    
    const fimDiaOrigem = new Date(dataListaOrigem);
    fimDiaOrigem.setHours(23, 59, 59, 999);

    const listaOrigem = await AppDataSource.getRepository("ListaJoia").createQueryBuilder("lista")
      .where("lista.dia BETWEEN :inicioDiaOrigem AND :fimDiaOrigem", { inicioDiaOrigem, fimDiaOrigem })
      .getOne();

    let motoristaLidTarget = null;
    let textoResultadoRota = "";

    if (listaOrigem) {
      const escalaService = new EscalaService();

      const motoristaEfetivo = await escalaService.encontrarMotoristaResponsavel(
        passageiro.rota.id, 
        listaOrigem.id, 
        dataAlvoObj
      );

      if (motoristaEfetivo && motoristaEfetivo.whatsAppLid) {
        motoristaLidTarget = motoristaEfetivo.whatsAppLid;
        
        const resultadoTextoGeral = passageiro.rota.tipo_rota === 'ROTA_MADRUGADA'
          ? await escalaService.obterTextoPeriodoMadrugada(dataListaOrigem.getDate())
          : await escalaService.obterTextoPeriodoTarde(dataListaOrigem.getDate());

        const identificadorRota = (passageiro.rota.ordem || '').trim();
        const linhas = resultadoTextoGeral.texto.split('\n\n');
        const blocoDaRota = linhas.find((b: string) => b.includes(` - ${identificadorRota} - `)) || resultadoTextoGeral.texto;

        const acaoTexto = operacao === "CONFIRMAR" ? "CONFIRMOU presença" : "CANCELOU a presença";
        textoResultadoRota = `🔔 *ALERTA OPERACIONAL*\n\nO passageiro *${passageiro.nome}* ${acaoTexto} para a viagem de *${tipoTurno}* no dia *${dataFormatadaBr}*.\n\n📋 *Espelho Atualizado da sua Rota:*\n${blocoDaRota}`;
      }
    }

    return {
      motoristaLid: motoristaLidTarget,
      dataFormatada: dataFormatadaBr,
      textoRota: textoResultadoRota,
      nomePassageiro: passageiro.nome
    };
  }

  /**
  * CAPTURA AUTOMÁTICA EM GRUPOS (COM CONTATOS NA AGENDA):
  * Cruza o telefone detectado na mensagem do grupo com o cadastro e salva o LID numérico puro.
  -*/
  public async atualizarLidPassageiroPorTelefone(telefonePuroAgenda: string, lidRealOculto: string): Promise<boolean> {
    const passageiroRepo = AppDataSource.getRepository(Passageiro);
    
    // Pega os últimos 8 dígitos do telefone para ignorar se o WhatsApp removeu ou manteve o nono dígito '9'
    const caudaWhatsApp = telefonePuroAgenda.slice(-8);
    if (!caudaWhatsApp || caudaWhatsApp.length < 8) return false;

    // Busca o passageiro ativo no banco de dados local do Windows
    const passageiro = await passageiroRepo.createQueryBuilder("p")
      .where("p.telefoneWhatsApp LIKE :cauda", { cauda: `%${caudaWhatsApp}` })
      .andWhere("p.ativo = true")
      .getOne();
    
    // Se localizou o passageiro na sua base e a coluna whatsAppLid estiver vazia (null), grava o número puro do LID
    if (passageiro && !passageiro.whatsAppLid) {
      passageiro.whatsAppLid = lidRealOculto.trim(); // Grava estritamente o número puro (ex: 73040348102809)
      await passageiroRepo.save(passageiro);
      
      console.log(`\n==================================================`);
      console.log(`✅ [LID CAPTURADO COM SUCESSO DENTRO DO GRUPO]`);
      console.log(`👤 PASSAGEIRO LOCALIZADO: ${passageiro.nome}`);
      console.log(`📞 TELEFONE DA AGENDA: ${passageiro.telefoneWhatsApp}`);
      console.log(`🆔 LID NUMÉRICO GRAVADO NO BANCO: ${lidRealOculto}`);
      console.log(`==================================================\n`);
      return true;
    }
    return false;
  }

  /**
   * Traduz o identificador JID de rede para obter a string numérica pura (LID ou Telefone)
   */
  public async obterNumeroReal(whatsappId: string, client: WASocket): Promise<string> { 
    try {
      if (!whatsappId) return "";

      // Se a string já vier limpa apenas com os números (ex: repassada via autorLid), retorna ela direto
      if (!whatsappId.includes('@')) {
        return whatsappId.replace(/\D/g, '');
      }

      // Caso contrário, normaliza nativamente e separa o domínio
      const jidNormalizado = jidNormalizedUser(whatsappId);
      return jidNormalizado.split('@')[0];
      
    } catch (error) { 
      console.error("[ERRO OBTER NUMERO REAL]", error);
      return whatsappId.split('@')[0].replace(/\D/g, ''); 
    } 
  }

  /**
   * Zera os componentes de tempo (horas, minutos e segundos) forçando o dia correto em Brasília
   */
  private formatarDataParaMeiaNoite(data: Date): Date { 
    const formatador = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "numeric",
      day: "numeric"
    });
    
    const partes = formatador.formatToParts(data);
    const year = Number(partes.find(p => p.type === "year")?.value || 0);
    const month = Number(partes.find(p => p.type === "month")?.value || 0) - 1;
    const day = Number(partes.find(p => p.type === "day")?.value || 0);
    
    return new Date(year, month, day, 0, 0, 0, 0); 
  }

  /**
   * Obtém a data de hoje no fuso horário do Brasil zerada (00:00:00)
   */
  private obterDataHoje(): Date { 
    return this.formatarDataParaMeiaNoite(new Date()); 
  } 

  /**
   * Busca um motorista ativo ou interrompe o fluxo disparando uma exceção controlada
   */
  private async buscarMotoristaAtivoOuFalhar(whatsAppLid: string): Promise<Motorista> { 
    const motorista = await MotoristaService.buscarPorLid(whatsAppLid); 
    if (!motorista || !motorista.ativo) {
      throw new Error(`Motorista com identificador ${whatsAppLid} não cadastrado ou inativo.`); 
    }
    return motorista; 
  } 

  /**
   * Busca um registro de lista de joinhas ou dispara um erro caso a entidade não exista
   */
  private async buscarListaOuFalhar(id: number): Promise<ListaJoia> { 
    const lista = await this.listaRepositorio.findOneBy({ id }); 
    if (!lista) throw new Error("Lista não encontrada."); 
    return lista; 
  } 
}