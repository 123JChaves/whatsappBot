import { Client, Message } from "whatsapp-web.js";
import { RegistroService } from "../service/whatsapp/RegistroService";
import { EscalaService } from "../service/whatsapp/EscalaService";
import { EmojiHelper } from "../utils/helpers/EmojiHelper";
import 'dotenv/config';
import cron from "node-cron";
import MotoristaService from "../service/MotoristaService";

export class WhatsAppController {
    private readonly IDs_PERMITIDOS = [
        process.env.JWT_ID_BOTSECRET,
        process.env.JWT_ID_GROUPSECRET || ''
    ];
    private cadastroAberto = false;
    private grupoId: string;

    constructor(
        private client: Client,
        public registroService: RegistroService,
        public escalaService: EscalaService
    ) {
        this.grupoId = process.env.JWT_ID_GROUPSECRET || '';
    }

    public inicializar(): void {
        if (this.grupoId) {
            // 1. Escala baseada nos Joinhas (04:00 AM)
            cron.schedule('0 4 * * *', async () => {
                try {
                    const lista = await this.registroService.buscarOuCriarListaDoDia();
                    const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id);
                    await this.enviarMensagemElegante(this.grupoId, "📋 ESCALA DO DIA", relatorio);
                } catch (error: any) {
                    console.error(`[ERRO CRON 04:00]: ${error.message}`);
                }
            });

            // 2. Lista de Rota da Tarde (07:00 AM)
            cron.schedule('0 7 * * *', async () => {
                const lista = await this.registroService.buscarOuCriarListaDoDia();
                const relatorioRotas = "Lógica de Rotas Pendente de Implementação...";
                await this.enviarMensagemElegante(this.grupoId, "🚚 ROTAS DA TARDE", relatorioRotas);
            });

            // 3. Lista da Madrugada (15:00 PM)
            cron.schedule('0 15 * * *', async () => {
                const lista = await this.registroService.buscarOuCriarListaDoDia();
                const relatorioMadrugada = "Lógica de Madrugada Pendente de Implementação...";
                await this.enviarMensagemElegante(this.grupoId, "🌙 LISTA DA MADRUGADA", relatorioMadrugada);
            });

            // 4. Relatório Único de Penalizados (16:43)
            cron.schedule('43 16 * * *', async () => {
                try {
                    const lista = await this.registroService.buscarOuCriarListaDoDia();
                    const penalizados = await this.registroService.buscarMotoristasPenalizados(lista.id);

                    if (penalizados && penalizados.length > 0) {
                        let relatorio = "";
                        penalizados.forEach((m, i) => {
                            relatorio += `${i + 1}. *${m.nome}*\n`;
                        });
                        const msg = "Os seguintes motoristas enviaram o joinha antes do horário permitido e foram para o final da lista:\n\n" + relatorio;
                        await this.enviarMensagemElegante(this.grupoId, "⚠️ QUEIMARAM A LARGADA", msg);
                    }
                } catch (error: any) {
                    console.error(`[ERRO CRON 16:43]: ${error.message}`);
                }
            });
        }

        this.client.on('message_create', async (msg: Message) => {
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
                        await this.enviarMensagemElegante(this.grupoId, "CADASTRO", "🔐 O cadastro está fechado no momento. Aguarde o administrador abrir.");
                        return;
                    }
                    const nome = texto.replace('@cadastrar ', '').trim();
                    await this.registroService.cadastrarMotorista(nome, autor, this.client);
                    await this.enviarMensagemElegante(this.grupoId, "CADASTRO", `✅ *${nome}*, seu cadastro foi realizado com sucesso!`);
                    return;
                }

                // 2. Processamento de Comandos de Administrador (Prefixados com @)
                if (texto.startsWith('@')) {
                    const processado = await this.processarComandosAdmin(msg, texto, autor);
                    if (processado) return;
                }

                // 3. Janela de Banimento (16:37 - 16:39)
                if (this.isJanelaBanimento(agora)) {
                    if (EmojiHelper.isJoinha(texto)) {
                        const lista = await this.registroService.buscarOuCriarListaDoDia();
                        await this.registroService.adicionarJoinhaPenalizado(autor, lista.id, this.client);
                        return;
                    }
                    await this.registroService.registrarBanimentoAntecipado(autor, this.client);
                    return;
                }

                // 4. Janela de Joinha (16:40 - 16:42)
                if (this.isJanelaJoinha(agora) && EmojiHelper.isJoinha(texto)) {
                    const lista = await this.registroService.buscarOuCriarListaDoDia();
                    await this.registroService.adicionarJoinha(autor, lista.id, this.client);
                    return;
                }

            } catch (error: any) {
                console.error(`[ERRO BOT]: ${error.message}`);
                await this.enviarMensagemElegante(this.grupoId, "ERRO NO SISTEMA", `❌ ${error.message}`);
            }
        });
    }

    private async enviarMensagemElegante(to: string, titulo: string, conteudo: string): Promise<void> {
        const mensagem = `*${titulo}*\n\n${conteudo}`;
        await this.client.sendMessage(to, mensagem);
    }

    private isJanelaBanimento(data: Date): boolean {
        return data.getHours() === 16 && data.getMinutes() >= 37 && data.getMinutes() <= 39;
    }

    private isJanelaJoinha(data: Date): boolean {
        return data.getHours() === 16 && data.getMinutes() >= 40 && data.getMinutes() <= 42;
    }

    private async processarComandosAdmin(msg: Message, comando: string, autor: string): Promise<boolean> {
        const isAdmin = await this.registroService.verificarSeEhAdmin(autor, this.client);
        if (!isAdmin) {
            console.log(`🚫 Tentativa de comando admin por não-autorizado: ${autor}`);
            return false;
        }

        const partes = comando.trim().split(/\s+/);
        const acao = partes[0];
        const parametro = partes[1];

        if (comando === '@motoristas') {
            const motoristas = await MotoristaService.listarMotoristas();
            if (!motoristas || motoristas.length === 0) {
                await this.enviarMensagemElegante(this.grupoId, "MOTORISTAS", "📭 Nenhum motorista cadastrado.");
                return true;
            }
            let relatorio = "";
            motoristas.forEach((m, i) => {
                const status = m.ativo ? "✅" : "🚫";
                relatorio += `${i + 1}. *${m.nome}*\n📱 ${m.telefoneWhatsApp} ${status}\n\n`;
            });
            await this.enviarMensagemElegante(this.grupoId, "👥 LISTA DE MOTORISTAS", relatorio);
            return true;
        }

        if (comando === '@abrir_cadastro') {
            this.cadastroAberto = true;
            await this.enviarMensagemElegante(this.grupoId, "CADASTRO", "🔓 *CADASTRO LIBERADO!*\n\nMotoristas já podem enviar: `@cadastrar Seu Nome`.");
            return true;
        }

        if (comando === '@fechar_cadastro') {
            this.cadastroAberto = false;
            await this.enviarMensagemElegante(this.grupoId, "CADASTRO", "🔒 *CADASTRO FECHADO!*");
            return true;
        }

        if (comando === '@escala') {
            const lista = await this.registroService.buscarOuCriarListaDoDia();
            const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id);
            await this.enviarMensagemElegante(this.grupoId, "📋 ESCALA ATUAL", relatorio);
            return true;
        }

        if (acao === '@tipo_dia') {
            const dataString = partes[1]; // Captura DD/MM/AAAA
            const tipoInformado = partes[2]; // Captura DIA_LIVRE ou DIA_COMUM

            if (!dataString || !tipoInformado) {
                await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Use: `@tipo_dia DD/MM/AAAA DIA_LIVRE` ou `DIA_COMUM`.");
                return true;
            }

            try {
                // Envia para o serviço processar (conversão para Date ocorre lá dentro)
                await this.escalaService.definirTipoDiaManual(dataString, tipoInformado as any);
                
                // Formatação amigável para o usuário
                const tipoFormatado = tipoInformado.replace('_', ' ');
                await this.enviarMensagemElegante(
                    this.grupoId, 
                    "CONFIGURAÇÃO", 
                    `✅ O dia *${dataString}* foi configurado como *${tipoFormatado}*`
                );
            } catch (error: any) {
                await this.enviarMensagemElegante(this.grupoId, "ERRO", `❌ ${error.message}`);
            }
            return true;
        }


        if (acao === '@limpar_dia') {
            if (!parametro) {
                await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Informe a data. Ex: `@limpar_dia 25/12/2024`.");
                return true;
            }
            await this.escalaService.removerTipoDiaManual(parametro);
            await this.enviarMensagemElegante(this.grupoId, "CONFIGURAÇÃO", `✅ Marcação manual da data *${parametro}* removida.`);
            return true;
        }

        if (comando === '@listar_feriados') {
            const lista = await this.escalaService.listarDiasManuais();
            await this.enviarMensagemElegante(this.grupoId, "📅 FERIADOS/DIAS MANUAIS", lista);
            return true;
        }

        const mencionados = await msg.getMentions();

        // 1. @add @Nome
        if (comando.startsWith('@add') && !comando.includes(' posição ')) {
            const contato = mencionados[0];
            if (!contato) {
                await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Mencione o motorista: `@add @Nome`.");
                return true;
            }
            const telefone = contato.number;
            const nomeExibicao = contato.pushname || contato.name || "Motorista";
            try {
                const lista = await this.registroService.buscarOuCriarListaDoDia();
                await this.registroService.adicionarMotoristaManualmente(telefone, lista.id);
                await this.enviarMensagemElegante(this.grupoId, "SUCESSO", `✅ *${nomeExibicao}* adicionado ao final da fila.`);
            } catch (error: any) {
                await this.enviarMensagemElegante(this.grupoId, "ERRO", error.message);
            }
            return true;
        }

        // 2. @inserir @Nome posição 3
        if (comando.startsWith('@inserir')) {
            const contato = mencionados[0];
            const partesCmd = comando.split(' posição ');
            const posicao = parseInt(partesCmd[1]);
            if (!contato || isNaN(posicao)) {
                await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Use: `@inserir @Nome posição 3`.");
                return true;
            }
            const telefone = contato.number;
            const nomeExibicao = contato.pushname || contato.name || "Motorista";
            try {
                const lista = await this.registroService.buscarOuCriarListaDoDia();
                await this.registroService.inserirEmPosicaoEspecifica(telefone, lista.id, posicao);
                await this.enviarMensagemElegante(this.grupoId, "SUCESSO", `✅ *${nomeExibicao}* inserido na posição *${posicao}*.`);
            } catch (error: any) {
                await this.enviarMensagemElegante(this.grupoId, "ERRO", error.message);
            }
            return true;
        }

        // 3. @remover @Nome
        if (comando.startsWith('@remover')) {
            const contato = mencionados[0];
            if (!contato) {
                await this.enviarMensagemElegante(this.grupoId, "ERRO", "❌ Mencione o motorista: `@remover @Nome`.");
                return true;
            }
            const telefone = contato.number;
            const nomeExibicao = contato.pushname || contato.name || "Motorista";
            try {
                const lista = await this.registroService.buscarOuCriarListaDoDia();
                await this.registroService.removerMotoristaDaLista(telefone, lista.id);
                await this.enviarMensagemElegante(this.grupoId, "SUCESSO", `❌ *${nomeExibicao}* foi removido da lista.`);
            } catch (error: any) {
                await this.enviarMensagemElegante(this.grupoId, "ERRO", error.message);
            }
            return true;
        }

        if (acao === '@ativar' || acao === '@inativar') {
            if (!parametro) {
                await this.enviarMensagemElegante(this.grupoId, "ERRO", `❌ Informe o número. Ex: \`${acao} 554499999999\`.`);
                return true;
            }
            const motorista = await MotoristaService.buscarPorTelefone(parametro);
            if (!motorista) {
                await this.enviarMensagemElegante(this.grupoId, "ERRO", `❌ Motorista *${parametro}* não encontrado.`);
                return true;
            }
            const novoStatus = acao === '@ativar';
            await MotoristaService.alterarStatusAtivo(parametro, novoStatus);
            await this.enviarMensagemElegante(this.grupoId, "STATUS", `👤 Motorista *${motorista.nome}* agora está *${novoStatus ? 'ATIVO ✅' : 'INATIVO 🚫'}*.`);
            return true;
        }

        return false;
    }

    public setCadastroStatus(status: boolean): void {
        this.cadastroAberto = status;
        console.log(`[BOT] Cadastro alterado via App para: ${status}`);
    }

    public async enviarMensagemExterna(titulo: string, conteudo: string): Promise<void> {
        if (!this.grupoId) {
            console.error("❌ Erro: grupoId não definido no WhatsAppController");
            throw new Error("ID do grupo não configurado.");
        }
        try {
            await this.enviarMensagemElegante(this.grupoId, titulo, conteudo);
        } catch (err: any) {
            console.error("❌ Falha crítica ao enviar para o WhatsApp:", err.message);
            throw err;
        }
    }

    public async dispararEscalaManual(): Promise<string> {
        const lista = await this.registroService.buscarOuCriarListaDoDia();
        const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id);
        await this.enviarMensagemExterna("📋 ESCALA (VIA APP)", relatorio);
        return relatorio;
    }

    public async resetarFilaDoDia(): Promise<void> {
        const lista = await this.registroService.buscarOuCriarListaDoDia();
        await this.registroService.limparLista(lista.id);
        await this.enviarMensagemExterna("🧹 SISTEMA", "A lista de hoje foi *resetada* pelo administrador.");
    }
}