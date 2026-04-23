import { Client, Message } from "whatsapp-web.js";
import { RegistroService } from "../service/whatsapp/RegistroService";
import { EscalaService } from "../service/whatsapp/EscalaService";
import { EmojiHelper } from "../utils/helpers/emojiHelper";
import MotoristaService from "../service/motorista/MotoristaService";

export class WhatsAppController {
    // Lista de IDs permitidos para o mesmo grupo físico
    private readonly IDs_PERMITIDOS = [
        '203998179098859@lid',
        '120363148753902178@g.us'
    ];
    private cadastroAberto = false; // Controle de janela em memória

    constructor(
        private client: Client,
        private registroService: RegistroService,
        private escalaService: EscalaService
    ) {}

    public inicializar(): void {
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
                // Mantido no topo para prioridade de execução
                if (texto.startsWith('@cadastrar ')) {
                    if (!this.cadastroAberto) {
                        await msg.reply("🔒 O cadastro está fechado no momento. Aguarde o administrador abrir.");
                        return;
                    }
                    const nome = texto.replace('@cadastrar ', '').trim();
                    // Integrado com client para buscar número real do chip (constante)
                    await this.registroService.cadastrarMotorista(nome, autor, this.client);
                    await msg.reply(`✅ *${nome}*, seu cadastro foi realizado com sucesso!`);
                    return;
                }

                // 2. Processamento de Comandos de Administrador (Prefixados com @)
                // Se não for @cadastrar, verifica se é um comando restrito
                if (texto.startsWith('@')) {
                    const processado = await this.processarComandosAdmin(msg, texto, autor);
                    if (processado) return;
                }

                // 3. Janela de Banimento (19:57 - 19:59)
                if (this.isJanelaBanimento(agora)) {
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
                // Captura erros de duplicidade, banimento ou regras de negócio
                console.error(`[ERRO BOT]: ${error.message}`);
                await msg.reply(`❌ ${error.message}`);
            }
        });
    }

    private isJanelaBanimento(data: Date): boolean {
        return data.getHours() === 19 && data.getMinutes() >= 57 && data.getMinutes() <= 59;
    }

    private isJanelaJoinha(data: Date): boolean {
        return data.getHours() === 20 && data.getMinutes() >= 0 && data.getMinutes() <= 2;
    }

    private async processarComandosAdmin(msg: Message, comando: string, autor: string): Promise<boolean> {
        // Integrado com client para validar Admin pelo número real do chip (5544...)
        const isAdmin = await this.registroService.verificarSeEhAdmin(autor, this.client);
        
        if (!isAdmin) {
            // Se alguém tentar usar comandos com @ e não for admin, registramos no terminal
            if (!comando.startsWith('@cadastrar')) {
                console.log(`🚫 Tentativa de comando admin por não-autorizado: ${autor}`);
            }
            return false;
        }

        const [acao, parametro] = comando.split(' ');

        // Gerenciamento da Janela de Cadastro
        if (comando === '@abrir_cadastro') {
            this.cadastroAberto = true;
            await msg.reply("🔓 *CADASTRO LIBERADO!* \nMotoristas já podem enviar: `@cadastrar Seu Nome`.");
            return true;
        }

        if (comando === '@fechar_cadastro') {
            this.cadastroAberto = false;
            await msg.reply("🔒 *CADASTRO FECHADO!*");
            return true;
        }

        // Relatório de Escala Diária
        if (comando === '@escala') {
            const lista = await this.registroService.buscarOuCriarListaDoDia();
            const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id);
            // Envia a resposta para o ID de origem (seja @lid ou @g.us)
            await this.client.sendMessage(msg.from, relatorio);
            return true;
        }

        // Ativar/Inativar Motoristas
        if (acao === '@ativar' || acao === '@inativar') {
            if (!parametro) {
                await msg.reply("❌ Informe o número. Ex: `@inativar 554499999999`.");
                return true;
            }
            const novoStatus = acao === '@ativar';
            await MotoristaService.alterarStatusAtivo(parametro, novoStatus);
            await msg.reply(`👤 Motorista *${parametro}* agora está *${novoStatus ? 'ATIVO ✅' : 'INATIVO 🚫'}*.`);
            return true;
        }

        return false; // Não era um comando admin conhecido
    }
}