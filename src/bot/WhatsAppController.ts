import { Client } from "whatsapp-web.js";
import { RegistroService } from "../service/whatsapp/RegistroService";
import { EscalaService } from "../service/whatsapp/EscalaService";
import { EmojiHelper } from "../utils/helpers/emojiHelper";

export class WhatsAppController {
    private readonly ID_GRUPO_PERMITIDO = '120363148753902178@g.us';

    constructor(
        private client: Client,
        private registroService: RegistroService,
        private escalaService: EscalaService
    ) {}

    public inicializar(): void {
        this.client.on('message', async (msg) => {
            if (msg.from !== this.ID_GRUPO_PERMITIDO) return;

            const agora = new Date();
            const autor = msg.author || msg.from;
            const texto = msg.body.trim();

            try {
                // 1. Janela de Banimento (19:57 - 19:59)
                if (this.isJanelaBanimento(agora)) {
                    await this.registroService.registrarBanimentoAntecipado(autor);
                    return;
                }

                // 2. Janela de Joinha (20:00 - 20:02)
                if (this.isJanelaJoinha(agora) && EmojiHelper.isJoinha(texto)) {
                    const lista = await this.registroService.buscarOuCriarListaDoDia();
                    await this.registroService.adicionarJoinha(autor, lista.id);
                    await msg.reply("👍🏻 Registrado na fila.");
                    return;
                }

                // 3. Comandos de Administrador
                if (texto.startsWith('!')) {
                    await this.processarComandosAdmin(msg, texto, autor);
                }

            } catch (error: any) {
                // O Controller "ouve" os erros do Service e avisa no WhatsApp
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

    private async processarComandosAdmin(msg: any, comando: string, autor: string): Promise<void> {
        const isAdmin = await this.registroService.verificarSeEhAdmin(autor);
        if (!isAdmin) return;

        if (comando === '!escala') {
            const lista = await this.registroService.buscarOuCriarListaDoDia();
            const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id);
            await this.client.sendMessage(this.ID_GRUPO_PERMITIDO, relatorio);
        }
    }
}