import 'dotenv/config';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  proto, 
  WASocket, 
  AuthenticationState,
  fetchLatestWaWebVersion,
  Browsers
} from '@whiskeysockets/baileys';
import cron, { ScheduledTask } from "node-cron"; 
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';  
import { ILike } from "typeorm"; 
import { RegistroService } from "../service/whatsapp/RegistroService"; 
import { EscalaService } from "../service/whatsapp/EscalaService"; 
import { EmojiHelper } from "../utils/helpers/EmojiHelper"; 
import { AppDataSource } from "../data-source";    
import { Motorista } from "../models/Motorista";
import { Banimento } from '../models/Banimento';
import AdministradorService from '../service/AdministradorService';
import MotoristaService from "../service/MotoristaService";
import PassageiroService from '../service/PassageiroService';
import { Passageiro } from '../models/Passageiro';

const lidsProcessadosHoje = new Set<string>();

export class WhatsAppController {
  
  // Propriedades globais de controle da conexão
  public sock: WASocket | null = null; 
  public conectado = false; // usado pelo /health/ready
  private reconectando: boolean = false; // 🔥 Controla a pilha de execução para evitar loops infinitos

  // 1. Array de Grupos de Escala (Motoristas)
  private readonly IDs_PERMITIDOS: string[] = [ 
    process.env.JWT_ID_BOTSECRET || '', 
    process.env.JWT_ID_GROUPSECRET || '' 
  ].filter(id => id !== '' && id.endsWith('@g.us')); 

  // 2. CONFIGURAÇÃO DE SEGURANÇA: Array dos 4 Grupos de Passageiros permitidos
  private readonly GRUPOS_PASSAGEIROS: string[] = [
    process.env.JWT_ID_GRUPO_PASSAGEIROS_1 || '',
    process.env.JWT_ID_GRUPO_PASSAGEIROS_2 || '',
    process.env.JWT_ID_GRUPO_PASSAGEIROS_3 || '',
    process.env.JWT_ID_GRUPO_PASSAGEIROS_4 || ''
  ].filter(id => id !== '' && id.endsWith('@g.us'));

  private cadastroAberto: boolean = false;
  private cadastroPassageiroAberto: boolean = false; 
  private grupoId: string = ''; 
  private readonly timestampInicial: number = Math.floor(Date.now() / 1000);

  constructor( 
    public registroService: RegistroService, 
    public escalaService: EscalaService 
  ) { 
    this.grupoId = process.env.JWT_ID_GROUPSECRET || ''; 
  }

  public async inicializar(): Promise<void> { 
    if (this.reconectando) return;

    // Atribuição global imediata para evitar instâncias indefinidas no bootstrap do Pino
    (global as any).whatsappControllerInstance = this;

    const { state, saveCreds }: { state: AuthenticationState; saveCreds: () => Promise<void> } = await useMultiFileAuthState('sessao_whatsapp_socket'); 

    let pinoInterno: any;
    try {
      pinoInterno = require('pino');
    } catch {
      try {
        pinoInterno = require('@whiskeysockets/baileys/node_modules/pino');
      } catch (err) {
        throw new Error("Não foi possível carregar a biblioteca de logs Pino do ecossistema.");
      }
    }

    // SEU LOGGER INTERCEPTOR ORIGINAL RESTAURADO E COMPATIBILIZADO COM A V7
    const loggerCustomizado = pinoInterno({
      level: 'debug',
      hooks: {
        logMethod: function (this: any, inputArgs: unknown[], method: (msg: string, ...args: unknown[]) => void): void {
          const controlador = (global as any).whatsappControllerInstance;
          
          if (controlador && inputArgs.length > 0) {
            const primeiroArg = inputArgs[0];
            
            // 1. EXTRAÇÃO UNIFICADA DE TEXTO PARA VALIDAÇÃO DE SEGURANÇA
            const textoParaChecar = typeof primeiroArg === 'string' 
              ? primeiroArg 
              : JSON.stringify(primeiroArg || '');

            const ehComandoExtrairLid = textoParaChecar.includes('@extrair_lid');

            // 2. FILTRO GLOBAL DE MENSAGENS AUTORIZADAS DO SISTEMA
            const ehMensagemDoSistema = textoParaChecar.includes('✅') || 
                                        textoParaChecar.includes('📷') || 
                                        textoParaChecar.includes('🔄') || 
                                        textoParaChecar.includes('🚫') || 
                                        textoParaChecar.includes('👍') ||
                                        ehComandoExtrairLid;

            if (textoParaChecar.includes('SessionEntry') || textoParaChecar.includes('Closing session') || textoParaChecar.includes('migration')) {
              return;
            }

            // 3. ANALISADOR DE METADADOS DE REDE BRUTOS
            if (primeiroArg && typeof primeiroArg === 'object' && !Array.isArray(primeiroArg)) {
              const logData = primeiroArg as Record<string, any>;

              const remoteJid = logData.remoteJid || 
                                logData.msgAttrs?.from || 
                                logData.key?.remoteJid ||
                                logData.recv?.attrs?.from ||
                                logData.sent?.to ||
                                logData.jid ||
                                logData.fromJid ||
                                logData.lidUser;
              
              const ehConversaIndividualPrivada = remoteJid && remoteJid.endsWith('@s.whatsapp.net');

              if (remoteJid && !controlador.IDs_PERMITIDOS.includes(remoteJid) && !ehComandoExtrairLid && !ehConversaIndividualPrivada) {
                return;
              }

              if (logData.pnUser && logData.lidUser) {
                const pnLimpo = String(logData.pnUser);
                const lidLimpo = String(logData.lidUser);
                const chaveUnicaSessao = `log:${pnLimpo}:${lidLimpo}`;

                if (!lidsProcessadosHoje.has(chaveUnicaSessao)) {
                  lidsProcessadosHoje.add(chaveUnicaSessao);

                  MotoristaService.vincularLidAoTelefone(pnLimpo, lidLimpo).catch((err) => {
                    // Se falhar no banco, remove do Set para permitir nova tentativa futura
                    lidsProcessadosHoje.delete(chaveUnicaSessao);
                  });
                }
              }

              if (!remoteJid) {
                if (textoParaChecar.includes('buffer') || textoParaChecar.includes('USync') || textoParaChecar.includes('identity')) {
                  return;
                }
              }
            }

            if (!ehMensagemDoSistema) {
              return; 
            }
          }
          
          method.apply(this, inputArgs as [string, ...unknown[]]);
        }
      }
    });

    try {
      console.log('🌐 [WHATSAPP] Consultando versão atual do protocolo com o servidor...');
      
      // 🔥 MÓDULO SEM HARDCODE: Descobre a versão aceita em tempo real e derruba o erro 405
      const { version } = await fetchLatestWaWebVersion({});

      this.sock = makeWASocket({ 
        auth: state, 
        logger: loggerCustomizado, 
        version: version, // Aplica dinamicamente a versão da consulta assíncrona
        defaultQueryTimeoutMs: undefined,
        browser: Browsers.ubuntu('Chrome'), // 🔥 MÓDULO SEM HARDCODE: Assinatura nativa aceita
        syncFullHistory: false, 
        markOnlineOnConnect: true
      }); 

    } catch (errFetchVersion) {
      console.error('❌ [ERRO] Falha ao obter a versão online. Usando contingência interna...');
      this.sock = makeWASocket({ 
        auth: state, 
        logger: loggerCustomizado, 
        browser: Browsers.appropriate('Chrome'),
        syncFullHistory: false, 
        markOnlineOnConnect: true
      }); 
    }

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => { 
      const { connection, lastDisconnect, qr } = update; 
      if (qr) { 
        console.log('\n📷 [WHATSAPP] Novo QR Code gerado! Escaneie para conectar:'); 
        qrcode.generate(qr, { small: true }); 
      } 
      if (connection === 'open') { 
        this.reconectando = false;
        this.conectado = true;
        console.log('✅ WhatsApp conectado e pronto para uso via Socket Puro!'); 
        
        this.escutarMensagens(); 
        this.configurarCronjobs();
      } 
      if (connection === 'close') { 
        this.conectado = false;
        const erroCode = (lastDisconnect?.error as Boom)?.output?.statusCode || 
                         (lastDisconnect?.error as any)?.statusCode;
                         
        const deveReconectar = erroCode !== 419 && erroCode !== DisconnectReason.loggedOut; 

        if (deveReconectar) { 
          if (this.reconectando) return;
          this.reconectando = true;

          console.log(`🔄 Conexão perdida (Código: ${erroCode}). Tentando restabelecer Socket em 7 segundos...`); 
          this.destruirCronjobs();
          
          if (this.sock) {
            try { this.sock.end(undefined); } catch {}
          }

          // Delay controlado para evitar sobrecarga nas requisições do WhatsApp
          setTimeout(() => {
            this.reconectando = false;
            this.inicializar(); 
          }, 7000); 
          
        } else { 
          console.log(`🚫 Conexão encerrada permanentemente (Código: ${erroCode}). Sessão inválida: apague/renomeie a pasta sessao_whatsapp_socket e leia o novo QR Code.`); 
          this.destruirCronjobs();
          this.reconectando = false;
        } 
      } 
    });
  }

// Propriedade da classe para armazenar as tarefas ativas
  private tarefasAtivas: ScheduledTask[] = [];

  private configurarCronjobs(): void { 
    if (!this.grupoId) return; 

    this.destruirCronjobs();

    // 1. Para e limpa agendamentos anteriores
    this.tarefasAtivas.forEach(tarefa => tarefa.stop());
    this.tarefasAtivas = [];

    const cronOptions = {
      timezone: "America/Sao_Paulo"
    };

    // 2. Job da escala (Executa às 20:20)
    const jobEscala = cron.schedule('25 20 * * *', async () => { 
      try { 
        const lista = await this.registroService.buscarOuCriarListaDoDia(); 
        const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id); 
        await this.enviarMensagemElegante(this.grupoId, "📋 ESCALA DO DIA", relatorio); 
      } catch (error: unknown) { 
        console.error(`[ERRO CRON 20h25]: ${(error as Error).message}`); 
      } 
    }, cronOptions); 

    // 3. Job de Ban (Executa às 20:05)
    const jobBanimento = cron.schedule('5 20 * * *', async () => { 
      try { 
        const lista = await this.registroService.buscarOuCriarListaDoDia(); 
        const penalizados = await this.registroService.buscarMotoristasPenalizados(lista.id); 
        if (penalizados && penalizados.length > 0) { 
          const relatorio = penalizados.map((m, i) => `${i + 1}. *${m.nome}*`).join('\n');
          const msg = `Os seguintes motoristas queimaram a largada:\n\n${relatorio}`; 
          await this.enviarMensagemElegante(this.grupoId, "⚠️ QUEIMARAM A LARGADA", msg); 
        } 
      } catch (error: unknown) { 
        console.error(`[ERRO CRON 20h04]: ${(error as Error).message}`); 
      } 
    }, cronOptions); 

    // 4. Listar rotas atribuídas da tarde (Executa às 20:27)
    // const jobRotasTarde = cron.schedule('0 8 * * *', async () => { 
    //   try {  
    //     const lista = await this.registroService.buscarOuCriarListaDoDia();
    //     const diaDoJoinha = new Date(lista.dia).getDate() -1;

    //     const resultado = await this.escalaService.obterTextoPeriodoTarde(diaDoJoinha); 
        
    //     // 💡 Correção: Enviando direto pelo socket para aceitar as menções e manter o @lid funcionando
    //     if (this.sock) {
    //       await this.sock.sendMessage(this.grupoId!, { 
    //         text: resultado.texto, 
    //         mentions: resultado.mencoes 
    //       });
    //     }
    //   } catch (error: unknown) { 
    //     console.error(`[ERRO CRON 08h00]: ${(error as Error).message}`); 
    //   } 
    // }, cronOptions);

    // 5. Listar rotas atribuídas madrugada (Executa às 16:00)
    const jobRotasMadrugada = cron.schedule('00 16 * * *', async () => { 
      try {  
        const lista = await this.registroService.buscarOuCriarListaDoDia();
        const diaDoJoinha = new Date(lista.dia).getDate() -1;

        const resultado = await this.escalaService.obterTextoPeriodoMadrugada(diaDoJoinha); 
        
        // 💡 Correção: Enviando direto pelo socket para aceitar as menções e manter o @lid funcionando
        if (this.sock) {
          await this.sock.sendMessage(this.grupoId!, { 
            text: resultado.texto, 
            mentions: resultado.mencoes 
          });
        }
      } catch (error: unknown) { 
        console.error(`[ERRO CRON 16:00]: ${(error as Error).message}`); 
      }
    }, cronOptions);

    // Salva as tarefas ativas no array da classe para desativação futura
    this.tarefasAtivas.push(jobEscala, jobBanimento, jobRotasMadrugada);
  }


    // Executado na desconexão do bot ou encerramento limpo do app
  public destruirCronjobs(): void {
    if (this.tarefasAtivas.length === 0) return;

    console.log(`[CRON] Parando ${this.tarefasAtivas.length} tarefas agendadas...`);
    this.tarefasAtivas.forEach(tarefa => tarefa.stop());
    this.tarefasAtivas = [];
  }

  private async escutarMensagens(): Promise<void> {
    if (!this.sock) return;

    this.sock.ev.on('messages.upsert', async (m: { messages: proto.IWebMessageInfo[] }) => { 
        for (const msg of m.messages) {
            if (!msg || !msg.message || !msg.key) continue; 

            // 1. CHECAGEM DE TEMPO TOLERANTE A QUEDAS (Tolerância estrita de 30 minutos)
            const timestampOficialSegundos = msg.messageTimestamp ? Number(msg.messageTimestamp) : Math.floor(Date.now() / 1000);
            const timestampJanelaLimite = Math.floor(Date.now() / 1000) - 1800;

            if (timestampOficialSegundos < timestampJanelaLimite) {
                continue;
            }

            const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
            const textoLimpo = texto.replace(/[\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();

            if (msg.key.fromMe && textoLimpo.startsWith('*SOLICITAÇÃO*')) {
            continue;
            } 
            
            // Captura o chat dinâmico atual (grupo ou privado)
            const chatDeOrigemId = msg.key.remoteJid || '';

            // 🔥 CORREÇÃO EXATA PARA EVITAR O ID DO GRUPO (120363...)
            let autorRaw = '';

            if (msg.key.fromMe) {
                // Se veio do próprio chip, extrai estritamente o ID do usuário conectado
                const usuarioLogado = this.sock?.user as any;
                autorRaw = usuarioLogado?.lid || usuarioLogado?.id || '';
            } else {
                // Se veio de terceiros, usa o participante do grupo ou o chat de origem
                autorRaw = msg.key.participant || chatDeOrigemId;
            }

            // Garante que o autorRaw nunca seja o ID de um grupo (@g.us)
            if (autorRaw.endsWith('@g.us') && msg.message?.extendedTextMessage?.contextInfo?.participant) {
                autorRaw = msg.message.extendedTextMessage.contextInfo.participant;
            }

            // Limpa de vez sufixos como :1, :2 e remove o @s.whatsapp.net ou @lid
            const autorLid = autorRaw.split('@')[0].split(':')[0].trim();
            if (!autorLid || autorLid.endsWith('g.us')) continue;


            // =========================================================================
            // INTERCEPTADORES GLOBAIS DE EXTRAÇÃO MANUAL (RODAM EM QUALQUER CHAT)
            // =========================================================================
            if (textoLimpo.startsWith('@extrair_lid_usuario')) {
                const ehAdmin = msg.key.fromMe || await this.registroService.verificarSeEhAdmin(autorLid, this.sock!);
                if (!ehAdmin) continue; 

                let idDesejadoPuro = '';
                const termoNomeBuscado = textoLimpo.replace(/^@extrair_lid_usuario\s+/i, '').replace(/@/g, '').trim().toLowerCase();

                if (!termoNomeBuscado) {
                    await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", "❌ *Informe o nome do perfil para pesquisar.*\n\n💡 Exemplo: `@extrair_lid_usuario Nome do Perfil`");
                    continue;
                }

                if (chatDeOrigemId.endsWith('@g.us')) {
                    try {
                        const metadadosDoGrupo = await this.sock!.groupMetadata(chatDeOrigemId);
                        if (metadadosDoGrupo && metadadosDoGrupo.participants) {
                            const membroLocalizado = metadadosDoGrupo.participants.find(integrante => {
                                const nomeNoPerfil = String((integrante as any).name || (integrante as any).notify || '').toLowerCase();
                                return nomeNoPerfil.includes(termoNomeBuscado) || integrante.id.includes(termoNomeBuscado);
                            });

                            if (membroLocalizado) {
                                idDesejadoPuro = membroLocalizado.id.replace(/:[0-9]+/, '').split('@')[0];
                            }
                        }
                    } catch (erroMembros) {
                        console.error("[ERRO REQUISIÇÃO METADADOS GRUPO]", erroMembros);
                    }
                }

                if (!idDesejadoPuro) {
                    await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", `❌ *Não encontrei nenhum integrante com o nome "${termoNomeBuscado}" neste grupo.*`);
                    continue;
                }

                console.log('\n==================================================');
                console.log(`👤 [LID LOCALIZADO VIA COMANDO] Chat: ${chatDeOrigemId}`);
                console.log(`📌 LID EXTRAÍDO: ${idDesejadoPuro}`);
                console.log('==================================================\n');

                await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", `👤 *LID do usuário localizado!*\n\n📌 ID Puro: \`${idDesejadoPuro}\`\n🧩 JID Completo: \`${idDesejadoPuro}@lid\``);
                continue; 
            }

            if (textoLimpo === '@extrair_lid') {
                const ehAdmin = msg.key.fromMe || await this.registroService.verificarSeEhAdmin(autorLid, this.sock!);
                if (!ehAdmin) continue; 

                console.log('\n==================================================');
                console.log('🔍 [EXTRAÇÃO DE LID DO GRUPO] Sucesso:');
                console.log(`📌 LID/JID DO CHAT: ${chatDeOrigemId}`);
                console.log('==================================================\n');

                await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", `✅ *LID do Chat extraído com sucesso!*\n\n📌 ID: \`${chatDeOrigemId}\``);
                continue; 
            }

            // EXECUÇÃO DO MÉTODO DE COMANDOS ADMIN GLOBAIS
            if (textoLimpo.startsWith('@')) { 
                const processado = await this.processarComandosAdmin(msg, textoLimpo, autorLid); 
                if (processado) continue; 
            }
            // =========================================================================
            // REGRAS DE NEGÓCIO DIÁRIAS (FILTRA OS GRUPOS PERMITIDOS DE MOTORISTAS E PASSAGEIROS)
            // =========================================================================
            // 🚀 CAPTURA AUTOMÁTICA DENTRO DO GRUPO: Roda sempre que houver QUALQUER interação nos grupos de passageiros
            const ehGrupoEscalaComum = this.IDs_PERMITIDOS.includes(chatDeOrigemId);
            const ehGrupoPassageirosValido = this.GRUPOS_PASSAGEIROS.includes(chatDeOrigemId);
                // =========================================================================
                // 👥 LOOP DE PASSAGEIROS: Auto-Cadastro Prévio via Grupo (Uso: @cadastro Nome)
                // =========================================================================
                if (ehGrupoPassageirosValido && textoLimpo.startsWith('@cadastro ')) {
                    try {
                        // 1. Valida se a janela está aberta pelo Admin
                        if (!this.cadastroPassageiroAberto) {
                            await this.enviarMensagemElegante(chatDeOrigemId, "CADASTRO PASSAGEIRO", "🔒 *O cadastro de passageiros está fechado no momento.*\n\nAguarde a liberação pelo administrador.");
                            continue;
                        }

                        // 2. Isola o texto do nome digitado pelo usuário
                        const nomePassageiroDigitado = textoLimpo.replace('@cadastro ', '').trim();

                        if (!nomePassageiroDigitado || nomePassageiroDigitado.length < 3) {
                            await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", "❌ *Informe seu nome completo para realizar o cadastro.*\n\n💡 Exemplo: `@cadastro João da Silva`");
                            continue;
                        }

                        // 3. Isola o ID numérico puro do LID de quem enviou a mensagem via cabeçalho nativo
                        const jidLidLimpo = autorLid ? autorLid.replace(/:[0-9]+/, '').split('@')[0].trim() : '';

                        if (!jidLidLimpo) {
                            await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", "❌ *Não foi possível identificar o seu ID de rede para realizar o cadastro.*");
                            continue;
                        }

                        const passageiroRepo = AppDataSource.getRepository(Passageiro);

                        // 4. Bloqueia se o LID já constar na tabela do banco
                        const passageiroExistente = await passageiroRepo.findOneBy({ whatsAppLid: jidLidLimpo });

                        if (passageiroExistente) {
                            await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", `⚠️ *Você já possui um cadastro no sistema!*\n\n👤 Nome: *${passageiroExistente.nome}*\n🆔 Seu ID no banco: \`${passageiroExistente.id}\``);
                            continue;
                        }

                        // 5. Injeta o registro no MySQL gerando o ID sequencial para o seu App
                        const novoPassageiro = passageiroRepo.create({
                            nome: nomePassageiroDigitado,
                            whatsAppLid: jidLidLimpo,
                            telefoneWhatsApp: `LID-${jidLidLimpo}`, // String temporária para não quebrar a restrição UNIQUE
                            ativo: false,
                            solicitacao: false
                        });

                        await passageiroRepo.save(novoPassageiro);

                        console.log(`\n==================================================`);
                        console.log(`✅ [NOVO AUTO-CADASTRO DE PASSAGEIRO REALIZADO]`);
                        console.log(`👤 NOME REGISTRADO: ${nomePassageiroDigitado}`);
                        console.log(`🆔 ID GERADO NO MYSQL: ${novoPassageiro.id}`);
                        console.log(`🧩 WHATSAPP_LID VINCULADO: ${jidLidLimpo}`);
                        console.log(`==================================================\n`);

                        await this.enviarMensagemElegante(
                            chatDeOrigemId, 
                            "🤖 BOT CADASTRO", 
                            `✅ *Olá *${nomePassageiroDigitado}*, seu perfil foi pré-cadastrado com sucesso!*\n\n🆔 Número do seu Registro: \`${novoPassageiro.id}\`\n🧩 ID de Rede Vinculado: \`${jidLidLimpo}\`\n\n⏳ *Aguarde a liberação e a configuração da sua Empresa/Endereço pelo Painel do Administrador.*`
                        );

                    } catch (errAutoCad: any) {
                        console.error(`❌ [FALHA NO AUTO-CADASTRO]:`, errAutoCad);
                        await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", `💥 *Erro ao processar cadastro:* ${errAutoCad.message}`);
                    }
                    continue;
                }

            // =========================================================================
            // Mapeamentos cruzados legados de segurança de rede para motoristas/administradores
            // =========================================================================
            let foneRealMapeado = msg.key.participant || msg.message?.extendedTextMessage?.contextInfo?.participant || '';
            if (msg.key.fromMe && this.sock?.user?.id) {
                const usuarioLogado = this.sock.user as any;
                foneRealMapeado = usuarioLogado.lid || usuarioLogado.id || '';
            }

            if (foneRealMapeado && String(foneRealMapeado).includes('@s.whatsapp.net')) {
                const fonePuro = String(foneRealMapeado).split('@')[0].replace(/\D/g, '');
                const chaveUnicaVinculo = `vinc:${fonePuro}:${autorLid}`;
                
                // Só bate no banco se esse par de JID/LID ainda não tiver sido associado na sessão atual
                if (!lidsProcessadosHoje.has(chaveUnicaVinculo)) {
                    lidsProcessadosHoje.add(chaveUnicaVinculo);

                    Promise.all([
                        MotoristaService.vincularLidAoTelefone(fonePuro, autorLid),
                        AdministradorService.vincularLidAoTelefone(fonePuro, autorLid)
                    ]).catch(() => {
                        lidsProcessadosHoje.delete(chaveUnicaVinculo);
                    });
                }
            }

            const timestampOficialMs = timestampOficialSegundos * 1000;

            try { 
                // LOOP DE MOTORISTAS: Cadastro Híbrido (Apenas nos grupos de escala)
                if (ehGrupoEscalaComum && textoLimpo.startsWith('@cadastrar ')) { 
                    if (!this.cadastroAberto) { 
                        await this.enviarMensagemElegante(chatDeOrigemId, "CADASTRO", "🔒 O cadastro está fechado."); 
                        continue; 
                    } 
                    const nome = textoLimpo.replace('@cadastrar ', '').trim(); 
                    await this.registroService.cadastrarMotorista(nome, autorLid, this.sock!); 
                    await this.enviarMensagemElegante(chatDeOrigemId, "CADASTRO", `✅ *${nome}*, você foi cadastrado com sucesso!`); 
                    continue; 
                }

                // LOOP DE MOTORISTAS: Tratamento da Janela de Bloqueio / Largada Queimada
                if (ehGrupoEscalaComum && this.isJanelaBanimento(timestampOficialMs)) { 
                    const lista = await this.registroService.buscarOuCriarListaDoDia(); 
                    if (EmojiHelper.isJoinha(textoLimpo)) { 
                        await this.registroService.adicionarJoinhaPenalizado(autorLid, lista.id, this.sock!, timestampOficialMs); 
                    } else { 
                        await this.registroService.registrarBanimentoAntecipado(autorLid, this.sock!); 
                    } 
                    continue;
                } 

                // LOOP DE MOTORISTAS: Tratamento da Janela Regulamentar de Confirmação de Presença
                if (ehGrupoEscalaComum && this.isJanelaJoinha(timestampOficialMs)) { 
                    if (EmojiHelper.isJoinha(textoLimpo)) { 
                        const lista = await this.registroService.buscarOuCriarListaDoDia(); 
                        let motorista = await MotoristaService.buscarPorLid(autorLid); 

                        if (motorista) { 
                            const dataHoje = this.registroService['obterDataHoje'](); 
                            const banidoHoje = await AppDataSource.getRepository(Banimento).findOneBy({ 
                                motorista: { id: motorista.id }, 
                                dia: dataHoje 
                            }) as Record<string, unknown> | null;

                            if (banidoHoje) {
                                // 💡 CORREÇÃO: Trocado o ID cru pelo nome do motorista em negrito
                                await this.enviarMensagemElegante(chatDeOrigemId, "AVISO", `⚠️ *${motorista.nome}*, você está impedido de dar o joinha hoje.`);
                                continue;
                            }

                            await this.registroService.adicionarJoinha(autorLid, lista.id, this.sock!, timestampOficialMs);
                        }
                    }
                }

                // =========================================================================
                // 🚀 PASSAGEIROS - PARTE 1: CAPTURA, CALENDÁRIO E REGISTRO NO BANCO
                // =========================================================================
                const ehComandoSolicitacao = textoLimpo.startsWith('@solicitacao');
                const ehComandoCancelamento = textoLimpo.startsWith('@cancelar');

                if (ehGrupoPassageirosValido && (ehComandoSolicitacao || ehComandoCancelamento)) {
                    try {
                        const operacao = textoLimpo.startsWith('@solicitacao') ? "CONFIRMAR" : "CANCELAR";
                        const prefixo = textoLimpo.startsWith('@solicitacao') ? /^@solicitacao\s*/i : /^@cancelar\s*/i;
                        const argumentos = textoLimpo.replace(prefixo, '').trim().toLowerCase();

                        const matchDia = argumentos.match(/\b\d{1,2}\b/);
                        const matchTurno = argumentos.match(/\b(ida|volta)\b/);

                        if (!matchDia || !matchTurno) {
                            const termoCmd = operacao === "CONFIRMAR" ? '@solicitacao' : '@cancelar';
                            await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", `❌ *Formato inválido.*\n\nUse:\n\`${termoCmd} [ida/volta] [Dia]\`\n\n💡 Exemplo: \`${termoCmd} ida 17\``);
                            continue;
                        }

                        const diaDigitado = parseInt(String(matchDia), 10);
                        const turnoInformado = String(matchTurno).trim().toLowerCase();

                        // 📅 CALCULO DO CALENDÁRIO OPERACIONAL (Trata hoje, amanhã e viradas de mês nativamente)
                        const agora = new Date();
                        let anoAlvo = agora.getFullYear();
                        let mesAlvo = agora.getMonth();

                        if (diaDigitado < agora.getDate()) {
                            mesAlvo += 1;
                            if (mesAlvo > 11) { mesAlvo = 0; anoAlvo += 1; }
                        }

                        const dataTratadaPassageiro = new Date(anoAlvo, mesAlvo, diaDigitado, 12, 0, 0, 0);
                        const diaRealTratado = dataTratadaPassageiro.getDate();

                        console.log(`🛰️ [RASTREIO DATA] Dia Tratado: ${diaRealTratado} | Mês: ${mesAlvo + 1} | Turno: ${turnoInformado}`);

                        // 1. Grava a intenção do passageiro no banco de dados via Service Legado
                        const resultado = await this.registroService.gerenciarSolicitacaoPorLid(autorLid, diaRealTratado, turnoInformado, operacao);
                        
                        if (!resultado || !resultado.nomePassageiro) {
                            await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", `❌ *Perfil ou viagem não localizada no sistema para o dia informado.*`);
                            continue;
                        }

                        const emojiSucesso = operacao === "CONFIRMAR" ? "✅" : "🗑️";
                        const msgSucesso = operacao === "CONFIRMAR" ? "confirmada" : "cancelada";
                        
                        // Responde no grupo confirmando para o passageiro
                        await this.sock!.sendMessage(chatDeOrigemId, {
                            text: `*SOLICITAÇÃO*\n\n${emojiSucesso} Olá *${resultado.nomePassageiro}*, sua presença para a viagem de *${turnoInformado.toUpperCase()}* no dia *${resultado.dataFormatada || diaRealTratado}* foi *${msgSucesso}* com sucesso!`
                        });
                        // =========================================================================
                        // 🚀 PASSAGEIROS - PARTE 2: TRIPLA BARREIRA DE CONVERGÊNCIA DO MOTORISTA
                        // =========================================================================
                        let jidDestinatarioMotorista = "";
                        let nomeMotoristaLog = "";

                        // Barreira Primária: Se o service preencher o LID diretamente, trata mantendo a tipagem estrita de string
                        if (resultado.motoristaLid && resultado.motoristaLid.trim() !== "") {
                            const motoristaLidStr = String(resultado.motoristaLid);
                            const idLimpo = motoristaLidStr.replace(/:[0-9]+/, '').trim().split('@')[0];
                            jidDestinatarioMotorista = idLimpo.length > 13 || idLimpo.startsWith('351') ? `${idLimpo}@lid` : `${idLimpo}@s.whatsapp.net`;
                        } 
                        // Barreira de Contingência: Busca a rota real do passageiro e chama o motor especialista
                        else {
                            console.log(`🔍 [CONVERGÊNCIA] "motoristaLid" veio nulo. Executando o seu Motor de Consulta Especialista...`);
                            try {
                                const passageiroRepo = AppDataSource.getRepository(Passageiro);
                                const passageiroDb = await passageiroRepo.findOne({
                                    where: { whatsAppLid: autorLid },
                                    relations: ['rota']
                                });

                                const rotaIdDoPassageiro = (passageiroDb as any)?.rota?.id;

                                if (rotaIdDoPassageiro) {
                                    console.log(`📌 [CONVERGÊNCIA ROTA] Buscando ID da ListaJoia dinamicamente para o dia operacional...`);
                                    
                                    // Localiza a ListaJoia do dia no banco recuando os dias da Escala Mãe correspondentes (Tarde=1, Madrugada=2)
                                    const dataListaJoia = new Date(dataTratadaPassageiro);
                                    const diasParaSubtrair = turnoInformado === 'ida' ? 1 : 2;
                                    dataListaJoia.setDate(dataListaJoia.getDate() - diasParaSubtrair);

                                    const inicioDiaJoia = new Date(dataListaJoia.getFullYear(), dataListaJoia.getMonth(), dataListaJoia.getDate(), 0, 0, 0, 0);
                                    const fimDiaJoia = new Date(dataListaJoia.getFullYear(), dataListaJoia.getMonth(), dataListaJoia.getDate(), 23, 59, 59, 999);

                                    const listaOrigem = await AppDataSource.getRepository('ListaJoia').createQueryBuilder("lista")
                                        .where("lista.dia BETWEEN :inicioDiaJoia AND :fimDiaJoia", { inicioDiaJoia, fimDiaJoia })
                                        .getOne();

                                    if (listaOrigem) {
                                        console.log(`🎯 [CONVERGÊNCIA DATA] ListaJoia localizada dinamicamente. ID do Banco: ${(listaOrigem as any).id}`);

                                        // Executa o seu próprio método especialista passando o ID dinâmico encontrado
                                        const motoristaEspecialista = await this.escalaService.encontrarMotoristaResponsavel(
                                            rotaIdDoPassageiro,
                                            (listaOrigem as any).id,
                                            dataTratadaPassageiro
                                        );

                                        if (motoristaEspecialista) {
                                            nomeMotoristaLog = motoristaEspecialista.nome;
                                            if (motoristaEspecialista.whatsAppLid && motoristaEspecialista.whatsAppLid.trim() !== "") {
                                                const lidPuro = String(motoristaEspecialista.whatsAppLid).replace(/:[0-9]+/, '').trim().split('@')[0];
                                                jidDestinatarioMotorista = `${lidPuro}@lid`;
                                            } else if (motoristaEspecialista.telefoneWhatsApp) {
                                                jidDestinatarioMotorista = `${String(motoristaEspecialista.telefoneWhatsApp).replace(/\D/g, '')}@s.whatsapp.net`;
                                            }
                                        }
                                    } else {
                                        console.warn(`⚠️ [AVISO] Nenhuma ListaJoia correspondente foi localizada no banco para a data da viagem.`);
                                    }
                                }
                            } catch (errMotorEspecialista) {
                                console.error("❌ Erro ao processar o motor especialista de consulta de motorista:", errMotorEspecialista);
                            }
                        }

                        // 3. Despacha a notificação privada se o destino foi localizado com sucesso
                        if (jidDestinatarioMotorista) {
                            const statusAcao = operacao === "CONFIRMAR" ? "Confirmou Presença ✅" : "Cancelou Viagem 🗑️";
                            const identificadorVisual = nomeMotoristaLog ? `*${nomeMotoristaLog}*` : "Motorista";
                            
                            const textNotificacaoPrivada = `👋 *Olá ${identificadorVisual}!*\n\nHouve uma atualização de passageiro na rota em que você está escalado:\n\n👤 *Passageiro:* ${resultado.nomePassageiro}\n🌅 *Turno:* ${turnoInformado.toUpperCase()}\n📅 *Data da Viagem:* ${resultado.dataFormatada || diaRealTratado}\n⚙️ *Status:* ${statusAcao}`;

                            try {
                                await this.sock!.sendMessage(jidDestinatarioMotorista, { text: textNotificacaoPrivada });
                                console.log(`✅ [SUCESSO] Alerta privado entregue com sucesso para o motorista no JID: ${jidDestinatarioMotorista}`);
                            } catch (errEnvioSocket: any) {
                                console.error(`❌ [FALHA NO ENVIO PRIVADO DO MOTORISTA]:`, errEnvioSocket.message);
                            }
                        } else {
                            console.warn(`⚠️ [AVISO CONSOLE] O motorista não foi notificado por falta de parâmetros de contato.`);
                        }

                    } catch (errNegocio: any) {
                        console.error("💥 [FALHA CRÍTICA NO FLUXO DE PASSAGEIROS]:", errNegocio);
                    }
                    continue;
                }

            } catch (err: any) {
                console.error("❌ Falha crítica no loop interno:", err.message);
                if (ehGrupoPassageirosValido) {
                    await this.enviarMensagemElegante(chatDeOrigemId, "AVISO", `❌ Erro no processamento: ${err.message}`);
                }
            }
        }
    });
  }
 
  // 1. CAPTURA DINÂMICA DO CHAT ATUAL (Pode ser o grupo OU o seu chat privado)
    // 1. CAPTURA DINÂMICA DO CHAT ATUAL (Pode ser o grupo OU o seu chat privado)
  private async processarComandosAdmin(msg: proto.IWebMessageInfo, comando: string, autorLid: string): Promise<boolean> { 
    const chatDeOrigemId = msg.key!.remoteJid || '';
    if (!chatDeOrigemId) return false;

    // 🚀 EXCEÇÃO CIRÚRGICA: Se for comando de passageiro, sai do bloco admin na hora sem olhar o banco
    const textoMinusculo = comando.toLowerCase().trim();
    if (textoMinusculo.startsWith('@solicitacao') || textoMinusculo.startsWith('@cancelar') || textoMinusculo.startsWith('@cadastro')) {
        return false;
    }

    const partes = comando.trim().split(/\s+/); 
    const acao = partes[0];      
    const parametro = partes[1];

    // 🔥 BARREIRA DE SEGURANÇA: Lista estrita de comandos administrativos válidos do seu painel
    const comandosAdminValidos = [
      '@motoristas', '@abrir_cadastro', '@fechar_cadastro', '@tipo_dia', '@limpar_dia', 
      '@listar_feriados', '@add', '@inserir', '@remover', '@notificar', '@notificacao', 
      '@ativar', '@inativar', '@extrair_lid', '@refazer', '@tarde', '@madrugada', 
      '@escala_completa', '@escala', '@vincular', '@janela_cadastro', '@passageiros', 
      '@ajuda_admin', '@ajuda', '@instrucao_solicitacao', '@instrucao'
    ];
    
    // Se o texto não for um comando administrativo conhecido, aborta imediatamente sem tocar no banco de dados
    if (!comandosAdminValidos.includes(acao)) {
        return false;
    }

    // 🔥 CURTO-CIRCUITO LÓGICO: Se a mensagem veio do próprio Bot (fromMe), pula o SELECT no banco direto para true
    const isAdmin = msg.key!.fromMe || await this.registroService.verificarSeEhAdmin(autorLid, this.sock!); 
    if (!isAdmin) return false; 
 

    // COMANDO ADMINISTRATIVO: @motoristas
    if (acao === '@motoristas') { 
      const motoristas = await MotoristaService.listarMotoristas(); 
      if (!motoristas || motoristas.length === 0) { 
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "MOTORISTAS", "📭 Nenhum motorista cadastrado."); 
        return true; 
      } 
      let relatorio = ""; 
      motoristas.forEach((m, i) => { 
        relatorio += `${i + 1}. *${m.nome}*\n🆔 ${m.whatsAppLid || 'Aguardando interação'} ${m.ativo ? "✅" : "🚫"}\n\n`; 
      }); 
      // CORREÇÃO: Alinhado para chatDeOrigemId
      await this.enviarMensagemElegante(chatDeOrigemId, "👥 LISTA DE MOTORISTAS", relatorio); 
      return true; 
    } 

    // COMANDO ADMINISTRATIVO: @abrir_cadastro
    if (acao === '@abrir_cadastro') { 
      this.cadastroAberto = true; 
      // CORREÇÃO: Alinhado para chatDeOrigemId
      await this.enviarMensagemElegante(
        chatDeOrigemId, 
        "CADASTRO LIBERADO", 
        "🔓 *CADASTRO LIBERADO!*\n\n Digite: `@cadastrar Seu Nome`\n\n Exemplo: `@cadastrar Joao da Silva`"
      ); 
      return true; 
    } 

    // COMANDO ADMINISTRATIVO: @fechar_cadastro
    if (acao === '@fechar_cadastro') { 
      this.cadastroAberto = false; 
      // CORREÇÃO: Alinhado para chatDeOrigemId
      await this.enviarMensagemElegante(
        chatDeOrigemId, 
        "CADASTRO FECHADO", 
        "🔒 *CADASTRO FECHADO!*\n\n🚫 Aguarde a liberação pelo adm para se cadastrar novamente."
      );
      return true;
    } 

    // COMANDO ADMINISTRATIVO: @tipo_dia [DD/MM/AAAA] [TIPO]
    if (acao === '@tipo_dia') { 
      const tipoInformado = partes[2]; 
      if (!parametro || !tipoInformado) { 
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ Use: `@tipo_dia DD/MM/AAAA DIA_LIVRE`."); 
        return true; 
      } 
      try { 
        await this.escalaService.definirTipoDiaManual(parametro, tipoInformado as 'DIA_LIVRE' | 'DIA_COMUM'); 
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "CONFIGURAÇÃO", `✅ Tipo_Dia configurado.`); 
      } catch (error: unknown) { 
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", (error as Error).message); 
      } 
      return true; 
    } 

    // COMANDO ADMINISTRATIVO: @limpar_dia [DD/MM/AAAA]
    if (acao === '@limpar_dia') { 
      if (!parametro) {
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ Informe a data: `@limpar_dia DD/MM/AAAA`.");
        return true; 
      }
      await this.escalaService.removerTipoDiaManual(parametro); 
      // CORREÇÃO: Alinhado para chatDeOrigemId
      await this.enviarMensagemElegante(chatDeOrigemId, "CONFIGURAÇÃO", `✅ Marcação removida.`); 
      return true; 
    } 

    // COMANDO ADMINISTRATIVO: @listar_feriados
    if (acao === '@listar_feriados') { 
      const lista = await this.escalaService.listarDiasManuais(); 
      // CORREÇÃO: Alinhado para chatDeOrigemId
      await this.enviarMensagemElegante(chatDeOrigemId, "📅 FERIADOS", lista); 
      return true; 
    }

    // Captura de Menções / Contexto do WhatsApp (Baileys)
    const listaMencoes = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid; 
    const mencionadoJid = listaMencoes && listaMencoes.length > 0 ? listaMencoes[0] : null; 
    const lidMencionado = mencionadoJid ? mencionadoJid.replace(/:[0-9]+/, '').split('@')[0] : null; 

    // COMANDO ADMINISTRATIVO CORRIGIDO: @add @Mencao [dia] OU @add NomeDoMotorista [dia]
    if (acao === '@add') { 
      try { 
        // 1. Captura o dia se houver um número no fim do comando, caso contrário assume a data de hoje
        const matchDia = comando.match(/\s+(\d+)$/);
        const diaDigitado = matchDia ? parseInt(matchDia[1], 10) : undefined;
        
        // Gera o objeto Date seguro tratando fuso horário e virada de mês
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);

        // Cenário A: Adição administrativa por menção direta (@Mencao)
        if (lidMencionado) { 
          // 🚀 CORREÇÃO: Passa 'dataAlvo' (Date) em vez de 'lista.id' (number)
          await this.registroService.adicionarMotoristaManualmente(lidMencionado, dataAlvo, this.sock!); 
          await this.enviarMensagemElegante(chatDeOrigemId, "SUCESSO", `✅ Adicionado no fim da fila da escala por menção.`); 
          return true; 
        } 

        // Cenário B: Adição administrativa por busca textual de nome
        // Limpa a string removendo o comando e o dígito do dia para isolar apenas o termo do nome
        const textoSemAcao = comando.replace(/@add\s+/i, '').replace(/\s+\d+$/, '').trim();
        if (!textoSemAcao) {
          await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", `❌ Marque um usuário ou digite o nome: \`@add Nome [dia]\``);
          return true;
        }

        const motoristaPorNome = await AppDataSource.getRepository(Motorista).findOne({
          where: { nome: ILike(`%${textoSemAcao}%`), ativo: true } 
        });

        if (motoristaPorNome) {
          // 🚀 CORREÇÃO: Passa 'dataAlvo' (Date) em vez de 'lista.id' (number)
          await this.registroService.adicionarMotoristaManualmente(motoristaPorNome.whatsAppLid || '', dataAlvo, this.sock!);
          await this.enviarMensagemElegante(chatDeOrigemId, "SUCESSO", `✅ Adicionado motorista: *${motoristaPorNome.nome}*.`);
        } else {
          await this.enviarMensagemElegante(chatDeOrigemId, "AVISO", `❌ Motorista não encontrado por nome ou menção.`);
        }
      } catch (error: any) {
        console.error(`[ERRO @add]:`, error);
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", `❌ Falha ao adicionar: ${error.message}`);
      } 
      return true; 
    } 

    // COMANDO ADMINISTRATIVO: @inserir @Contato posição X [dia]
    // COMANDO ADMINISTRATIVO CORRIGIDO: @inserir @Contato posição X [dia]
    if (acao === '@inserir') { 
      const partesCmd = comando.split(' posição '); 
      if (!lidMencionado || partesCmd.length <= 1) {
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ Mencione o motorista. Uso: `@inserir @Contato posição X [dia]`");
        return true;
      }

      const restoTexto = partesCmd[1].trim(); 
      // Expressão regular para isolar a posição e capturar o dia opcional na cauda do texto
      const numerosMatch = restoTexto.match(/^(\d+)(?:\s+(\d+))?$/);

      if (!numerosMatch) {
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ Formato inválido. Use: `@inserir @Contato posição X [dia]`");
        return true;
      }

      const posicao = parseInt(numerosMatch[1], 10);
      const diaDigitado = numerosMatch[2] ? parseInt(numerosMatch[2], 10) : undefined;

      try { 
        // Resolve o objeto Date correto (trata fuso e virada de mês)
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        
        // Executa na RegistroService passando o objeto Date estrito
        await this.registroService.inserirEmPosicaoEspecifica(lidMencionado, dataAlvo, posicao); 
        
        const dataFormatada = `${dataAlvo.getDate().toString().padStart(2, '0')}/${(dataAlvo.getMonth() + 1).toString().padStart(2, '0')}`;
        await this.enviarMensagemElegante(chatDeOrigemId, "SUCESSO", `✅ Inserido na posição ${posicao} da lista do dia ${dataFormatada}.`); 
      } catch (error: any) {
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", `❌ ${error.message}`);
      } 
      return true; 
    } 

    // COMANDO ADMINISTRATIVO: @remover @Contato [dia]
    if (acao === '@remover') { 
      if (!lidMencionado) {
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ Identificação ausente. Por favor, marque o motorista.");
        return true;
      }

      try { 
        const matchDia = comando.match(/\s+(\d+)$/);
        const diaDigitado = matchDia ? parseInt(matchDia[1], 10) : undefined;
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);

        await this.registroService.removerMotoristaDaLista(lidMencionado, dataAlvo); 

        const dataFormatada = `${dataAlvo.getDate().toString().padStart(2, '0')}/${(dataAlvo.getMonth() + 1).toString().padStart(2, '0')}`;
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "SUCESSO", `✅ Removido com sucesso da lista do dia ${dataFormatada}.`); 
      } catch (error: unknown) { 
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", `❌ ${(error as Error).message}`);
      } 
      return true; 
    }

    // =========================================================================
    // COMANDO ADMINISTRATIVO MULTI-TURNO CORRIGIDO: @notificacao @Contato [dia_da_viagem]
    // =========================================================================
    if (acao === '@notificar') {
      if (!lidMencionado) {
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ Uso incorreto. Marque o motorista.\n\n💡 Exemplos:\n`@notificacao @Contato 26` (Tarde e Madrugada)\n`@notificacao @Contato tarde 26` (Apenas Tarde)\n`@notificacao @Contato madrugada 26` (Apenas Madrugada)");
        return true;
      }

      try {
        const matchDia = comando.match(/\b\d{1,2}\b/);
        if (!matchDia) throw new Error("Informe o dia da escala no comando. Exemplo: `26`.");
        const diaDaEscala = parseInt(matchDia[0], 10);


        const textoMinusculo = comando.toLowerCase();
        const querTarde = textoMinusculo.includes('tarde');
        const querMadrugada = textoMinusculo.includes('madrugada');
        const querAmbos = !querTarde && !querMadrugada;

        const motorista = await MotoristaService.buscarPorLid(lidMencionado);
        if (!motorista || !motorista.whatsAppLid) throw new Error("Motorista não cadastrado no sistema ou sem LID de rede.");

        const escalaService = new EscalaService();

        let blocoTardeFinal = "";
        let blocoMadrugadaFinal = "";

        // 🚀 CAPTURA SEGURO DA TARDE: Localiza e isola o bloco inteiro da rota do motorista (Incluso Passageiros)
        if (querTarde || querAmbos) {
          try {
            const resultadoTarde = await escalaService.obterTextoPeriodoTarde(diaDaEscala);
            
            // Mantém a lógica original idêntica, apenas adiciona o 🔹 para segurança caso mude o emoji
            const regexBusca = new RegExp(`([^\\n]*@${motorista.whatsAppLid}[\\s\\S]*?)(?=\\n(?:📌|🔸|🔹|🌅|🌌)|$)`, 'i');
            const matchBloco = resultadoTarde.texto.match(regexBusca);

            if (matchBloco && matchBloco[1]) {
              const regexLid = new RegExp(`@${motorista.whatsAppLid}\\b`, 'g');
              blocoTardeFinal = matchBloco[1].replace(regexLid, `*${motorista.nome}*`).trim();
            }
          } catch (errTarde) {
            console.warn(`[AVISO NOTIFICAÇÃO TARDE]: `, (errTarde as Error).message);
          }
        }

        // 🚀 CAPTURA SEGURO DA MADRUGADA
        if (querMadrugada || querAmbos) {
          try {
            const resultadoMadrugada = await escalaService.obterTextoPeriodoMadrugada(diaDaEscala);
            
            const regexBusca = new RegExp(`([^\\n]*@${motorista.whatsAppLid}[\\s\\S]*?)(?=\\n(?:📌|🔸|🔹|🌅|🌌)|$)`, 'i');
            const matchBloco = resultadoMadrugada.texto.match(regexBusca);

            if (matchBloco && matchBloco[1]) {
              const regexLid = new RegExp(`@${motorista.whatsAppLid}\\b`, 'g');
              blocoMadrugadaFinal = matchBloco[1].replace(regexLid, `*${motorista.nome}*`).trim();
            }
          } catch (errMadrugada) {
            console.warn(`[AVISO NOTIFICAÇÃO MADRUGADA]: `, (errMadrugada as Error).message);
          }
        }


        if (!blocoTardeFinal && !blocoMadrugadaFinal) {
          let msgAviso = `❌ O motorista *${motorista.nome}* não foi localizado em nenhuma rota ativa na escala do dia *${diaDaEscala}*.`;
          if (querTarde) msgAviso = `❌ O motorista *${motorista.nome}* não está escalado no turno da *TARDE* para o dia *${diaDaEscala}*.`;
          if (querMadrugada) msgAviso = `❌ O motorista *${motorista.nome}* não está escalado no turno da *MADRUGADA* para o dia *${diaDaEscala}*.`;
          
          await this.enviarMensagemElegante(chatDeOrigemId, "AVISO", msgAviso);
          return true;
        }

        let textoMensagemPrivada = `👋 *Olá Motorista!* Segue o espelho de solicitações atualizado:\n\n`;
        let confirmacaoAdmin = "✅ Relatório enviado contendo: ";

        if (blocoTardeFinal) {
          textoMensagemPrivada += `🌅 *TURNO DA TARDE*\n${blocoTardeFinal}\n\n`;
          confirmacaoAdmin += "[Turno Tarde] ";
        }
        if (blocoMadrugadaFinal) {
          textoMensagemPrivada += `🌌 *TURNO DA MADRUGADA*\n${blocoMadrugadaFinal}\n\n`;
          confirmacaoAdmin += "[Turno Madrugada] ";
        }

        const jidMotoristaPrivado = motorista.whatsAppLid.includes('@') ? motorista.whatsAppLid : `${motorista.whatsAppLid}@lid`;
        await this.sock!.sendMessage(jidMotoristaPrivado, {
          text: textoMensagemPrivada.trim()
        });

        await this.enviarMensagemElegante(chatDeOrigemId, "SUCESSO", `${confirmacaoAdmin}enviado para o privado de *${motorista.nome}*.`);

      } catch (error: any) {
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", `❌ Falha ao processar comando @notificacao: ${error.message}`);
      }
      return true;
    }

    // COMANDO ADMINISTRATIVO: @ativar ou @inativar
    if (acao === '@ativar' || acao === '@inativar') { 
      if (!lidMencionado) {
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ Identificação ausente. Marque o motorista.");
        return true; 
      }
      try {
        const motorista = await MotoristaService.buscarPorLid(lidMencionado); 
        if (!motorista) {
          // CORREÇÃO: Alinhado para chatDeOrigemId
          await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ Motorista não encontrado no banco de dados.");
          return true; 
        }
        const novoStatus = acao === '@ativar'; 
        await MotoristaService.alterarStatusAtivo(motorista.whatsAppLid || '', novoStatus); 
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "STATUS", `👤 O motorista *${motorista.nome}* foi alterado para: ${novoStatus ? "✅ Ativo" : "🚫 Inativo"}.`); 
      } catch (error: unknown) { 
        console.error(`[ERRO ${acao}]:`, error);
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", `❌ Falha ao alterar status: ${(error as Error).message}`);
      } 
      return true; 
    }

    // Limpeza de caracteres invisíveis Unicode (ex: ZWSP) que quebram o parser
    const textoLimpo = comando.replace(/[\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();

    // COMANDO ADMINISTRATIVO: @extrair_lid
    if (textoLimpo.includes('@extrair_lid')) {
      const lidDoGrupo = msg.key?.remoteJid || 'Não detectado';
      
      console.log('\n==================================================');
      console.log('🔍 [EXTRAÇÃO DE LID] ID do chat detectado com sucesso:');
      console.log(`📌 LID/JID: ${lidDoGrupo}`);
      console.log('==================================================\n');

      await this.enviarMensagemElegante(
        lidDoGrupo, 
        "SISTEMA", 
        `✅ *LID extraído com sucesso no console do servidor!*\n\n📌 ID: \`${lidDoGrupo}\``
      );
      return true;
    }

    // COMANDO ADMINISTRATIVO: @refazer [dia_da_geracao]
    if (acao === '@refazer') {
      const diaDigitado = parseInt(parametro, 10);

      if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ Use: `@refazer [dia]` (Exemplo: `@refazer 10`).");
        return true;
      }

      // CORREÇÃO: Alinhado para chatDeOrigemId
      await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", `🔄 Localizando a lista gerada no dia ${diaDigitado.toString().padStart(2, '0')} para reprocessar...`);

      try {
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        
        const inicioDia = new Date(dataAlvo);
        inicioDia.setHours(0, 0, 0, 0);
        const fimDia = new Date(dataAlvo);
        fimDia.setHours(23, 59, 59, 999);

        const listaJoiaEncontrada = await AppDataSource.getRepository('ListaJoia')
          .createQueryBuilder("lista")
          .where("lista.dia BETWEEN :inicioDia AND :fimDia", { inicioDia, fimDia })
          .orderBy("lista.dia", "DESC") 
          .getOne();

        if (!listaJoiaEncontrada) {
          // CORREÇÃO: Alinhado para chatDeOrigemId
          await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", `🚫 Não localizei nenhuma lista registrada no dia *${diaDigitado.toString().padStart(2, '0')}*.`);
          return true;
        }

        const relatorioFormatado = await this.escalaService.gerarEscalaCompleta((listaJoiaEncontrada as any).id);
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "📋 ESCALA ATUALIZADA", relatorioFormatado);

      } catch (error: any) {
        console.error("Falha ao reprocessar comando admin @refazer:", error);
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "FALHA CRÍTICA", `❌ Erro interno ao reprocessar: ${error.message}`);
      }
      return true;
    }

    // COMANDO ADMINISTRATIVO: @escala_tarde [dia_operacional]
    if (acao === '@tarde') {
      const diaDigitado = parseInt(parametro, 10);

      if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ *Escolha o dia da lista.*\n\nUse: `@tarde [dia]` (Exemplo: `@tarde 4`).");
        return true;
      }

      try {
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        const diaReal = dataAlvo.getDate();

        const { texto, mencoes } = await this.escalaService.obterTextoPeriodoTarde(diaReal);
        // CORREÇÃO CRÍTICA: Responde direto no chatDeOrigemId
        await this.sock!.sendMessage(chatDeOrigemId, { text: texto, mentions: mencoes });
      } catch (error: any) {
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO EXPORTAÇÃO", `❌ Erro ao extrair turno da tarde: ${error.message}`);
      }
      return true;
    }

    // COMANDO ADMINISTRATIVO: @escala_madrugada [dia_operacional]
    if (acao === '@madrugada') {
      const diaDigitado = parseInt(parametro, 10);

      if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ *Escolha o dia da lista.*\n\nUse: `@madrugada [dia]` (Exemplo: `@madrugada 4`).");
        return true;
      }

      try {
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        const diaReal = dataAlvo.getDate();

        const { texto, mencoes } = await this.escalaService.obterTextoPeriodoMadrugada(diaReal);
        // CORREÇÃO CRÍTICA: Responde direto no chatDeOrigemId
        await this.sock!.sendMessage(chatDeOrigemId, { text: texto, mentions: mencoes });
      } catch (error: any) {
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO EXPORTAÇÃO", `❌ Erro ao extrair turno da madrugada: ${error.message}`);
      }
      return true;
    }

    // COMANDO ADMINISTRATIVO: @escala_completa [dia_operacional]
    if (acao === '@escala_completa') {
      const diaDigitado = parseInt(parametro, 10);

      if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ *Escolha o dia da lista.*\n\nUse: `@escala_completa [dia]` (Exemplo: `@escala_completa 4`).");
        return true;
      }

      try {
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        const diaReal = dataAlvo.getDate();

        const resultadoTarde = await this.escalaService.obterTextoPeriodoTarde(diaReal);
        const resultadoMadrugada = await this.escalaService.obterTextoPeriodoMadrugada(diaReal);
        
        const textoUnificado = `${resultadoTarde.texto}\n\n=============================\n\n${resultadoMadrugada.texto}`;
        const mencoesUnificadas = [...resultadoTarde.mencoes, ...resultadoMadrugada.mencoes];

        // CORREÇÃO CRÍTICA: Responde direto no chatDeOrigemId
        await this.sock!.sendMessage(chatDeOrigemId, { text: textoUnificado, mentions: mencoesUnificadas });
      } catch (error: any) {
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO EXPORTAÇÃO", `❌ Erro ao extrair texto completo: ${error.message}`);
      }
      return true;
    }

    // COMANDO ADMINISTRATIVO: @escala [dia_da_geracao]
    // 1. CAPTURA DINÂMICA DO CHAT ATUAL (Evita vazamentos no grupo de produção)
    // COMANDO ADMINISTRATIVO: @escala [dia_da_geracao] (Continuação / Bloco Final)
    if (acao === '@escala') {
      const diaDigitado = parseInt(parametro, 10);

      if (isNaN(diaDigitado) || diaDigitado < 1 || diaDigitado > 31) {
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ Use: `@escala [dia]` (Exemplo: `@escala 10`).");
        return true; 
      }

      // CORREÇÃO: Alinhado para chatDeOrigemId
      await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", `🔄 Buscando a lista gerada no dia *${diaDigitado.toString().padStart(2, '0')}*...`);
      
      try {
        // 🔥 FIX FUSO DEFINITIVO: Converte o dia informado em uma data segura baseada no fuso de São Paulo
        const dataAlvo = this.calcularDataAlvoSegura(diaDigitado);
        
        const inicioDia = new Date(dataAlvo);
        inicioDia.setHours(0, 0, 0, 0);
        const fimDia = new Date(dataAlvo);
        fimDia.setHours(23, 59, 59, 999);

        // Executa a busca utilizando ranges puros. Se digitou 10, busca entre 10/xx 00:00 e 10/xx 23:59.
        const listaJoiaEncontrada = await AppDataSource.getRepository('ListaJoia')
          .createQueryBuilder("lista")
          .where("lista.dia BETWEEN :inicioDia AND :fimDia", { inicioDia, fimDia })
          .orderBy("lista.dia", "DESC")
          .getOne();

        if (!listaJoiaEncontrada) {
          // CORREÇÃO: Alinhado para chatDeOrigemId
          await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", `🚫 Não localizei nenhuma lista registrada no dia *${diaDigitado.toString().padStart(2, '0')}*.`);
          return true; 
        }

        const relatorioFormatado = await this.escalaService.gerarEscalaCompleta((listaJoiaEncontrada as any).id);
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "📋 ESCALA ATUALIZADA", relatorioFormatado);

      } catch (error: any) {
        console.error("Falha ao reprocessar comando admin @escala:", error);
        // CORREÇÃO: Alinhado para chatDeOrigemId
        await this.enviarMensagemElegante(chatDeOrigemId, "FALHA CRÍTICA", `❌ Erro interno ao reprocessar: ${error.message}`);
      }
      return true; 
    }
    // =========================================================================
    // COMANDO ADMINISTRATIVO CENTRALIZADO: @vincular [ID_BANCO] @Mencao
    // =========================================================================
    if (acao === '@vincular') {
      try {
        // 1. Valida se o ID sequencial do banco foi informado como primeiro parâmetro
        const idBancoInformado = parseInt(parametro, 10);
        if (isNaN(idBancoInformado)) {
          await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", "❌ *Informe o ID numérico do passageiro.*\n\n💡 Uso correto: `@vincular [ID] @Nome`\n👉 Exemplo: `@vincular 34 @Glaucia Tomas`");
          return true;
        }

        // 2. Extrai o JID da menção direto do contextInfo
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        const listaMencoes = contextInfo?.mentionedJid || [];
        
        const jidMarcadoRaw = Array.isArray(listaMencoes) && listaMencoes.length > 0 
          ? String(listaMencoes[0]).trim() 
          : String(listaMencoes).trim();

        if (!jidMarcadoRaw || jidMarcadoRaw === 'undefined') {
          await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", "❌ *Marque o passageiro utilizando o @ do WhatsApp logo após o ID.*");
          return true;
        }

        // 3. Extrai o LID numérico puro da menção via Regex (ex: "58270240751627")
        const matchNumerosLid = jidMarcadoRaw.match(/^(\d+)/);
        const finalLid = matchNumerosLid ? matchNumerosLid[0] : '';

        if (!finalLid) {
          await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", "❌ *Não foi possível extrair o identificador LID desta menção.*");
          return true;
        }

        // 4. Busca o passageiro no banco de dados usando estritamente o ID numérico informado
        const passageiroRepo = AppDataSource.getRepository(Passageiro);
        const passageiro = await passageiroRepo.findOneBy({ id: idBancoInformado });

        if (!passageiro) {
          await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", `❌ *Nenhum passageiro encontrado no banco com o ID \`${idBancoInformado}\`.*`);
          return true;
        }

        // 5. Executa o UPDATE atômico diretamente na tabela usando a Chave Primária (ID)
        await passageiroRepo.createQueryBuilder()
          .update(Passageiro)
          .set({ whatsAppLid: finalLid })
          .where("id = :id", { id: passageiro.id })
          .execute();

        console.log(`\n==================================================`);
        console.log(`✅ [VÍNCULO POR ID CONCLUÍDO COM SUCESSO]`);
        console.log(`👤 PASSAGEIRO CORRESPONDENTE: ${passageiro.nome}`);
        console.log(`📞 TELEFONE DA TABELA: ${passageiro.telefoneWhatsApp}`);
        console.log(`🆔 WHATSAPP_LID GRAVADO NO ID ${passageiro.id}: ${finalLid}`);
        console.log(`==================================================\n`);

        await this.enviarMensagemElegante(
          chatDeOrigemId,
          "SISTEMA", 
          `✅ *LID vinculado com sucesso!*\n\n🆔 ID Banco: \`${passageiro.id}\`\n👤 Passageiro: *${passageiro.nome}*\n📞 Telefone: \`${passageiro.telefoneWhatsApp}\`\n🧩 LID Gravado: \`${finalLid}\``
        );

      } catch (errCommand: any) {
        console.error(`❌ [FALHA NO COMANDO VINCULAR]:`, errCommand);
        await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", `💥 *Falha Crítica:* ${errCommand.message}`);
      }
      return true;
    }
    // COMANDO ADMINISTRATIVO: @janela_cadastro [abrir/fechar]
    if (acao === '@janela_cadastro') {
      const statusParam = String(parametro).toLowerCase();

      if (statusParam === 'abrir') {
        this.cadastroPassageiroAberto = true;
        await this.enviarMensagemElegante(
          chatDeOrigemId, 
          "CADASTRO PASSAGEIRO", 
          "🔓 *CADASTRO DE PASSAGEIROS LIBERADO!*\n\nPassageiros, digitem:\n*@cadastro Seu Nome Completo*"
        );
      } else if (statusParam === 'fechar') {
        this.cadastroPassageiroAberto = false;
        await this.enviarMensagemElegante(
          chatDeOrigemId, 
          "CADASTRO PASSAGEIRO", 
          "🔒 *CADASTRO DE PASSAGEIROS FECHADO!*\n\n🚫 A janela de inscrições foi encerrada pelo administrador."
        );
      } else {
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", "❌ Use: `@janela_cadastro abrir` ou `@janela_cadastro fechar`.");
      }
      return true;
    }

        // COMANDO ADMINISTRATIVO: @passageiros (Ordem Alfabética)
    if (acao === '@passageiros') { 
      try {
        const passageiroRepo = AppDataSource.getRepository(Passageiro);
        
        // Busca todos os passageiros ordenados em Ordem Alfabética pelo Nome
        const passageiros = await passageiroRepo.find({
          select: {
            id: true,
            nome: true,
            telefoneWhatsApp: true,
            whatsAppLid: true,
            ativo: true
          },
          order: { nome: "ASC" } // 🚀 ALTERAÇÃO: Ordenação de A a Z
        });

        if (!passageiros || passageiros.length === 0) { 
          await this.enviarMensagemElegante(chatDeOrigemId, "PASSAGEIROS", "📭 Nenhum passageiro cadastrado no banco de dados."); 
          return true; 
        } 

        let relatorio = ""; 
        passageiros.forEach((p) => { 
          const foneExibicao = p.telefoneWhatsApp.startsWith('LID-') ? 'Sem fone clássico' : p.telefoneWhatsApp;
          const statusEmoji = p.ativo ? "✅" : "🚫";
          
          // O ID continua visível em cada linha para você usá-lo no comando @vincular [ID] @Nome
          relatorio += `🔹 *${p.nome}* (ID: ${p.id})\n📞 Fone: \`${foneExibicao}\`\n🧩 LID: \`${p.whatsAppLid || 'Aguardando vínculo'}\` ${statusEmoji}\n\n`; 
        }); 

        await this.enviarMensagemElegante(chatDeOrigemId, "👥 LISTA DE PASSAGEIROS (A-Z)", relatorio.trim()); 
      } catch (errList: any) {
        console.error(`❌ [ERRO @passageiros]:`, errList);
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", `❌ Falha ao listar passageiros: ${errList.message}`);
      }
      return true; 
    }

        // COMANDO ADMINISTRATIVO: @ajuda_admin ou @ajuda
    if (acao === '@ajuda_admin' || acao === '@ajuda') {
      try {
        let menu = "🛠️ *MENU DE COMANDOS DO ADMINISTRADOR*\n\n";

        menu += "📢 *Gerenciamento de Cadastros:*\n";
        menu += "🔹 `@abrir_cadastro` - Libera inscrições de motoristas\n";
        menu += "🔹 `@fechar_cadastro` - Tranca inscrições de motoristas\n";
        menu += "🔹 `@janela_cadastro abrir` - Libera auto-cadastro de passageiros\n";
        menu += "🔹 `@janela_cadastro fechar` - Tranca auto-cadastro de passageiros\n";
        menu += "🔹 `@vincular [ID] @Mencao` - Vincula manualmente o LID ao ID do passageiro\n\n";

        menu += "👥 *Listagens e Painéis (A-Z):*\n";
        menu += "🔹 `@motoristas` - Exibe todos os motoristas e seus LIDs\n";
        menu += "🔹 `@passageiros` - Exibe todos os passageiros e seus registros\n";
        menu += "🔹 `@extrair_lid` - Captura o ID/LID do grupo atual no console\n";
        menu += "🔹 `@extrair_lid_usuario Nome` - Extrai o ID puro de um membro\n\n";

        menu += "📋 *Manipulação da Fila da Escala:*\n";
        menu += "🔹 `@add @Mencao [dia]` - Adiciona motorista no fim da fila\n";
        menu += "🔹 `@inserir @Mencao posição X [dia]` - Insere motorista na vaga X\n";
        menu += "🔹 `@remover @Mencao [dia]` - Retira o motorista da fila do dia\n";
        menu += "🔹 `@ativar @Mencao` - Altera o status do motorista para Ativo\n";
        menu += "🔹 `@inativar @Mencao` - Altera o status do motorista para Inativo\n\n";

        menu += "📅 *Controles de Calendário e Rotas:*\n";
        menu += "🔹 `@tipo_dia DD/MM/AAAA [TIPO]` - Define DIA_LIVRE ou DIA_COMUM\n";
        menu += "🔹 `@limpar_dia DD/MM/AAAA` - Remove regras manuais da data\n";
        menu += "🔹 `@listar_feriados` - Mostra datas customizadas cadastradas\n";
        menu += "🔹 `@refazer [dia]` - Reprocessa e atualiza a escala gerada\n";
        menu += "🔹 `@tarde [dia]` - Dispara o espelho da tarde com menções\n";
        menu += "🔹 `@madrugada [dia]` - Dispara o espelho da madrugada com menções\n";
        menu += "🔹 `@escala_completa [dia]` - Une os espelhos da tarde e madrugada\n";
        menu += "🔹 `@escala [dia]` - Exibe relatório formatado da ListaJoia\n";
        menu += "🔹 `@notificar @Mencao [dia]` - Envia espelho de rotas no privado do motorista\n";

        menu += "💡 *Instruções gerais a respeito do uso do bot:*\n"
        menu += "🔹 `@instrucao` - Envia a instrução de solicitação/cancelamento de corrida para os passageiros\n";

        await this.enviarMensagemElegante(chatDeOrigemId, "SISTEMA", menu.trim());
      } catch (errHelp: any) {
        console.error(`❌ [ERRO @ajuda_admin]:`, errHelp);
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", `❌ Falha ao gerar menu: ${errHelp.message}`);
      }
      return true;
    }

        // COMANDO ADMINISTRATIVO: @instrucao_solicitacao ou @instrucao
    if (acao === '@instrucao_solicitacao' || acao === '@instrucao') {
      try {
        let mensagemInstrucao = "🤖 *COMO SOLICITAR OU CANCELAR SUA VIAGEM*\n\n";
        
        mensagemInstrucao += "Olá passageiros! Para confirmar ou cancelar sua presença nas rotas, utilizem os comandos abaixo diretamente aqui no grupo:\n\n";
        
        mensagemInstrucao += "✅ *PARA CONFIRMAR PRESENÇA:*\n";
        mensagemInstrucao += "👉 Digite: `@solicitacao [ida/volta] [Dia]`\n";
        mensagemInstrucao += "💡 *Exemplo:* `@solicitacao ida 27` (para confirmar a ida do dia 27)\n\n";
        
        mensagemInstrucao += "🗑️ *PARA CANCELAR PRESENÇA:*\n";
        mensagemInstrucao += "👉 Digite: `@cancelar [ida/volta] [Dia]`\n";
        mensagemInstrucao += "💡 *Exemplo:* `@cancelar volta 27` (para cancelar a volta do dia 27)\n\n";
        
        mensagemInstrucao += "⚠️ *Atenção:*\n";
        mensagemInstrucao += "1️⃣ Digite o comando exatamente como no exemplo, respeitando os espaços.\n";
        mensagemInstrucao += "2️⃣ Escreva apenas o número do dia (ex: `27` e não `27/07`).\n";
        mensagemInstrucao += "3️⃣ O sistema atualizará o espelho da rota e notificará seu motorista instantaneamente.";

        // Envia o painel explicativo elegante direto no chat onde foi solicitado
        await this.enviarMensagemElegante(chatDeOrigemId, "📢 INSTRUÇÃO OPERACIONAL", mensagemInstrucao.trim());
      } catch (errInst: any) {
        console.error(`❌ [ERRO @instrucao_solicitacao]:`, errInst);
        await this.enviarMensagemElegante(chatDeOrigemId, "ERRO", `❌ Falha ao emitir instrução: ${errInst.message}`);
      }
      return true;
    }

    return false; // Permite que a mensagem caia no fluxo de comandos de usuários comuns
  }


  private async enviarMensagemElegante(to: string | undefined, titulo: string, conteudo: string): Promise<void> { 
    if (!to || !this.sock) return;
    await this.sock.sendMessage(to, { text: `${titulo}\n\n${conteudo}` }); 
  }  

  public setCadastroStatus(status: boolean): void { this.cadastroAberto = status; } 

  public async enviarMensagemExterna(titulo: string, conteudo: string): Promise<void> { 
    if (!this.grupoId || !this.sock) return; 
    await this.enviarMensagemElegante(this.grupoId, titulo, conteudo); 
  } 

  public async dispararEscalaManual(): Promise<string> { 
    const treeLista = await this.registroService.buscarOuCriarListaDoDia(); 
    const relatorio = await this.escalaService.gerarEscalaCompleta(treeLista.id); 
    await this.enviarMensagemExterna("📋 ESCALA (VIA APP)", relatorio); 
    return relatorio; 
  }

  public async resetarFilaDoDia(): Promise<void> { 
    const treeLista = await this.registroService.buscarOuCriarListaDoDia(); 
    await this.registroService.limparLista(treeLista.id); 
    await this.enviarMensagemExterna("🧹 SISTEMA", "Fila limpa."); 
  } 

  private isJanelaBanimento(timestampMs: number): boolean { 
    const formatador = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "numeric", minute: "numeric", hour12: false
    });
    const partes = formatador.formatToParts(new Date(timestampMs));
    const hora = Number(partes.find(p => p.type === "hour")?.value || 0);
    const minuto = Number(partes.find(p => p.type === "minute")?.value || 0);
    return hora === 19 && minuto >= 57 && minuto <= 59; 
  } 

  private isJanelaJoinha(timestampMs: number): boolean { 
    const formatador = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "numeric", minute: "numeric", hour12: false
    });
    const partes = formatador.formatToParts(new Date(timestampMs));
    const hora = Number(partes.find(p => p.type === "hour")?.value || 0);
    const minuto = Number(partes.find(p => p.type === "minute")?.value || 0);
    return hora === 20 && minuto >= 0 && minuto <= 20; 
  }
  
  private calcularDataAlvoSegura(diaDigitado?: number): Date {
    const hoje = new Date();
    
    if (diaDigitado === undefined || isNaN(diaDigitado)) {
      hoje.setHours(0, 0, 0, 0);
      return hoje;
    }

    let anoAlvo = hoje.getFullYear();
    let mesAlvo = hoje.getMonth();

    // Se o dia digitado for maior que o dia atual, retrocede 1 mês automaticamente
    if (diaDigitado > hoje.getDate()) {
      mesAlvo -= 1;
      if (mesAlvo < 0) {
        mesAlvo = 11; // Volta para Dezembro
        anoAlvo -= 1; // Volta o Ano
      }
    }

    return new Date(anoAlvo, mesAlvo, diaDigitado, 0, 0, 0, 0);
  }
}