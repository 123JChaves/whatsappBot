import { AppDataSource } from "../../data-source";
import { ListaJoia } from "../../models/ListaJoia";
import { Motorista } from "../../models/Motorista";
import { OrdemJoinha } from "../../models/OrdemJoinha";
import { Banimento } from "../../models/Banimento";
import { IdentificadorLista } from "../../interfaces/ITipos";
import { Client } from "whatsapp-web.js";
import MotoristaService from "../motorista/MotoristaService";
import AdministradorService from "../administrador/AdministradorService";

export class RegistroService {
    private readonly ordemRepositorio = AppDataSource.getRepository(OrdemJoinha);
    private readonly listaRepositorio = AppDataSource.getRepository(ListaJoia);
    private readonly banimentoRepositorio = AppDataSource.getRepository(Banimento);

    private async obterNumeroReal(whatsappId: string, client: Client): Promise<string> {
        try {
            const contato = await client.getContactById(whatsappId);
            if (contato.number && !contato.number.includes('@')) {
                return contato.number.replace(/\D/g, '');
            }
            const chat = await client.getChatById(whatsappId);
            if (chat.id.user && !chat.id.user.includes('lid')) {
                return chat.id.user.replace(/\D/g, '');
            }
            return whatsappId.split('@')[0].split(':')[0].replace(/\D/g, '');
        } catch (error) {
            return whatsappId.split('@')[0].split(':')[0].replace(/\D/g, '');
        }
    }

        /**
         * Registro Normal (Janela das 20h00)
         */
        async adicionarJoinha(whatsappId: string, listaId: number, client: Client): Promise<OrdemJoinha> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const motorista = await this.buscarMotoristaAtivoOuFalhar(telefone);
        
        // Aqui garantimos que ele entre na "Lista Específica" do dia
        const listaAtiva = await this.buscarListaOuFailhar(listaId);

        await this.verificarDuplicidadeNaLista(motorista.id, listaId);

        const novoJoinha = this.ordemRepositorio.create({
            posicao: 1, 
            isPenalizado: false,
            motorista: motorista,
            listaJoia: listaAtiva, // Aqui ele é "guardado" na lista correta
            horaDoJoinha: new Date() // O carimbo do evento
        });

        return await this.ordemRepositorio.save(novoJoinha);
    }


        /**
     * Registro de Penalidade (Janela 19:57 - 19:59)
     * Usa o campo isPenalizado do banco para controle
     */
    async adicionarJoinhaPenalizado(whatsappId: string, listaId: number, client: Client): Promise<OrdemJoinha> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const hoje = this.obterDataHoje();
        const motorista = await this.buscarMotoristaAtivoOuFalhar(telefone);
        
        await this.verificarBanimento(motorista.id, hoje);
        const listaAtiva = await this.buscarListaOuFailhar(listaId);
        await this.verificarDuplicidadeNaLista(motorista.id, listaId);

        const novoJoinha = this.ordemRepositorio.create({
            posicao: 1,           // Mantemos 1 para não quebrar lógicas de contagem
            isPenalizado: true,      // <--- AQUI: Ativando a flag da sua tabela
            motorista: motorista,
            listaJoia: listaAtiva,
        });

        return await this.ordemRepositorio.save(novoJoinha);
    }


    async registrarBanimentoAntecipado(whatsappId: string, client: Client): Promise<void> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const hoje = this.obterDataHoje();
        const motorista = await MotoristaService.buscarPorTelefone(telefone);
        if (!motorista) return;

        const jaBanido = await this.banimentoRepositorio.findOneBy({ motorista: { id: motorista.id }, dia: hoje });
        if (!jaBanido) {
            const novoBan = this.banimentoRepositorio.create({ 
                dia: hoje, 
                motorista: motorista, 
                motivo: "Mensagem enviada antes das 20h00 (Janela proibida 19:57-19:59)" 
            });
            await this.banimentoRepositorio.save(novoBan);
            }
        }

        async buscarOuCriarListaDoDia(
        identificador: IdentificadorLista = 'CAPTURA_DIARIA', 
        dataAlvo?: Date // Adicionado parâmetro opcional
    ): Promise<ListaJoia> {
        // Se dataAlvo existir, usa ela. Se não, usa a data de agora.
        const dataBusca = dataAlvo ? this.formatarDataParaMeiaNoite(dataAlvo) : this.obterDataHoje();
        
        let lista = await this.listaRepositorio.findOneBy({ dia: dataBusca });
        
        if (!lista) {
            lista = this.listaRepositorio.create({ dia: dataBusca, identificador });
            await this.listaRepositorio.save(lista);
        }
        return lista;
    }

    /**
     * ADICIONAR MANUALMENTE: Coloca o motorista no final da fila atual
     */
    public async adicionarMotoristaManualmente(telefone: string, listaId: number): Promise<OrdemJoinha> {
        const motorista = await MotoristaService.buscarPorTelefone(telefone);
        if (!motorista) throw new Error("Motorista não cadastrado.");
        if (!motorista.ativo) throw new Error("Motorista inativo.");

        const listaAtiva = await this.buscarListaOuFailhar(listaId);
        await this.verificarDuplicidadeNaLista(motorista.id, listaId);

        const novoJoinha = this.ordemRepositorio.create({
            posicao: 1,
            isPenalizado: false,
            motorista: motorista,
            listaJoia: listaAtiva,
            horaDoJoinha: new Date() // Final da fila
        });

        return await this.ordemRepositorio.save(novoJoinha);
    }


        /**
     * REMOVER: Deleta o registro do joinha da lista específica
     */
    async removerMotoristaDaLista(telefone: string, listaId: number): Promise<void> {
        const motorista = await MotoristaService.buscarPorTelefone(telefone);
        if (!motorista) throw new Error("Motorista não cadastrado.");
        await this.ordemRepositorio.delete({ motorista: { id: motorista.id }, listaJoia: { id: listaId } });
    }

    /**
     * INSERIR POSIÇÃO ESPECÍFICA: Recalcula a ordem baseada no tempo
     */
    async inserirEmPosicaoEspecifica(telefone: string, listaId: number, posicaoAlvo: number): Promise<void> {
        const motorista = await MotoristaService.buscarPorTelefone(telefone);
        if (!motorista) throw new Error("Motorista não cadastrado.");

        // 1. Pega a lista atual ordenada
        const listaAtual = await this.ordemRepositorio.find({
            where: { listaJoia: { id: listaId } },
            order: { isPenalizado: "ASC", horaDoJoinha: "ASC" },
            relations: ["motorista"]
        });

        // 2. Remove o motorista se ele já estiver na lista (para reordenar)
        const listaFiltrada = listaAtual.filter(item => item.motorista.id !== motorista.id);

        // 3. Define o horário de referência (baseado no registro que está na posição alvo)
        // Se a lista estiver vazia ou a posição for maior que a lista, vai para o fim.
        let novoHorario: Date;
        if (listaFiltrada.length >= posicaoAlvo) {
            // Pega o horário de quem está atualmente na posição e subtrai 1 segundo
            const referencia = listaFiltrada[posicaoAlvo - 1].horaDoJoinha;
            novoHorario = new Date(referencia.getTime() - 1000); 
        } else {
            novoHorario = new Date();
        }

        // 4. Salva ou atualiza o registro
        let registro = await this.ordemRepositorio.findOneBy({ motorista: { id: motorista.id }, listaJoia: { id: listaId } });
        
        if (registro) {
            registro.horaDoJoinha = novoHorario;
            registro.isPenalizado = false;
        } else {
            registro = this.ordemRepositorio.create({
                posicao: 1,
                isPenalizado: false,
                motorista,
                listaJoia: { id: listaId },
                horaDoJoinha: novoHorario
            });
        }
        await this.ordemRepositorio.save(registro);
    }


    // Método auxiliar para garantir que qualquer data enviada vire "meia-noite"
    private formatarDataParaMeiaNoite(data: Date): Date {
        const novaData = new Date(data);
        novaData.setHours(0, 0, 0, 0);
        return novaData;
    }

    async verificarSeEhAdmin(whatsappId: string, client: Client): Promise<boolean> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const administradores = await AdministradorService.listarAdministradores();
        return administradores.some(admin => admin.telefoneWhatsApp === telefone);
    }

    async cadastrarMotorista(nome: string, whatsAppId: string, client: Client): Promise<Motorista> {
        const telefoneReal = await this.obterNumeroReal(whatsAppId, client);
        return await MotoristaService.cadastrarMotorista({ nome, telefoneWhatsApp: telefoneReal, ativo: true });
    }

    private obterDataHoje(): Date {
        const data = new Date();
        data.setHours(0, 0, 0, 0);
        return data;
    }

    private async buscarMotoristaAtivoOuFalhar(telefone: string): Promise<Motorista> {
        const motorista = await MotoristaService.buscarPorTelefone(telefone);
        if (!motorista || !motorista.ativo) {
            throw new Error("Motorista não cadastrado ou inativo.");
        }
        return motorista;
    }

    private async buscarListaOuFailhar(id: number): Promise<ListaJoia> {
        const lista = await this.listaRepositorio.findOneBy({ id });
        if (!lista) throw new Error("Não há nenhuma lista aberta para este ID.");
        return lista;
    }

    private async verificarBanimento(motoristaId: number, data: Date): Promise<void> {
        const banido = await this.banimentoRepositorio.findOneBy({ motorista: { id: motoristaId }, dia: data });
        if (banido) {
            throw new Error(`JOIA BLOQUEADO! 🚫\nMotivo: ${banido.motivo}\nSua participação está bloqueada hoje.`);
        }
    }

    private async verificarDuplicidadeNaLista(motoristaId: number, listaId: number): Promise<void> {
        const existe = await this.ordemRepositorio.findOneBy({ motorista: { id: motoristaId }, listaJoia: { id: listaId } });
        if (existe) throw new Error("Você já está nesta lista!");
    }
}