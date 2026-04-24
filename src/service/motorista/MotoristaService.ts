import { AppDataSource } from "../../data-source";
import { Motorista } from "../../models/Motorista";
import NaoEncontradoErro from "../../error/NaoEncontrado.404";
import IMotorista from "../../interfaces/IMotorista";
import validarCamposObrigatorios from "../../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../../utils/helpers/VerificarDuplicidade";

class MotoristaService {
    private static motoristaRepositorio = AppDataSource.getRepository(Motorista);

    // Service para listar todos os motoristas:
    static async listarMotoristas(): Promise<Motorista[]> {
        const motoristas = await this.motoristaRepositorio.find({
            select: {
                id: true,
                nome: true,
                telefoneWhatsApp: true,
                ativo: true
            },
        });
        return motoristas;
    };

    // Service para listar um motorista (por ID)
    static async mostrarUmMotorista(id: number): Promise<Motorista> {
        const motorista = await this.motoristaRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                telefoneWhatsApp: true,
                ativo: true
            },
        });

        if(!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado!');
        };

        return motorista;
    };
    
    // Service para buscar o motorista pelo número do telefone:
    static async buscarPorTelefone(telefoneWhatsApp: string): Promise<Motorista | null> {
        return await this.motoristaRepositorio.findOne({
            where: { telefoneWhatsApp }
        });
    };
    
    // Service para cadastrar motoristas: 
    static async cadastrarMotorista(dados: IMotorista): Promise<Motorista> {
        validarCamposObrigatorios<Motorista>(dados as Motorista, 
            [ 'nome', 'telefoneWhatsApp' ]
        );

        await VerificarDuplicidade<Motorista>({
            repositorio: this.motoristaRepositorio,
            dados: { telefoneWhatsApp: dados.telefoneWhatsApp }
        });

        const novoMotorista = await this.motoristaRepositorio.save(
            this.motoristaRepositorio.create(dados)
        );

        return novoMotorista as Motorista;
    };

    // Service para editar o motorista (por ID):
    static async editarMotorista(id: number, dados: Partial<IMotorista>): Promise<Motorista> {
        const motorista = await this.motoristaRepositorio.findOne({ where: {id} });

        if(!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado!')
        };

        if(dados.telefoneWhatsApp) {
            await VerificarDuplicidade<IMotorista>({
                repositorio: this.motoristaRepositorio,
                dados:{
                    telefoneWhatsApp: dados.telefoneWhatsApp ?? motorista.telefoneWhatsApp
                },
                idParaIgnorar: id
            });
        }
        this.motoristaRepositorio.merge(motorista, dados as Motorista);
        const motoristaAtualizado = await this.motoristaRepositorio.save(motorista);

        return motoristaAtualizado as Motorista;
    };

    // Service para alterar o status do motorista:
    static async alterarStatusAtivo(telefoneWhatsApp: string, status: boolean): Promise<void> {
        const motorista = await this.motoristaRepositorio.findOneBy({ telefoneWhatsApp });
        if (!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado com este telefone!');
        }
        motorista.ativo = status;
        await this.motoristaRepositorio.save(motorista);
    };
    
    // Service para excluir o mototorista:
    static async deletarMotorista(id: number): Promise<void> {
        const motorista = await this.motoristaRepositorio.findOneBy({ id });

        if(!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado para a exclusão!');
        };

        await this.motoristaRepositorio.remove(motorista);
    };
};

export default MotoristaService;