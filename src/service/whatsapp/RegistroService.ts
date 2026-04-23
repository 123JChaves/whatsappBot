import { AppDataSource } from "../../data-source";
import { ListaJoia } from "../../models/ListaJoia";
import { Motorista } from "../../models/Motorista";
import { OrdemJoinha } from "../../models/OrdemJoinha";
import { Banimento } from "../../models/Banimento";
import { IdentificadorLista } from "../../interfaces/ITipos";
import { Client } from "whatsapp-web.js";

// Importação dos Services Centralizados
import MotoristaService from "../motorista/MotoristaService";
import AdministradorService from "../administrador/AdministradorService";

export class RegistroService {
    private readonly ordemRepo = AppDataSource.getRepository(OrdemJoinha);
    private readonly listaRepo = AppDataSource.getRepository(ListaJoia);
    private readonly banimentoRepo = AppDataSource.getRepository(Banimento);

    /**
     * TRADUÇÃO ROBUSTA: Tenta de todas as formas obter o número real do chip (55...)
     */
    private async obterNumeroReal(whatsappId: string, client: Client): Promise<string> {
        try {
            const contato = await client.getContactById(whatsappId);
            
            // Se o número vier preenchido, usamos ele
            if (contato.number && !contato.number.includes('@')) {
                return contato.number.replace(/\D/g, '');
            }

            // Se o número falhar (comum em @lid), tentamos buscar o ID do chat direto
            const chat = await client.getChatById(whatsappId);
            if (chat.id.user && !chat.id.user.includes('lid')) {
                return chat.id.user.replace(/\D/g, '');
            }

            // Fallback final: limpa o ID bruto se nada mais funcionar
            return whatsappId.split('@')[0].split(':')[0].replace(/\D/g, '');
        } catch (error) {
            return whatsappId.split('@')[0].split(':')[0].replace(/\D/g, '');
        }
    }

    async adicionarJoinha(whatsappId: string, listaId: number, client: Client): Promise<OrdemJoinha> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const hoje = this.obterDataHoje();

        const motorista = await this.buscarMotoristaAtivoOuFalhar(telefone);
        await this.verificarBanimento(motorista.id, hoje);
        const listaAtiva = await this.buscarListaOuFalhar(listaId);
        await this.verificarDuplicidadeNaLista(motorista.id, listaId);

        const totalPosicao = await this.ordemRepo.countBy({ listaJoia: { id: listaId } });

        const novoJoinha = this.ordemRepo.create({
            posicao: totalPosicao + 1,
            motorista: motorista,
            listaJoia: listaAtiva
        });

        return await this.ordemRepo.save(novoJoinha);
    }

    async registrarBanimentoAntecipado(whatsappId: string, client: Client): Promise<void> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const hoje = this.obterDataHoje();

        const motorista = await MotoristaService.buscarPorTelefone(telefone);
        if (!motorista) return;

        const jaBanido = await this.banimentoRepo.findOneBy({ 
            motorista: { id: motorista.id }, 
            dia: hoje 
        });

        if (!jaBanido) {
            const novoBan = this.banimentoRepo.create({
                dia: hoje,
                motorista: motorista,
                motivo: "Mensagem enviada antes das 20h00 (Janela proibida 19:57-19:59)"
            });
            await this.banimentoRepo.save(novoBan);
        }
    }

    async buscarOuCriarListaDoDia(identificador: IdentificadorLista = 'CAPTURA_DIARIA'): Promise<ListaJoia> {
        const hoje = this.obterDataHoje();
        let lista = await this.listaRepo.findOneBy({ dia: hoje });

        if (!lista) {
            lista = this.listaRepo.create({ dia: hoje, identificador });
            await this.listaRepo.save(lista);
        }
        return lista;
    }

    async verificarSeEhAdmin(whatsappId: string, client: Client): Promise<boolean> {
        const telefone = await this.obterNumeroReal(whatsappId, client);
        const administradores = await AdministradorService.listarAdministradores();
        return administradores.some(admin => admin.telefoneWhatsapp === telefone);
    }

    async cadastrarMotorista(nome: string, whatsappId: string, client: Client): Promise<Motorista> {
        const telefoneReal = await this.obterNumeroReal(whatsappId, client);
        
        return await MotoristaService.cadastrarMotorista({
            nome,
            telefoneWhatsapp: telefoneReal,
            ativo: true
        });
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

    private async buscarListaOuFalhar(id: number): Promise<ListaJoia> {
        const lista = await this.listaRepo.findOneBy({ id });
        if (!lista) throw new Error("Não há nenhuma lista aberta para este ID.");
        return lista;
    }

    private async verificarBanimento(motoristaId: number, data: Date): Promise<void> {
        const banido = await this.banimentoRepo.findOneBy({ 
            motorista: { id: motoristaId }, 
            dia: data 
        });
        if (banido) {
            throw new Error(`JOIA BLOQUEADO! 🚫\nMotivo: ${banido.motivo}\nSua participação está bloqueada hoje.`);
        }
    }

    private async verificarDuplicidadeNaLista(motoristaId: number, listaId: number): Promise<void> {
        const existe = await this.ordemRepo.findOneBy({ 
            motorista: { id: motoristaId }, 
            listaJoia: { id: listaId } 
        });
        if (existe) throw new Error("Você já está nesta lista!");
    }
}