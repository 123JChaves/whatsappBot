import { AppDataSource } from "../../data-source";
import { Passageiro } from "../../models/Passageiro";
import NaoEncontradoErro from "../../error/NaoEncontrado.404";
import IPassageiro from "../../interfaces/IPassageiro";
import validarCamposObrigatorios from "../../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../../utils/helpers/VerificarDuplicidade";

class PassageiroService {
    private static passageiroRepositorio = AppDataSource.getRepository(Passageiro);

    // Service para listar todos os passageiros:
    static async listarPassageiros(): Promise<Passageiro[]> {
        const passageiros = await this.passageiroRepositorio.find({
            select: {
                id: true,
                nome: true,
                telefoneWhatsApp: true,
                ativo: true,
                empresa: {
                    id: true,
                    nome: true,
                    logo: true
                },
                dataDeRegistro: true,
                dataDeEdicao: true
            },
            relations: [
                'empresa',
                'endereco'
            ],
        });

        return passageiros;
    };

    // Service para retornar um passageiro (por ID):
    static async mostrarUmPassageiro(id: number): Promise<Passageiro> {
        const passageiro = await this.passageiroRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                telefoneWhatsApp: true,
                ativo: true,
                empresa: {
                    id: true,
                    nome: true,
                    logo: true
                },
                dataDeRegistro: true,
                dataDeEdicao: true
            },
            relations: [
                'empresa',
                'endereco'
            ],
        });

        if(!passageiro) {
            throw new NaoEncontradoErro('Passageiro não identificado no sistema!');
        };

        return passageiro;
    };

    // Service para achar passageiro por telefone:
    static async buscarPorTelefone(telefoneWhatsApp: string): Promise<Passageiro | null> {
        return await this.passageiroRepositorio.findOne({
            where: { telefoneWhatsApp }
        });
    };

    // Service para cadastrar passageiros: 
    static async cadastrarPassageiro(dados: IPassageiro): Promise<Passageiro> {
        validarCamposObrigatorios<Passageiro>(dados as Passageiro, 
            ['nome', 'endereco', 'empresa']
        );

        await VerificarDuplicidade<Passageiro>({
            repositorio: this.passageiroRepositorio,
            dados: { telefoneWhatsApp: dados.telefoneWhatsApp }
        });

        const novoPassageiro = await this.passageiroRepositorio.save(
            this.passageiroRepositorio.create(dados)
        );

        return novoPassageiro;
    };

    //Service para editar passageiros:
    static async editarPassageiro(id: number, dados: Partial<IPassageiro>): Promise<Passageiro> {
        const passageiro = await this.passageiroRepositorio.findOne({ where: { id } });

        if(!passageiro) {
            throw new NaoEncontradoErro('Passageiro não encontrado para edição no sistema!')
        };

        if(dados.telefoneWhatsApp) {
            await VerificarDuplicidade<IPassageiro>({
                repositorio: this.passageiroRepositorio,
                dados:{
                    telefoneWhatsApp: dados.telefoneWhatsApp ?? passageiro.telefoneWhatsApp
                },
                idParaIgnorar: id
            });
        };

        this.passageiroRepositorio.merge(passageiro, dados as Passageiro);
        const passageiroAtualizado = await this.passageiroRepositorio.save(passageiro)

        return passageiroAtualizado as Passageiro;
    };

    // Service para alterar o status do passageiro: 
    static async alterarStatusAtivo(telefoneWhatsApp: string, status: boolean): Promise<void> {
        const passageiro = await this.passageiroRepositorio.findOneBy({ telefoneWhatsApp });
        if (!passageiro) {
            throw new NaoEncontradoErro('Passageiro não encontrado com este telefone!');
        };
        passageiro.ativo = status;
        await this.passageiroRepositorio.save(passageiro);
    };

    // Service para excluir o passageiro:
    static async deletarPassageiro(id: number): Promise<void> {
        const passageiro = await this.passageiroRepositorio.findOneBy({ id  });

        if(!passageiro) {
            throw new NaoEncontradoErro('Passageiro não encontrado para a exclusão!')
        };

        await this.passageiroRepositorio.remove(passageiro);
    };

};

export default PassageiroService;