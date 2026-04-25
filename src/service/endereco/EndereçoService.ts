import { AppDataSource } from "../../data-source";
import { Endereco } from "../../models/Endereco";
import { Bairro } from "../../models/Bairro";
import IEndereco from "../../interfaces/IEndereco";
import NaoEncontradoErro from "../../error/NaoEncontrado.404";
import validarCamposObrigatorios from "../../utils/helpers/VerificarCamposObrigatorios";
import BuscarOuCriar from "../../utils/helpers/BuscarOuCriar";
import VerificarDuplicidade from "../../utils/helpers/VerificarDuplicidade";

class EnderecoService {
    private static enderecoRepositorio = AppDataSource.getRepository(Endereco);
    private static bairroRepositorio = AppDataSource.getRepository(Bairro);

    // Service para listar enderecos:
    static async listarEnderecos(): Promise<Endereco[]> {
        const enderecos = await this.enderecoRepositorio.find({
            select: {
                id: true,
                nome: true,
                numero: true,
                bairro: true
            },
            relations: [
                'bairro'
            ],
        });
        return enderecos;
    };

    // Service para mostrar um endereco (por ID):
    static async mostrarUmEndereco(id: number): Promise<Endereco> {
        const endereco = await this.enderecoRepositorio.findOne({
            where: {id},
            select: {
                id: true,
                nome: true,
                numero: true,
                bairro: true
            },
            relations: [
                'bairro'
            ],
        });

        if(!endereco) {
            throw new NaoEncontradoErro('Endereco não encontrado no sistema');
        };

        return endereco;
    };

    // Service para cadastrar endereco:
    static async cadastrarEndereco(dados: IEndereco): Promise<Endereco> {
        validarCamposObrigatorios<Endereco>(dados as Endereco, 
            ['nome', 'numero', 'bairro']
        );

        await VerificarDuplicidade<Endereco>({
            repositorio: this.enderecoRepositorio,
            dados: {
                nome: dados.nome,
                numero: dados.numero,
                bairro: { nome: dados.bairro.nome } as Bairro,
            },
        });

        const bairroFinal = await BuscarOuCriar<Bairro>({
            repositorio: this.bairroRepositorio,
            dados: dados.bairro,
            criterio: { 
                nome: dados.bairro.nome,
                // Se houver cidade aninhada, você pode buscar por ela também:
                cidade: { nome: dados.bairro.cidade?.nome } 
            },
        });

        const novoEndereco = await this.enderecoRepositorio.create({
            ...dados,
            bairro: bairroFinal as Bairro
        });
        
        return await this.enderecoRepositorio.save(novoEndereco);
    };

    // Service para editar endereco:
    static async editarEndereco(id: number, dados: Partial<IEndereco>): Promise<Endereco> {
        const enderecoEditado = await this.enderecoRepositorio.findOne({ 
            where: { id },
            relations: ['bairro']
        });

        if(!enderecoEditado) {
            throw new NaoEncontradoErro('Endereço não encontrado para a edição!')
        };

        if(dados.nome || dados.numero || dados.bairro) {
            await VerificarDuplicidade<Endereco>({
                repositorio: this.enderecoRepositorio,
                dados: {
                    nome: dados.nome ?? enderecoEditado.nome,
                    numero: dados.numero ?? enderecoEditado.numero,
                    bairro: dados.bairro ?? enderecoEditado.bairro
                },
                idParaIgnorar: id,
            });
        };

        let bairroFinal = enderecoEditado.bairro;

        if(dados.bairro) {
            bairroFinal = await BuscarOuCriar<Bairro>({
                repositorio: this.bairroRepositorio,
                dados: dados.bairro,
                criterio: {
                    nome: dados.bairro.nome,
                    cidade: { nome: dados.bairro.cidade?.nome ?? enderecoEditado.bairro!.cidade?.nome}
                },
            }) as Bairro;
        };

        this.enderecoRepositorio.merge(enderecoEditado, { ...dados, bairro: bairroFinal });
        return await this.enderecoRepositorio.save(enderecoEditado);
    };

    // Service para excluir endereço:
    static async deletarEndereco(id: number): Promise<Endereco> {
        const endereco = await this.enderecoRepositorio.findOneBy({ id });
        
        if (!endereco) {
            throw new NaoEncontradoErro('Endereço não encontrado para exclusão');
        }

        await this.enderecoRepositorio.remove(endereco);
        return endereco;
    };

};

export default EnderecoService;