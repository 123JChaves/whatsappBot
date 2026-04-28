import { AppDataSource } from "../../../data-source";
import { Cidade } from "../../../models/Cidade";
import { Estado } from "../../../models/Estado";
import ICidade from "../../../interfaces/ICidade";
import NaoEncontradoErro from "../../../error/NaoEncontrado.404";
import VerificarDuplicidade from "../../../utils/helpers/VerificarDuplicidade";
import validarCamposObrigatorios from "../../../utils/helpers/VerificarCamposObrigatorios";
import BuscarOuCriar from "../../../utils/helpers/BuscarOuCriar";

class CidadeService {

    private static cidadeRepositorio = AppDataSource.getRepository(Cidade);
    private static estadoRepositorio = AppDataSource.getRepository(Estado);

    // Service para listar todas as cidades:
    static async listarCidades(): Promise<Cidade[]> {
        const cidades = await this.cidadeRepositorio.find({
            select: {
                id: true,
                nome: true,
                estado: {
                    nome: true
                },
            }, relations: [
                'estado'
            ],
        });

        return cidades;
    };

    // Service para mostrar uma cidade (por ID):
    static async mostrarUmaCidade(id: number): Promise<Cidade> {
        const cidade = await this.cidadeRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                estado: {
                    nome: true
                },
            }, relations: [
                'estado'
            ],
        });

        if(!cidade) {
            throw new NaoEncontradoErro('Cidade não encontrada no sistema!');
        };

        return cidade;
    };

    // Service para cadastrar cidade:
    static async cadastrarCidade(dados: ICidade): Promise<Cidade> {
        validarCamposObrigatorios<Cidade>(dados as Cidade, 
            ['nome']
        );

        await VerificarDuplicidade<Cidade>({
            repositorio: this.cidadeRepositorio,
            dados: {
                nome: dados.nome,
                estado: {nome: dados.estado?.nome} as Estado,
            },
        });

        const estadoFinal = await BuscarOuCriar<Estado>({
            repositorio: this.estadoRepositorio,
            dados: dados.estado as Estado,
            criterio: {
                nome: dados.estado?.nome,
                pais: {nome: dados.estado?.pais?.nome}
            },
        });

        let novaCidade = this.cidadeRepositorio.create({
            ...dados,
            estado: estadoFinal as Estado,
        });

        return await this.cidadeRepositorio.save(novaCidade)
    };

    // Service para editar cidade:
    static async editarCidade(id: number, dados: Partial<ICidade>): Promise<Cidade> {
        const cidadeEditada = await this.cidadeRepositorio.findOne({
            where: { id },
            relations: [ 'estado' ],
        });

        if(!cidadeEditada) {
            throw new NaoEncontradoErro('Cidade não encontrada para a edição!');
        };

        if(dados.nome || dados.estado) {
            await VerificarDuplicidade<Cidade>({
                repositorio: this.cidadeRepositorio,
                dados: {
                    nome: dados.nome ?? cidadeEditada.nome,
                    estado: dados.estado as Estado ?? cidadeEditada.estado
                },
                idParaIgnorar: id,
            });
        };

        let estadoFinal = cidadeEditada.estado;

        if(dados.estado) {
            await BuscarOuCriar<Estado>({
                repositorio: this.estadoRepositorio,
                dados: dados.estado as Estado,
                criterio: {
                    nome: dados.estado?.nome,
                    pais: { nome: dados.estado?.pais?.nome ?? cidadeEditada.estado?.pais?.nome },
                },
            }) as Estado;
        };

        this.cidadeRepositorio.merge(cidadeEditada, dados, {estado: estadoFinal});
        return await this.cidadeRepositorio.save(cidadeEditada);
    };

    // Service para excluir cidade:
    static async deletarCidade(id: number): Promise<Cidade>{
        const cidadeDeletada = await this.cidadeRepositorio.findOneBy({ id });
        
        if(!cidadeDeletada) {
            throw new NaoEncontradoErro('Cidade não encontrada no sistema para a exclusão!');
        };

        await this.cidadeRepositorio.remove(cidadeDeletada);

        return cidadeDeletada;
    }
};

export default CidadeService;