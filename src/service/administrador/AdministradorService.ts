import { AppDataSource } from "../../data-source";
import { Administrador } from "../../models/Administrador";
import NaoEncontradoErro from "../../error/NaoEncontrado.404";
import IAdministrador from "../../interfaces/IAdministrador";
import validarCamposObrigatorios from "../../utils/helpers/VerificarCamposObrigatorios";
import RequisicaoInvalidaErro from "../../error/RequisicaoInvalida.400";
import CpfValido from "../../utils/validators/ValidacaoDeCpf";
import VerificarDuplicidade from "../../utils/helpers/VerificarDuplicidade";

class AdministradorService {
    private static administradorRepositorio = AppDataSource.getRepository(Administrador);

    // Service para listar todos os administradores:
    static async listarAdministradores(): Promise<Administrador[]> {
        const administradores = await this.administradorRepositorio.find({
            select: {
                id: true,
                nome: true,
                cpf: true,
                email: true,
                telefoneWhatsapp: true,
                dataDeRegistro: true,
                dataDeEdicao: true
            }
        });
        return administradores;
    };

    // Service para mostrar apenas um administrador (por ID):
    static async mostrarUmAdministrador(id: number): Promise<Administrador> {
        const administrador = await this.administradorRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                cpf: true,
                email: true,
                telefoneWhatsapp: true,
                dataDeRegistro: true,
                dataDeEdicao: true
            }
        });

        if (!administrador) {
            throw new NaoEncontradoErro('Administrador não encontrado');
        };

        return administrador;
    };

    // Service para cadastrar um administrador:
    static async cadastrarAdministrador(dados: IAdministrador): Promise<Administrador> {
        validarCamposObrigatorios<Administrador>(dados as Administrador, 
            ['nome', 'cpf', 'email', 'senha', 'telefoneWhatsapp']
        );

        if(!CpfValido(dados.cpf)) {
            throw new RequisicaoInvalidaErro('CPF inválido!')
        };

        await VerificarDuplicidade<Administrador>({
            repositorio: this.administradorRepositorio,
            dados: { cpf: dados.cpf, email: dados.email }
        });

        const novoAdministrador = await this.administradorRepositorio.save(
            this.administradorRepositorio.create(dados)
        );

        const {senha, ...resultado} = novoAdministrador;

        return resultado as Administrador;
    };

    // Service para editar um administrador:
    static async editarAdminisrtador(id: number, dados: Partial<IAdministrador>): Promise<Administrador> {
        const administrador = await this.administradorRepositorio.findOne({ where: { id } });

        if (!administrador) {
            throw new NaoEncontradoErro('Administrador não encontrado para edição!');
        }

        if (dados.cpf && !CpfValido(dados.cpf)) {
            throw new RequisicaoInvalidaErro('O novo CPF é inválido');
        }

        if (dados.cpf || dados.email) {
            await VerificarDuplicidade<Administrador>({
                repositorio: this.administradorRepositorio,
                dados: { 
                    cpf: dados.cpf ?? administrador.cpf, 
                    email: dados.email ?? administrador.email 
                },
                idParaIgnorar: id
            });
        };

        this.administradorRepositorio.merge(administrador, dados);
        const administradorAtualizado = await this.administradorRepositorio.save(administrador);

        const { senha, ...resultado } = administradorAtualizado;
        return resultado as Administrador;
    };

    // Service para deletar um administrador:
    static async deletarAdministrador(id: number): Promise<void> {
        const administrador = await this.administradorRepositorio.findOneBy({ id });

        if (!administrador) {
            throw new NaoEncontradoErro('Administrador não encontrado para a exclusão!');
        }

        await this.administradorRepositorio.remove(administrador);
    }
};

export default AdministradorService;