import { AppDataSource } from "../../data-source";
import { ListaJoia } from "../../models/ListaJoia";
import { Motorista } from "../../models/Motorista";
import { OrdemJoinha } from "../../models/OrdemJoinha";
import { Banimento } from "../../models/Banimento";
import { IdentificadorLista } from "../../interfaces/ITipos";
import { Client } from "whatsapp-web.js";
import MotoristaService from "../MotoristaService";
import AdministradorService from "../AdministradorService";

export class RegistroService {
    private readonly ordemRepositorio = AppDataSource.getRepository(OrdemJoinha);
    private readonly listaRepositorio = AppDataSource.getRepository(ListaJoia);
    private readonly banimentoRepositorio = AppDataSource.getRepository(Banimento);

    /**
     * Busca todos os motoristas que foram penalizados (queimaram a largada) em uma lista específica.
     * Usado para o relatório único enviado após a janela de joinhas.
     */
    public async buscarMotoristasPenalizados(listaId: number): Promise<Motorista[]> {
        const registros = await this.ordemRepositorio.find({
            where: {
                listaJoia: { id: listaId },
                isPenalizado: true
            },
            relations: ["motorista"],
            order: { horaDoJoinha: "ASC" }
        });

        return registros.map(reg => reg.motorista);
    }

    /**
     * LIMPAR LISTA: Remove todos os joinhas de uma lista específica
     */
    public async limparLista(listaId: number): Promise<void> {
        await this.buscarListaOuFailhar(listaId);
        await this.ordemRepositorio.delete({ listaJoia: { id: listaId } });
        console.log(`[SERVICE] Fila da lista ${listaId} foi zerada.`);
    }

    /**
     * Registro Normal (Janela Oficial)
     */
    async adicionarJoinha(whatsappId: string, listaId: number, client: Client): Promise<OrdemJoinha> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const motorista = await this.buscarMotoristaAtivoOuFalhar(telefone);
        const listaAtiva = await this.buscarListaOuFailhar(listaId);
        
        await this.verificarDuplicidadeNaLista(motorista.id, listaId);

        const novoJoinha = this.ordemRepositorio.create({
            posicao: 1, // A posição real é calculada pelo EscalaService no momento da geração
            isPenalizado: false,
            motorista: motorista,
            listaJoia: listaAtiva,
            horaDoJoinha: new Date()
        });

        return await this.ordemRepositorio.save(novoJoinha);
    }

    /**
     * Registro de Penalidade (Queimou a largada)
     */
    async adicionarJoinhaPenalizado(whatsappId: string, listaId: number, client: Client): Promise<OrdemJoinha> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const motorista = await this.buscarMotoristaAtivoOuFalhar(telefone);
        const listaAtiva = await this.buscarListaOuFailhar(listaId);
        
        await this.verificarDuplicidadeNaLista(motorista.id, listaId);

        const novoJoinha = this.ordemRepositorio.create({
            posicao: 1,
            isPenalizado: true,
            motorista: motorista,
            listaJoia: listaAtiva,
            horaDoJoinha: new Date()
        });

        return await this.ordemRepositorio.save(novoJoinha);
    }

    /**
     * Registra um banimento para quem enviou mensagem de texto (não emoji) na janela proibida
     */
    async registrarBanimentoAntecipado(whatsappId: string, client: Client): Promise<void> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const hoje = this.obterDataHoje();
        const motorista = await MotoristaService.buscarPorTelefone(telefone);

        if (!motorista) return;

        const jaBanido = await this.banimentoRepositorio.findOneBy({ 
            motorista: { id: motorista.id }, 
            dia: hoje 
        });

        if (!jaBanido) {
            const novoBan = this.banimentoRepositorio.create({
                dia: hoje,
                motorista: motorista,
                motivo: "Mensagem enviada na janela de banimento (Queimou a largada)"
            });
            await this.banimentoRepositorio.save(novoBan);
        }
    }

    /**
     * Busca ou cria a lista para a data atual
     */
    async buscarOuCriarListaDoDia(
        identificador: IdentificadorLista = 'CAPTURA_DIARIA',
        dataAlvo?: Date
    ): Promise<ListaJoia> {
        const dataBusca = dataAlvo ? this.formatarDataParaMeiaNoite(dataAlvo) : this.obterDataHoje();
        let lista = await this.listaRepositorio.findOneBy({ dia: dataBusca });

        if (!lista) {
            lista = this.listaRepositorio.create({ dia: dataBusca, identificador });
            await this.listaRepositorio.save(lista);
        }
        return lista;
    }

    public async adicionarMotoristaManualmente(telefone: string, listaId: number): Promise<OrdemJoinha> {
        const motorista = await MotoristaService.buscarPorTelefone(telefone);
        if (!motorista || !motorista.ativo) throw new Error("Motorista não encontrado ou inativo.");

        const listaAtiva = await this.buscarListaOuFailhar(listaId);
        await this.verificarDuplicidadeNaLista(motorista.id, listaId);

        const novoJoinha = this.ordemRepositorio.create({
            posicao: 1,
            isPenalizado: false,
            motorista: motorista,
            listaJoia: listaAtiva,
            horaDoJoinha: new Date()
        });

        return await this.ordemRepositorio.save(novoJoinha);
    }

    async removerMotoristaDaLista(telefone: string, listaId: number): Promise<void> {
        const motorista = await MotoristaService.buscarPorTelefone(telefone);
        if (!motorista) throw new Error("Motorista não cadastrado.");
        await this.ordemRepositorio.delete({ motorista: { id: motorista.id }, listaJoia: { id: listaId } });
    }

    async inserirEmPosicaoEspecifica(telefone: string, listaId: number, posicaoAlvo: number): Promise<void> {
        const motorista = await MotoristaService.buscarPorTelefone(telefone);
        if (!motorista) throw new Error("Motorista não cadastrado.");

        const listaAtual = await this.ordemRepositorio.find({
            where: { listaJoia: { id: listaId } },
            order: { isPenalizado: "ASC", horaDoJoinha: "ASC" },
            relations: ["motorista"]
        });

        const listaFiltrada = listaAtual.filter(item => item.motorista.id !== motorista.id);
        let novoHorario: Date;

        if (listaFiltrada.length >= posicaoAlvo && posicaoAlvo > 0) {
            const referencia = listaFiltrada[posicaoAlvo - 1].horaDoJoinha;
            novoHorario = new Date(referencia.getTime() - 1000);
        } else {
            novoHorario = new Date();
        }

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

    // Auxiliares
    private async obterNumeroReal(whatsappId: string, client: Client): Promise<string> {
        try {
            const contato = await client.getContactById(whatsappId);
            return contato.number.replace(/\D/g, '');
        } catch (error) {
            return whatsappId.split('@')[0].replace(/\D/g, '');
        }
    }

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
        if (!motorista || !motorista.ativo) throw new Error("Motorista não cadastrado ou inativo.");
        return motorista;
    }

    private async buscarListaOuFailhar(id: number): Promise<ListaJoia> {
        const lista = await this.listaRepositorio.findOneBy({ id });
        if (!lista) throw new Error("Lista não encontrada.");
        return lista;
    }

    private async verificarDuplicidadeNaLista(motoristaId: number, listaId: number): Promise<void> {
        const existe = await this.ordemRepositorio.findOneBy({ 
            motorista: { id: motoristaId }, 
            listaJoia: { id: listaId } 
        });
        if (existe) throw new Error("Você já está nesta lista!");
    }
}