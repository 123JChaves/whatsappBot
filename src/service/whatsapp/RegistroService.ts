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
    private readonly ordemRepo = AppDataSource.getRepository(OrdemJoinha);
    private readonly listaRepo = AppDataSource.getRepository(ListaJoia);
    private readonly banimentoRepo = AppDataSource.getRepository(Banimento);

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
        const hoje = this.obterDataHoje();
        const motorista = await this.buscarMotoristaAtivoOuFalhar(telefone);
        
        await this.verificarBanimento(motorista.id, hoje);
        const listaAtiva = await this.buscarListaOuFailhar(listaId);
        await this.verificarDuplicidadeNaLista(motorista.id, listaId);

        const novoJoinha = this.ordemRepo.create({ 
            posicao: 1, // Marcador de joinha válido
            motorista: motorista, 
            listaJoia: listaAtiva,
            // queimouLargada: false (assumindo que existe este campo na sua Entity)
        });
        return await this.ordemRepo.save(novoJoinha);
    }

    /**
     * Registro de Penalidade (Janela 19:57 - 19:59)
     * Não bane, mas marca para ser jogado ao fim da fila no EscalaService
     */
    async adicionarJoinhaPenalizado(whatsappId: string, listaId: number, client: Client): Promise<OrdemJoinha> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const hoje = this.obterDataHoje();
        const motorista = await this.buscarMotoristaAtivoOuFalhar(telefone);
        
        await this.verificarBanimento(motorista.id, hoje);
        const listaAtiva = await this.buscarListaOuFailhar(listaId);
        await this.verificarDuplicidadeNaLista(motorista.id, listaId);

        const novoJoinha = this.ordemRepo.create({ 
            posicao: 0, // Marcador de joinha penalizado
            motorista: motorista, 
            listaJoia: listaAtiva,
            // queimouLargada: true (assumindo que existe este campo na sua Entity)
        });
        return await this.ordemRepo.save(novoJoinha);
    }

    async registrarBanimentoAntecipado(whatsappId: string, client: Client): Promise<void> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const hoje = this.obterDataHoje();
        const motorista = await MotoristaService.buscarPorTelefone(telefone);
        if (!motorista) return;

        const jaBanido = await this.banimentoRepo.findOneBy({ motorista: { id: motorista.id }, dia: hoje });
        if (!jaBanido) {
            const novoBan = this.banimentoRepo.create({ 
                dia: hoje, 
                motorista: motorista, 
                motivo: "Mensagem enviada antes das 20h00 (Janela proibida 19:57-19:59)" 
            });
            await this.banimentoRepo.save(novoBan);
            }
        }

        async buscarOuCriarListaDoDia(
        identificador: IdentificadorLista = 'CAPTURA_DIARIA', 
        dataAlvo?: Date // Adicionado parâmetro opcional
    ): Promise<ListaJoia> {
        // Se dataAlvo existir, usa ela. Se não, usa a data de agora.
        const dataBusca = dataAlvo ? this.formatarDataParaMeiaNoite(dataAlvo) : this.obterDataHoje();
        
        let lista = await this.listaRepo.findOneBy({ dia: dataBusca });
        
        if (!lista) {
            lista = this.listaRepo.create({ dia: dataBusca, identificador });
            await this.listaRepo.save(lista);
        }
        return lista;
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
        const lista = await this.listaRepo.findOneBy({ id });
        if (!lista) throw new Error("Não há nenhuma lista aberta para este ID.");
        return lista;
    }

    private async verificarBanimento(motoristaId: number, data: Date): Promise<void> {
        const banido = await this.banimentoRepo.findOneBy({ motorista: { id: motoristaId }, dia: data });
        if (banido) {
            throw new Error(`JOIA BLOQUEADO! 🚫\nMotivo: ${banido.motivo}\nSua participação está bloqueada hoje.`);
        }
    }

    private async verificarDuplicidadeNaLista(motoristaId: number, listaId: number): Promise<void> {
        const existe = await this.ordemRepo.findOneBy({ motorista: { id: motoristaId }, listaJoia: { id: listaId } });
        if (existe) throw new Error("Você já está nesta lista!");
    }
}