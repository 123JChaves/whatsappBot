import { AppDataSource } from "../../../data-source";
import NaoEncontradoErro from "../../../error/NaoEncontrado.404";
import IBairro from "../../../interfaces/IBairro";
import { Bairro } from "../../../models/Bairro";
import { Cidade } from "../../../models/Cidade";
import BuscarOuCriar from "../../../utils/helpers/BuscarOuCriar";
import validarCamposObrigatorios from "../../../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../../../utils/helpers/VerificarDuplicidade";

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
        validarCamposObrigatorios<IBairro>(dados, 
            ['nome']
        );

        await VerificarDuplicidade<Bairro>({
            repositorio: this.bairroRepositorio,
            dados: {
                nome: dados.nome,
                cidade: { nome: dados.cidade?.nome } as Cidade,
            },
        });

        const cidadeFinal = await BuscarOuCriar<Cidade>({
            repositorio: this.cidadeRepositorio,
            dados: dados.cidade as Cidade,
            criterio: { 
                nome: dados.cidade?.nome,
                // É possível buscar um estado aninhado também:
                estado: { nome: dados.cidade?.estado?.nome } 
            }
        });

        let novoBairro = this.bairroRepositorio.create({
            ...dados,
            cidade: cidadeFinal as Cidade
        });

        return await this.bairroRepositorio.save(novoBairro);
    };

    // Service para editar bairro:
    static async editarBairro(id: number, dados: Partial<IBairro>): Promise<Bairro> {
        const bairroEditado = await this.bairroRepositorio.findOne({
            where: { id },
            relations: [ 'cidade' ]
        });

        if(!bairroEditado) {
            throw new NaoEncontradoErro('Bairro não encontrado para a edição!')
        };

        if(dados.nome || dados.cidade) {
            await VerificarDuplicidade<Bairro>({
                repositorio: this.bairroRepositorio,
                dados: {
                    nome: dados.nome ?? bairroEditado.nome,
                    cidade: (dados.cidade ?? bairroEditado.cidade) as Cidade,
                },
                idParaIgnorar: id,
            });
        };

        let cidadeFinal = bairroEditado.cidade;
        
        if(dados.cidade) {
            cidadeFinal = await BuscarOuCriar<Cidade>({
                repositorio: this.cidadeRepositorio,
                dados: dados.cidade as Cidade,
                criterio: {
                    nome: dados.cidade?.nome,
                    // Alterado de 'cidade' para 'estado' para bater com a Model Cidade
                    estado: { 
                        nome: dados.cidade.estado?.nome ?? bairroEditado.cidade?.estado?.nome
                    }
                },
            }) as Cidade;
        };

        this.bairroRepositorio.merge(bairroEditado, dados, {cidade: cidadeFinal});
        return await this.bairroRepositorio.save(bairroEditado);
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