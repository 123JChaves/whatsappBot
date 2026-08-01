import { AppDataSource } from "../data-source";
import { IsNull } from "typeorm";
import { Passageiro } from "../models/Passageiro";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import IPassageiro from "../interfaces/IPassageiro";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";
import EnderecoService from "./EndereçoService";
import TextoHelper from "../utils/helpers/TextoHelper";

class PassageiroService {
    private static passageiroRepositorio = AppDataSource.getRepository(Passageiro);

    // Tradutor Universal baseado no LID: Localiza o passageiro de forma explícita
    // recebendo tanto o ID sequencial numérico quanto o JID/LID do WhatsApp.
    static async resolverPassageiro(parametro: string | number): Promise<Passageiro> {
        const stringParam = String(parametro);

        if (stringParam.includes('@') || isNaN(Number(stringParam))) {
            const jidLimpo = stringParam.replace(/:[0-9]+/, '');
            const passageiro = await this.buscarPorLid(jidLimpo);
            if (!passageiro) {
                throw new NaoEncontradoErro("Passageiro não localizado pelo identificador whatsAppLid!");
            }
            return passageiro;
        }

        return await this.mostrarUmPassageiro(Number(parametro));
    }

    // Service para listar passageiros
    static async listarPassageiros(): Promise<Passageiro[]> {
        return await this.passageiroRepositorio.find({
            select: { 
                id: true, nome: true, telefoneWhatsApp: true, whatsAppLid: true, ativo: true, 
                empresa: { id: true, nome: true, logo: true }, 
                dataDeRegistro: true, dataDeEdicao: true 
            },
            relations: ["empresa", "endereco", "endereco.bairro", "endereco.bairro.cidade", "endereco.bairro.cidade.estado", "endereco.bairro.cidade.estado.pais"],
        });
    };

    // Service para mostrar um passageiro (por ID):
    static async mostrarUmPassageiro(id: number): Promise<Passageiro> {
        const passageiro = await this.passageiroRepositorio.findOne({
            where: { id },
            relations: ["empresa", "endereco", "endereco.bairro", "endereco.bairro.cidade", "endereco.bairro.cidade.estado", "endereco.bairro.cidade.estado.pais"],
        });
        if (!passageiro) throw new NaoEncontradoErro('Passageiro não identificado!');
        return passageiro;
    };

    // Service para listar passageiros vinculados à uma empresa e disponíveis:
    static async listarDisponiveisPorEmpresa(empresaId: number): Promise<Passageiro[]> {
        return await this.passageiroRepositorio.find({
            where: {
                empresa: { id: empresaId },
                rota: IsNull(), // Filtra quem não tem rotaId preenchido
                ativo: true
            },
            relations: ["endereco", "endereco.bairro"],
            select: {
                id: true,
                nome: true,
                endereco: {
                    id: true,
                    nome: true,
                    numero: true
                }
            }
        });
    }

    // Buscar passageiros segundo seus números de telefone:
    static async buscarPorTelefone(telefoneWhatsApp: string): Promise<Passageiro | null> {
        const foneLimpo = telefoneWhatsApp.replace(/\D/g, '');
        return await this.passageiroRepositorio.findOne({ where: { telefoneWhatsApp: foneLimpo } });
    };

    // Service para buscar passageiro por @lid:
    static async buscarPorLid(whatsAppLid: string): Promise<Passageiro | null> {
        const jidLimpo = whatsAppLid.replace(/:[0-9]+/, '');
        return await this.passageiroRepositorio.findOne({
            where: { whatsAppLid: jidLimpo },
            relations: ["empresa", "endereco", "endereco.bairro"]
        });
    }

    /**
     * ATUALIZADOR AUTOMÁTICO DE LID: Chamado pelo controlador de rede do WhatsApp.
     * Vincula o LID de forma atômica baseando-se no telefone exato digitado.
     */
    static async vincularLidAoTelefone(telefoneWhatsApp: string, whatsAppLid: string): Promise<boolean> {
        const foneLimpo = telefoneWhatsApp.replace(/\D/g, '');
        const jidLimpo = whatsAppLid.replace(/:[0-9]+/, '').trim();

        if (!foneLimpo || !jidLimpo) return false;

        try {
            // Executa um UPDATE direto no banco buscando por igualdade exata de strings
            const resultado = await this.passageiroRepositorio.createQueryBuilder()
                .update(Passageiro)
                .set({ whatsAppLid: jidLimpo })
                .where("telefoneWhatsApp = :telefone", { telefone: foneLimpo })
                .andWhere("ativo = true")
                .andWhere("(whatsAppLid IS NULL OR whatsAppLid != :jid)", { jid: jidLimpo })
                .execute();

            const atualizado = !!resultado.affected && resultado.affected > 0;

            if (atualizado) {
                console.log(`\n==================================================`);
                console.log(`✅ [SISTEMA CONTRA FALHAS] LID VINCULADO AO PASSAGEIRO`);
                console.log(`🆔 LID NUMÉRICO GRAVADO NO BANCO: ${jidLimpo}`);
                console.log(`==================================================\n`);
            }

            return atualizado;
        } catch (error) {
            console.error(`❌ Erro ao vincular LID ${jidLimpo} ao passageiro. Possível duplicidade:`, error);
            return false;
        }
    }

    // Service para cadastrar passageiros:
    static async cadastrarPassageiro(dados: IPassageiro): Promise<Passageiro> {
        validarCamposObrigatorios<Passageiro>(dados as Passageiro, ['nome', 'endereco', 'empresa']);
        
        if (dados.telefoneWhatsApp) {
            dados.telefoneWhatsApp = dados.telefoneWhatsApp.replace(/\D/g, '');
        }
        
        await VerificarDuplicidade<Passageiro>({ repositorio: this.passageiroRepositorio, dados: { telefoneWhatsApp: dados.telefoneWhatsApp } });

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if (dados.whatsAppLid) {
            dados.whatsAppLid = dados.whatsAppLid.replace(/:[0-9]+/, '');
            await VerificarDuplicidade<Passageiro>({ repositorio: this.passageiroRepositorio, dados: { whatsAppLid: dados.whatsAppLid } });
        }

        const enderecoComId = await EnderecoService.cadastrarEndereco(dados.endereco);
        dados.endereco = enderecoComId;

        const novoPassageiro = this.passageiroRepositorio.create(dados);
        return await this.passageiroRepositorio.save(novoPassageiro);
    };

    // Service para editar passageiro:
    static async editarPassageiro(id: number, dados: Partial<IPassageiro>): Promise<Passageiro> {
        const passageiro = await this.passageiroRepositorio.findOne({ 
            where: { id }, 
            relations: ["endereco"] 
        });

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if (!passageiro) throw new NaoEncontradoErro('Passageiro não encontrado!');

        if (dados.telefoneWhatsApp) {
            dados.telefoneWhatsApp = dados.telefoneWhatsApp.replace(/\D/g, '');
            await VerificarDuplicidade<Passageiro>({ 
                repositorio: this.passageiroRepositorio, 
                dados: { telefoneWhatsApp: dados.telefoneWhatsApp }, 
                idParaIgnorar: id 
            });
        }

        if (dados.whatsAppLid) {
            dados.whatsAppLid = dados.whatsAppLid.replace(/:[0-9]+/, '');
            await VerificarDuplicidade<Passageiro>({ 
                repositorio: this.passageiroRepositorio, 
                dados: { whatsAppLid: dados.whatsAppLid }, 
                idParaIgnorar: id 
            });
        }

        if (dados.endereco && (dados.endereco.nome || dados.endereco.numero)) {
            dados.endereco = await EnderecoService.cadastrarEndereco(dados.endereco);
        }

        if (dados.ativo !== undefined) {
            passageiro.ativo = dados.ativo;
        }

        this.passageiroRepositorio.merge(passageiro, dados as Passageiro);
        return await this.passageiroRepositorio.save(passageiro);
    };

    // Service para alterar o status do passageiro (ativo, inativo):
    static async alterarStatusAtivo(whatsAppLid: string, status: boolean): Promise<void> {
        const jidLimpo = whatsAppLid.replace(/:[0-9]+/, '');
        const passageiro = await this.passageiroRepositorio.findOneBy({ whatsAppLid: jidLimpo });
        if (!passageiro) {
            throw new NaoEncontradoErro('Passageiro não encontrado com este identificador!');
        }
        passageiro.ativo = status;
        await this.passageiroRepositorio.save(passageiro);
    }

    // Service para deletar passageiro:
    static async deletarPassageiro(id: number): Promise<void> {
        const passageiro = await this.passageiroRepositorio.findOneBy({ id });
        if (!passageiro) throw new NaoEncontradoErro('Passageiro não encontrado!');
        await this.passageiroRepositorio.remove(passageiro);
    };
};

export default PassageiroService;
