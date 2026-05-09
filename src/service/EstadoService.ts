import { AppDataSource } from "../data-source";
import { Estado } from "../models/Estado";
import { Pais } from "../models/Pais";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import IEstado from "../interfaces/IEstado";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import BuscarOuCriar from "../utils/helpers/BuscarOuCriar";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";

class EstadoService {

    private static estadoRepositorio = AppDataSource.getRepository(Estado);
    private static paisRepositorio = AppDataSource.getRepository(Pais);

    // Service para listar estados:
    static async listarEstados(): Promise<Estado[]> {
        const estados = await this.estadoRepositorio.find({
            select: {
                id: true,
                nome: true,
                pais: {
                    id: true,
                    nome: true
                },
            }, relations: [
                'pais'
            ],
        });

        return estados;
    };

    // Service para mostrar um estado (por ID):
    static async mostrarUmEstado(id: number): Promise<Estado>{
        const estado = await this.estadoRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                pais: {
                    id: true,
                    nome: true
                },
            }, relations: [
                'pais'
            ],
        });

        if(!estado) {
            throw new NaoEncontradoErro('Estado não encontrado no sistema!')
        };

        return estado;
    };

    // Service para cadastrar um estado:
    static async cadastrarEstado(dados: IEstado): Promise<Estado>{
        validarCamposObrigatorios<Estado>(dados as Estado, 
            ['nome']
        );
        
        const paisFinal = await BuscarOuCriar<Pais>({
            repositorio: this.paisRepositorio,
            dados: dados.pais as Pais,
            criterio: {
                nome: dados.pais?.nome,
            },
        });
        
        await VerificarDuplicidade<Estado>({
            repositorio: this.estadoRepositorio,
            dados: {
                nome: dados.nome,
                pais: paisFinal as Pais
            },
        });

        const novoEstado = this.estadoRepositorio.create({
            ...dados,
            pais: paisFinal,
        });

        return await this.estadoRepositorio.save(novoEstado);
    };

    // Service para editar estado:
    static async editarEstado(id: number, dados: Partial<IEstado>): Promise<Estado> {
        const estadoAtual = await this.estadoRepositorio.findOne({ 
            where: { id }, 
            relations: ['pais'] 
        });

        if (!estadoAtual) {
            throw new NaoEncontradoErro('Estado não encontrado para a edição!');
        }

        let paisFinal = estadoAtual.pais;

        if (dados.pais) {
            paisFinal = await BuscarOuCriar<Pais>({
                repositorio: this.paisRepositorio,
                dados: dados.pais as Pais,
                criterio: { nome: dados.pais.nome },
            }) as Pais;
        };

        if (dados.nome || dados.pais) {
            await VerificarDuplicidade<Estado>({
                repositorio: this.estadoRepositorio,
                dados: { 
                    nome: dados.nome ?? estadoAtual.nome, 
                    pais: paisFinal as Pais 
                },
                idParaIgnorar: id,
            });
        };

        this.estadoRepositorio.merge(estadoAtual, {
            ...dados,
            pais: paisFinal as Pais
        });

        return await this.estadoRepositorio.save(estadoAtual);
    };

    // Service para deletar Estado:
    static async deletarEstado(id: number): Promise<Estado>{
        const estadoDeletado = await this.estadoRepositorio.findOneBy({ id });

        if(!estadoDeletado) {
            throw new NaoEncontradoErro('Estado não encontrado para a exclusão do sistema!');
        };

        await this.estadoRepositorio.remove(estadoDeletado);

        return estadoDeletado;
    };
};

export default EstadoService;