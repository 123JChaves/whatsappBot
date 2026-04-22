import { AppDataSource } from "../../data-source";
import { ListaJoia } from "../../models/ListaJoia";
import { Motorista } from "../../models/Motorista";
import { OrdemJoinha } from "../../models/OrdemJoinha";
import { Administrador } from "../../models/Administrador";
import { Banimento } from "../../models/Banimento";
import { Repository } from "typeorm";
import { IdentificadorLista } from "../../interfaces/ITipos";

export class RegistroService {
    private readonly motoristaRepo: Repository<Motorista> = AppDataSource.getRepository(Motorista);
    private readonly ordemRepo: Repository<OrdemJoinha> = AppDataSource.getRepository(OrdemJoinha);
    private readonly listaRepo: Repository<ListaJoia> = AppDataSource.getRepository(ListaJoia);
    private readonly adminRepo: Repository<Administrador> = AppDataSource.getRepository(Administrador);
    private readonly banimentoRepo: Repository<Banimento> = AppDataSource.getRepository(Banimento);

    async adicionarJoinha(whatsappId: string, listaId: number): Promise<OrdemJoinha> {
        const telefone = this.extrairTelefone(whatsappId);
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

    async registrarBanimentoAntecipado(whatsappId: string): Promise<void> {
        const telefone = this.extrairTelefone(whatsappId);
        const hoje = this.obterDataHoje();

        const motorista = await this.motoristaRepo.findOneBy({ telefone, ativo: true });
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

    async buscarOuCriarListaDoDia(identificador: IdentificadorLista = 'CAPTURA_DIARIA'): Promise<ListaJoia> {
        const hoje = this.obterDataHoje();
        let lista = await this.listaRepo.findOneBy({ dia: hoje });

        if (!lista) {
            lista = this.listaRepo.create({ dia: hoje, identificador });
            await this.listaRepo.save(lista);
        }
        return lista;
    }

    async verificarSeEhAdmin(whatsappId: string): Promise<boolean> {
        const telefone = this.extrairTelefone(whatsappId);
        const admin = await this.adminRepo.findOneBy({ telefoneWhatsapp: telefone });
        return !!admin;
    }

    async cadastrarMotorista(nome: string, telefone: string): Promise<Motorista> {
        const novo = this.motoristaRepo.create({
            nome,
            telefone: telefone.replace(/\D/g, ''),
            ativo: true
        });
        return await this.motoristaRepo.save(novo);
    }

    // --- MÉTODOS PRIVADOS (CLEAN CODE) ---

    private extrairTelefone(whatsappId: string): string {
        return whatsappId.split('@')[0];
    }

    private obterDataHoje(): Date {
        const data = new Date();
        data.setHours(0, 0, 0, 0);
        return data;
    }

    private async buscarMotoristaAtivoOuFalhar(telefone: string): Promise<Motorista> {
        const motorista = await this.motoristaRepo.findOneBy({ telefone, ativo: true });
        if (!motorista) throw new Error("Motorista não cadastrado ou inativo.");
        return motorista;
    }

    private async buscarListaOuFalhar(id: number): Promise<ListaJoia> {
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
        const existe = await this.ordemRepo.findOneBy({ 
            motorista: { id: motoristaId }, 
            listaJoia: { id: listaId } 
        });
        if (existe) throw new Error("Você já está nesta lista!");
    }
}