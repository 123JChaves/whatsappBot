import { AppDataSource } from "../data-source";
import { Motorista } from "../models/Motorista";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import IMotorista from "../interfaces/IMotorista";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";
import TextoHelper from "../utils/helpers/TextoHelper";
import { cache, ChavesCache, TTL } from "../infra/cache/CacheService";
import { eventBus, CanaisEventos } from "../infra/eventos/EventBus";

class MotoristaService {
    private static motoristaRepositorio = AppDataSource.getRepository(Motorista);

    // Tradutor Universal baseado no LID: Localiza o motorista de forma explícita
    // recebendo tanto o ID sequencial numérico quanto o JID/LID textual do WhatsApp.    
    static async resolverMotorista(parametro: string | number): Promise<Motorista> {
        const stringParam = String(parametro);

        if (stringParam.includes('@') || isNaN(Number(stringParam))) {
            const jidLimpo = stringParam.replace(/:[0-9]+/, '');
            const motorista = await this.buscarPorLid(jidLimpo);
            if (!motorista) {
                throw new NaoEncontradoErro("Motorista não localizado pelo identificador whatsAppLid!");
            }
            return motorista;
        }

        return await this.mostrarUmMotorista(Number(parametro));
    }

    // Service para listar todos os motoristas
    static async listarMotoristas(): Promise<Motorista[]> {
        return cache.obterOuCarregar(ChavesCache.motoristasTodos(), TTL.MOTORISTAS, () => this.listarMotoristasDoBanco());
    }

    private static async listarMotoristasDoBanco(): Promise<Motorista[]> {
        return await this.motoristaRepositorio.find({
            select: {
                id: true,
                nome: true,
                telefoneWhatsApp: true,
                whatsAppLid: true,
                ativo: true,
                podeFazerRota: true
            },
        });
    }

    // Service para mostrar um motorista (por ID):
    static async mostrarUmMotorista(id: number): Promise<Motorista> {
        const motorista = await this.motoristaRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                telefoneWhatsApp: true,
                whatsAppLid: true,
                ativo: true,
                podeFazerRota: true
            },
        });

        if (!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado!');
        }

        return motorista;
    }
    
    // Service para buscar motorista por @lid:
    static async buscarPorLid(whatsAppLid: string): Promise<Motorista | null> {
        const jidLimpo = whatsAppLid.replace(/:[0-9]+/, '');
        return await this.motoristaRepositorio.findOne({
            where: { whatsAppLid: jidLimpo }
        });
    }

    /**
     * ATUALIZADOR AUTOMÁTICO DE LID: Chamado pelo controlador assim que intercepta o 
     * acoplamento de rede entre o telefone real (PN) e o código do LID.
     */
    static async vincularLidAoTelefone(telefoneWhatsApp: string, whatsAppLid: string): Promise<void> {
        const foneLimpo = telefoneWhatsApp.replace(/\D/g, '');
        const jidLimpo = whatsAppLid.replace(/:[0-9]+/, '');

        const motorista = await this.motoristaRepositorio.findOne({
            where: { telefoneWhatsApp: foneLimpo }
        });

        if (motorista && motorista.whatsAppLid !== jidLimpo) {
            motorista.whatsAppLid = jidLimpo;
            await this.motoristaRepositorio.save(motorista);
            await this.aposAlteracao(motorista.id, 'LID_VINCULADO');
            console.log(`[SISTEMA CONTRA FALHAS] 🏅 LID ${jidLimpo} vinculado ao motorista: ${motorista.nome}`);
        }
    }
    
    // Service para cadastrar motorista:
    static async cadastrarMotorista(dados: IMotorista): Promise<Motorista> {
        validarCamposObrigatorios<Motorista>(dados as Motorista, 
            [ 'nome', 'telefoneWhatsApp' ]
        );

        if (dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        // ✅ CORREÇÃO: Só sanitiza e checa duplicidade se o whatsAppLid tiver sido enviado
        if (dados.whatsAppLid) {
            dados.whatsAppLid = dados.whatsAppLid.replace(/:[0-9]+/, '');

            await VerificarDuplicidade<Motorista>({
                repositorio: this.motoristaRepositorio,
                dados: { whatsAppLid: dados.whatsAppLid }
            });
        }

        const novoMotorista = await this.motoristaRepositorio.save(
            this.motoristaRepositorio.create(dados)
        );
        await this.aposAlteracao(novoMotorista.id, 'CRIADO');
        return novoMotorista;
    }

    // Service para editar motorista: 
    static async editarMotorista(id: number, dados: Partial<IMotorista>): Promise<Motorista> {
        const motorista = await this.motoristaRepositorio.findOne({ where: { id } });

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if (!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado!');
        }

        if (dados.whatsAppLid) {
            dados.whatsAppLid = dados.whatsAppLid.replace(/:[0-9]+/, '');
            await VerificarDuplicidade<Motorista>({
                repositorio: this.motoristaRepositorio,
                dados: { whatsAppLid: dados.whatsAppLid },
                idParaIgnorar: id
            });
        }

        this.motoristaRepositorio.merge(motorista, dados as Motorista);
        const motoristaEditado = await this.motoristaRepositorio.save(motorista);
        await this.aposAlteracao(id, 'EDITADO');
        return motoristaEditado;
    }

    // Service para alterar o status do motorista (ativo, inativo):
    static async alterarStatusAtivo(whatsAppLid: string, status: boolean): Promise<void> {
        const jidLimpo = whatsAppLid.replace(/:[0-9]+/, '');
        const motorista = await this.motoristaRepositorio.findOneBy({ whatsAppLid: jidLimpo });
        if (!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado com este identificador!');
        }
        motorista.ativo = status;
        await this.motoristaRepositorio.save(motorista);
        await this.aposAlteracao(motorista.id, status ? 'ATIVADO' : 'INATIVADO');
    }
    
    // Service para deletar motorista:
    static async deletarMotorista(id: number): Promise<void> {
        const motorista = await this.motoristaRepositorio.findOneBy({ id });
        if (!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado para a exclusão!');
        }
        await this.motoristaRepositorio.remove(motorista);
        await this.aposAlteracao(id, 'EXCLUIDO');
    }

    // INVALIDAÇÃO + EVENTO
    private static async aposAlteracao(motoristaId: number, acao: string): Promise<void> {
        await cache.invalidarPorPrefixo(ChavesCache.PREFIXO_MOTORISTAS);
        await eventBus.publicar(CanaisEventos.MOTORISTA_ALTERADO, { motoristaId, acao });
    }
}

export default MotoristaService;