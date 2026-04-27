import { Client, Message } from "whatsapp-web.js";
import { RegistroService } from "../service/whatsapp/RegistroService";
import { EscalaService } from "../service/whatsapp/EscalaService";
import { EmojiHelper } from "../utils/helpers/EmojiHelper";
import MotoristaService from "../service/motorista/MotoristaService";
import 'dotenv/config';
import cron from "node-cron";

export class WhatsAppController {
  private readonly IDs_PERMITIDOS = [
    process.env.JWT_ID_BOTSECRET,
    process.env.JWT_ID_GROUPSECRET || ''
  ];
  private cadastroAberto = false;
  private grupoId: string;

  constructor(
    private client: Client,
    private registroService: RegistroService,
    private escalaService: EscalaService
  ) {
    this.grupoId = process.env.JWT_ID_GROUPSECRET || '';
  }

  public inicializar(): void {
    if (this.grupoId) {
      // 1. Escala baseada nos Joinhas (04:00 AM)
      cron.schedule('0 4 * * *', async () => {
        const lista = await this.registroService.buscarOuCriarListaDoDia();
        const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id);
        await this.enviarMensagemComBox(this.grupoId, "📋 ESCALA DO DIA", relatorio);
      });

      // 2. Lista de Rota da Tarde (07:00 AM)
      cron.schedule('0 7 * * *', async () => {
        const lista = await this.registroService.buscarOuCriarListaDoDia();
        const relatorioRotas = "Lógica de Rotas Pendente de Implementação...";
        await this.enviarMensagemComBox(this.grupoId, "🚚 ROTAS DA TARDE", relatorioRotas);
      });

      // 3. Lista da Madrugada (15:00 PM)
      cron.schedule('0 15 * * *', async () => {
        const lista = await this.registroService.buscarOuCriarListaDoDia();
        const relatorioMadrugada = "Lógica de Madrugada Pendente de Implementação...";
        await this.enviarMensagemComBox(this.grupoId, "🌙 LISTA DA MADRUGADA", relatorioMadrugada);
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
            await this.enviarMensagemComBox(this.grupoId, "Cadastro", "🔐 O cadastro está fechado no momento. Aguarde o administrador abrir.");
            return;
          }
          const nome = texto.replace('@cadastrar ', '').trim();
          await this.registroService.cadastrarMotorista(nome, autor, this.client);
          await this.enviarMensagemComBox(this.grupoId, "Cadastro", `✅ *${nome}*, seu cadastro foi realizado com sucesso!`);
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
            await this.enviarMensagemComBox(this.grupoId, "Atenção", "⚠️ *QUEIMOU A LARGADA!* Seu joinha foi registrado, mas você perdeu a preferência e ficará no final da lista.");
            return;
          }
          await this.registroService.registrarBanimentoAntecipado(autor, this.client);
          return;
        }

        // 4. Janela de Joinha (20:00 - 20:02)
        if (this.isJanelaJoinha(agora) && EmojiHelper.isJoinha(texto)) {
          const lista = await this.registroService.buscarOuCriarListaDoDia();
          await this.registroService.adicionarJoinha(autor, lista.id, this.client);
          //await this.enviarMensagemComBox(this.grupoId, "Joinha", "👍🏻 Registrado na fila.");
          return;
        }
      } catch (error: any) {
        console.error(`[ERRO BOT]: ${error.message}`);
        await this.enviarMensagemComBox(this.grupoId, "Erro", `❌ ${error.message}`);
      }
    });
  }

  private async enviarMensagemComBox(to: string, titulo: string, conteudo: string): Promise<void> {
    const mensagem = `*${titulo}*\n\`\`\`\n${conteudo}\n\`\`\``;
    await this.client.sendMessage(to, mensagem);
  }

    // No WhatsAppController.ts
    private isJanelaBanimento(data: Date): boolean {
        // Bloqueia APENAS até um minuto antes do oficial
        return data.getHours() === 16 && data.getMinutes() >= 37 && data.getMinutes() <= 39;
    }

    private isJanelaJoinha(data: Date): boolean {
        // Oficialmente libera a partir das 16:40
        return data.getHours() === 16 && data.getMinutes() >= 40 && data.getMinutes() <= 42;
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
        await this.enviarMensagemComBox(this.grupoId, "Motoristas", "📭 Nenhum motorista cadastrado.");
        return true;
      }
      let relatorio = "";
      motoristas.forEach((m, i) => {
        const status = m.ativo ? "✅" : "🚫";
        relatorio += `${i + 1}. ${m.nome}\n 📱 ${m.telefoneWhatsApp} ${status}\n\n`;
      });
      await this.enviarMensagemComBox(this.grupoId, "👥 LISTA DE MOTORISTAS", relatorio);
      return true;
    }

    if (comando === '@abrir_cadastro') {
      this.cadastroAberto = true;
      await this.enviarMensagemComBox(this.grupoId, "Cadastro", "🔓 `*CADASTRO LIBERADO!*` \nMotoristas já podem enviar: `@cadastrar Seu Nome`.");
      return true;
    }

    if (comando === '@fechar_cadastro') {
      this.cadastroAberto = false;
      await this.enviarMensagemComBox(this.grupoId, "Cadastro", "🔐 *CADASTRO FECHADO!*");
      return true;
    }

    if (comando === '@escala') {
      const lista = await this.registroService.buscarOuCriarListaDoDia();
      const relatorio = await this.escalaService.gerarEscalaCompleta(lista.id);
      await this.enviarMensagemComBox(this.grupoId, "📋 ESCALA ATUAL", relatorio);
      return true;
    }

    if (acao === '@tipo_dia') {
      if (!parametro || !comando.split(' ')[2]) {
        await this.enviarMensagemComBox(this.grupoId, "Erro", "❌ Use: `@tipo_dia DD/MM/AAAA DIA_LIVRE` ou `DIA_COMUM`.");
        return true;
      }
      const dataString = parametro; // DD/MM/AAAA
      const tipoInformado = comando.split(' ')[2] as any; // DIA_LIVRE ou DIA_COMUM
      await this.escalaService.definirTipoDiaManual(dataString, tipoInformado);
      await this.enviarMensagemComBox(this.grupoId, "Configuração", `✅ O dia *${dataString}* foi configurado como *${tipoInformado}*`);
      return true;
    }

    if (acao === '@limpar_dia') {
      if (!parametro) {
        await this.enviarMensagemComBox(this.grupoId, "Erro", "❌ Informe a data. Ex: `@limpar_dia 25/12/2024`.");
        return true;
      }
      await this.escalaService.removerTipoDiaManual(parametro);
      await this.enviarMensagemComBox(this.grupoId, "Configuração", `✅ Marcação manual da data *${parametro}* removida. O bot voltará a usar o calendário padrão.`);
      return true;
    }

        if (comando === '@listar_feriados') {
      const lista = await this.escalaService.listarDiasManuais();
      await this.enviarMensagemComBox(this.grupoId, "Feriados", lista);
      return true;
    }

    const mencionados = await msg.getMentions();
    const telefone = mencionados[0]?.number;

    // 1. @add @Nome
    if (comando.startsWith('@add') && !comando.includes(' posição ')) {
        if (!telefone) {
            await this.enviarMensagemComBox(this.grupoId, "Erro", "Mencione o motorista: @add @Nome");
            return true; // Retorne true separadamente
        }
        const lista = await this.registroService.buscarOuCriarListaDoDia();
        await this.registroService.adicionarMotoristaManualmente(telefone, lista.id);
        await this.enviarMensagemComBox(this.grupoId, "Sucesso", "✅ Adicionado ao final da fila.");
        return true;
    }

    // 2. @inserir @Nome pos 3
    if (comando.startsWith('@inserir')) {
        const posicao = parseInt(comando.split(' pos ')[1]);
        if (!telefone || isNaN(posicao)) {
            await this.enviarMensagemComBox(this.grupoId, "Erro", "Use: @inserir @Nome pos 3");
            return true;
        }
        const lista = await this.registroService.buscarOuCriarListaDoDia();
        await this.registroService.inserirEmPosicaoEspecifica(telefone, lista.id, posicao);
        await this.enviarMensagemComBox(this.grupoId, "Sucesso", `✅ Motorista inserido na posição ${posicao}.`);
        return true;
    }

    // 3. @remover @Nome
    if (comando.startsWith('@remover')) {
        if (!telefone) {
            await this.enviarMensagemComBox(this.grupoId, "Erro", "Mencione o motorista: @remover @Nome");
            return true;
        }
        const lista = await this.registroService.buscarOuCriarListaDoDia();
        await this.registroService.removerMotoristaDaLista(telefone, lista.id);
        await this.enviarMensagemComBox(this.grupoId, "Sucesso", "❌ Motorista removido da lista.");
        return true;
    }



    if (acao === '@ativar' || acao === '@inativar') {
      if (!parametro) {
        await this.enviarMensagemComBox(this.grupoId, "Erro", `❌ Informe o número. Ex: \`${acao} 554499999999\`.`);
        return true;
      }
      const motorista = await MotoristaService.buscarPorTelefone(parametro);
      if (!motorista) {
        await this.enviarMensagemComBox(this.grupoId, "Erro", `❌ Motorista *${parametro}* não encontrado.`);
        return true;
      }
      const novoStatus = acao === '@ativar';
      await MotoristaService.alterarStatusAtivo(parametro, novoStatus);
      await this.enviarMensagemComBox(this.grupoId, "Motorista", `👤 Motorista *${motorista.nome}* (${parametro}) agora está *${novoStatus ? 'ATIVO ✅' : 'INATIVO 🚫'}*.`);
      return true;
    }

    return false;
  }
}