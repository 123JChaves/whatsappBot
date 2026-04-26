import { Client, Message } from "whatsapp-web.js";
import { RegistroService } from "../service/whatsapp/RegistroService";
import { EscalaService } from "../service/whatsapp/EscalaService";
import { EmojiHelper } from "../utils/helpers/EmojiHelper";
import MotoristaService from "../service/motorista/MotoristaService";
import 'dotenv/config';
import cron from "node-cron"; // ACRESCENTADO PARA AGENDAMENTOS

export class WhatsAppController {
    // Lista de IDs permitidos para o mesmo grupo físico
    private readonly IDs_PERMITIDOS = [
        process.env.JWT_ID_BOTSECRET,
        process.env.JWT_ID_GROUPSECRET || ''
    ];
    private cadastroAberto = false; // Controle de janela em memória

    constructor(
        private client: Client,
        private registroService: RegistroService,
        private escalaService: EscalaService
    ) {}

    public inicializar(): void {
        
        const grupoId = process.env.JWT_ID_GROUPSECRET || '';
        
        if (grupoId) {
            // 1. Escala baseada nos Joinhas (04:00 AM)
            cron.schedule('0 4 * * *', async () => {
                const lista = await this.registroService.buscarOuCriarListaDoDia();
                const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id);
                await this.enviarMensagemEstiloCodigo(grupoId, "📋 ESCALA DO DIA", relatorio);
            });

            // 2. Lista de Rota da Tarde (07:00 AM)
            cron.schedule('0 7 * * *', async () => {
                const lista = await this.registroService.buscarOuCriarListaDoDia();
                const relatorioRotas = "Lógica de Rotas Pendente de Implementação..."; 
                await this.enviarMensagemEstiloCodigo(grupoId, "🚚 ROTAS DA TARDE", relatorioRotas);
            });

            // 3. Lista da Madrugada (15:00 PM)
            cron.schedule('0 15 * * *', async () => {
                const lista = await this.registroService.buscarOuCriarListaDoDia();
                const relatorioMadrugada = "Lógica de Madrugada Pendente de Implementação...";
                await this.enviarMensagemEstiloCodigo(grupoId, "🌙 LISTA DA MADRUGADA", relatorioMadrugada);
            });
        }

        this.client.on('message_create', async (msg: Message) => {
            // LOGS DE DEPURAÇÃO - MANTIDOS
            // console.log(`📢 MENSAGEM RECEBIDA: "${msg.body}" de ${msg.from}`);
            // console.log(`--- Mensagem Recebida ---`);
            //console.log(`De (Group ID): ${msg.from}`);
            //console.log(`Autor (User ID): ${msg.author || msg.from}`);
            //console.log(`Texto: ${msg.body}`);

            // CORREÇÃO DA TRAVA: Verifica se o ID está contido na lista permitida
            if (!this.IDs_PERMITIDOS.includes(msg.from)) {
                console.log("⚠️ Mensagem ignorada: ID do grupo não corresponde.");
                return;
            }

            const agora = new Date();
            const autor = msg.author || msg.from;
            const texto = msg.body.trim();

            try {
                // 1. Comando de Auto-Cadastro (Público)
                if (texto.startsWith('@cadastrar ')) {
                    if (!this.cadastroAberto) {
                        await msg.reply("🔐 O cadastro está fechado no momento. Aguarde o administrador abrir.");
                        return;
                    }
                    const nome = texto.replace('@cadastrar ', '').trim();
                    await this.registroService.cadastrarMotorista(nome, autor, this.client);
                    await msg.reply(`✅ *${nome}*, seu cadastro foi realizado com sucesso!`);
                    return;
                }

                // 2. Processamento de Comandos de Administrador (Prefixados com @)
                if (texto.startsWith('@')) {
                    const processado = await this.processarComandosAdmin(msg, texto, autor);
                    if (processado) return;
                }

                // 3. Janela de Banimento (19:57 - 19:59)
                if (this.isJanelaBanimento(agora)) {
                    if (EmojiHelper.isJoinha(texto)) {
                        const lista = await this.registroService.buscarOuCriarListaDoDia();
                        await this.registroService.adicionarJoinhaPenalizado(autor, lista.id, this.client);
                        await msg.reply("⚠️ *QUEIMOU A LARGADA!* Seu joinha foi registrado, mas você perdeu a preferência e ficará no final da lista.");
                        return;
                    }
                    await this.registroService.registrarBanimentoAntecipado(autor, this.client);
                    return;
                }

                // 4. Janela de Joinha (20:00 - 20:02)
                if (this.isJanelaJoinha(agora) && EmojiHelper.isJoinha(texto)) {
                    const lista = await this.registroService.buscarOuCriarListaDoDia();
                    await this.registroService.adicionarJoinha(autor, lista.id, this.client);
                    await msg.reply("👍🏻 Registrado na fila.");
                    return;
                }
            } catch (error: any) {
                console.error(`[ERRO BOT]: ${error.message}`);
                await msg.reply(`❌ ${error.message}`);
            }
        });
    }

    // FUNÇÃO AUXILIAR PARA FORMATO DE CÓDIGO (ACRESCENTADO)
    private async enviarMensagemEstiloCodigo(to: string, titulo: string, conteudo: string): Promise<void> {
        const mensagem = `*${titulo}*\n\`\`\`\n${conteudo}\n\`\`\``;
        await this.client.sendMessage(to, mensagem);
    }

    private isJanelaBanimento(data: Date): boolean {
        return data.getHours() === 19 && data.getMinutes() >= 57 && data.getMinutes() <= 59;
    }

    private isJanelaJoinha(data: Date): boolean {
        return data.getHours() === 20 && data.getMinutes() >= 0 && data.getMinutes() <= 2;
    }

    private async processarComandosAdmin(msg: Message, comando: string, autor: string): Promise<boolean> {
        const isAdmin = await this.registroService.verificarSeEhAdmin(autor, this.client);

        if (!isAdmin) {
            console.log(`🚫 Tentativa de comando admin por não-autorizado: ${autor}`);
            return false;
        }

        const [acao, parametro] = comando.split(' ');

        if (comando === '@motoristas') {
            const motoristas = await MotoristaService.listarMotoristas();
            
            if (!motoristas || motoristas.length === 0) {
                await msg.reply("📭 Nenhum motorista cadastrado.");
                return true;
            }

            let relatorio = "*👥 LISTA DE MOTORISTAS*\n\n";
            motoristas.forEach((m, i) => {
                const status = m.ativo ? "✅" : "🚫";
                relatorio += `${i + 1}. ${m.nome}\n   📱 ${m.telefoneWhatsApp} ${status}\n\n`;
            });

            // Pega o ID do grupo do seu arquivo .env
            const grupoId = process.env.JWT_ID_GROUPSECRET;

            if (grupoId) {
                // Envia especificamente para o ID do grupo, ignorando de onde veio o comando
                await this.client.sendMessage(grupoId, relatorio);
            } else {
                // Fallback: se o ID do grupo não estiver no .env, tenta mandar de volta de onde veio
                await this.client.sendMessage(msg.from, relatorio);
            }

            return true;
        }

        if (comando === '@abrir_cadastro') {
            this.cadastroAberto = true;
            await msg.reply("🔓 *CADASTRO LIBERADO!* \nMotoristas já podem enviar: `@cadastrar Seu Nome`.");
            return true;
        }

        if (comando === '@fechar_cadastro') {
            this.cadastroAberto = false;
            await msg.reply("🔐 *CADASTRO FECHADO!*");
            return true;
        }

        if (comando === '@escala') {
            const lista = await this.registroService.buscarOuCriarListaDoDia();
            const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id);
            // Aplicado o estilo de código solicitado aqui também
            await this.enviarMensagemEstiloCodigo(msg.from, "📋 ESCALA ATUAL", relatorio);
            return true;
        }

        if (acao === '@tipo_dia') {
            if (!parametro || !comando.split(' ')[2]) {
                await msg.reply("❌ Use: `@tipo_dia DD/MM/AAAA DIA_LIVRE` ou `DIA_COMUM`.");
                return true;
            }
            
            const dataString = parametro; // DD/MM/AAAA
            const tipoInformado = comando.split(' ')[2] as any; // DIA_LIVRE ou DIA_COMUM
            
            await this.escalaService.definirTipoDiaManual(dataString, tipoInformado);
            await msg.reply(`✅ O dia *${dataString}* foi configurado como *${tipoInformado}*.`);
            return true;
        }

        // @limpar_dia 25/12/2023 -> Remove a marcação manual e volta ao padrão do calendário
        if (acao === '@limpar_dia') {
            if (!parametro) {
                await msg.reply("❌ Informe a data. Ex: `@limpar_dia 25/12/2024`.");
                return true;
            }
            await this.escalaService.removerTipoDiaManual(parametro);
            await msg.reply(`✅ Marcação manual da data *${parametro}* removida. O bot voltará a usar o calendário padrão.`);
            return true;
        }

        // @listar_feriados -> Mostra todos os dias que foram marcados manualmente
        if (comando === '@listar_feriados') {
            const lista = await this.escalaService.listarDiasManuais();
            await msg.reply(lista);
            return true;
        }

        if (acao === '@ativar' || acao === '@inativar') {
            if (!parametro) {
                await msg.reply(`❌ Informe o número. Ex: \`${acao} 554499999999\`.`);
                return true;
            }
            const motorista = await MotoristaService.buscarPorTelefone(parametro);
            if (!motorista) {
                await msg.reply(`❌ Motorista *${parametro}* não encontrado.`);
                return true;
            }
            const novoStatus = acao === '@ativar';
            await MotoristaService.alterarStatusAtivo(parametro, novoStatus);
            await msg.reply(`👤 Motorista *${motorista.nome}* (${parametro}) agora está *${novoStatus ? 'ATIVO ✅' : 'INATIVO 🚫'}*.`);
            return true;
        }

        return false;
    }
}