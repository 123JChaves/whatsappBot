import { AppDataSource } from "../data-source";
import { Bairro } from "../models/Bairro";
import { Cidade } from "../models/Cidade";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import IBairro from "../interfaces/IBairro";
import BuscarOuCriar from "../utils/helpers/BuscarOuCriar";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";

class BairroService {

    private static bairroRepositorio = AppDataSource.getRepository(Bairro);
    private static cidadeRepositorio = AppDataSource.getRepository(Cidade);

    // Service para listar todas as cidades:
    static async listarBairros(): Promise<Bairro[]> {
        const bairros = await this.bairroRepositorio.find({
            select: {
                id: true,
                nome: true,
                cidade: {
                    nome: true
                },
            },
            relations: [
                    'cidade'
                ],
        });
        return bairros;
    };

    // Service para mostrar um bairro (por ID):
    static async mostrarUmBairro(id: number): Promise<Bairro> {
        const bairro = await this.bairroRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                cidade: {
                    nome: true
                },
            },
            relations: [
                    'cidade'
                ],
        });

        if(!bairro) {
            throw new NaoEncontradoErro('Bairro não encontrado no sistema');
        };

        return bairro;
    };

    // Service para cadastrar bairro:
    static async cadastrarBairro(dados: IBairro): Promise<Bairro> {
        validarCamposObrigatorios<IBairro>(dados, ['nome']);

        const cidadeFinal = await BuscarOuCriar<Cidade>({
            repositorio: this.cidadeRepositorio,
            dados: dados.cidade as Cidade,
            criterio: { 
                nome: dados.cidade?.nome, 
                estado: { nome: dados.cidade?.estado?.nome } 
            }
        });

        await VerificarDuplicidade<Bairro>({
            repositorio: this.bairroRepositorio,
            dados: { 
                nome: dados.nome, 
                cidade: cidadeFinal as Cidade
            },
        });

        const novoBairro = this.bairroRepositorio.create({ 
            ...dados, 
            cidade: cidadeFinal 
        });

        return await this.bairroRepositorio.save(novoBairro);
    };

    // Service para editar bairro:
    static async editarBairro(id: number, dados: Partial<IBairro>): Promise<Bairro> {
        const bairroAtual = await this.bairroRepositorio.findOne({ 
            where: { id }, 
            relations: ['cidade', 'cidade.estado']
        });

        if (!bairroAtual) {
            throw new NaoEncontradoErro('Bairro não encontrado para a edição!');
        }

        let cidadeFinal = bairroAtual.cidade;

        // 1. Se uma nova cidade foi enviada, resolvemos ela primeiro
        if (dados.cidade) {
            cidadeFinal = await BuscarOuCriar<Cidade>({
                repositorio: this.cidadeRepositorio,
                dados: dados.cidade as Cidade,
                criterio: { 
                    nome: dados.cidade.nome, 
                    estado: { 
                        nome: dados.cidade.estado?.nome ?? bairroAtual.cidade?.estado?.nome 
                    } 
                },
            }) as Cidade;
        }

        // 2. Agora verificamos duplicidade com o nome (novo ou antigo) + cidade (nova ou antiga)
        if (dados.nome || dados.cidade) {
            await VerificarDuplicidade<Bairro>({
                repositorio: this.bairroRepositorio,
                dados: { 
                    nome: dados.nome ?? bairroAtual.nome, 
                    cidade: cidadeFinal 
                },
                idParaIgnorar: id,
            });
        }

        // 3. Aplica as mudanças
        this.bairroRepositorio.merge(bairroAtual, {
            ...dados,
            cidade: cidadeFinal
        });

        return await this.bairroRepositorio.save(bairroAtual);
    };

    // Service para excluir bairro:
    static async deletarBairro(id: number): Promise<Bairro> {
        const bairroDeletado = await this.bairroRepositorio.findOneBy({ id });

        if(!bairroDeletado) {
            throw new NaoEncontradoErro('Bairro não encontrado para a exclusão!')
        };

        await this.bairroRepositorio.remove(bairroDeletado);
        return bairroDeletado;
    };

};

export default BairroService;