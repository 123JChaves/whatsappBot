import { AppDataSource } from "../../data-source";
import { Motorista } from "../../models/Motorista";
import NaoEncontradoErro from "../../error/NaoEncontrado.404";
import IMotorista from "../../interfaces/IMotorista";
import validarCamposObrigatorios from "../../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../../utils/helpers/VerificarDuplicidade";

class MotoristaService {
    private static motoristaRepositorio = AppDataSource.getRepository(Motorista);

    static async listarMotoristas(): Promise<Motorista[]> {
        const motoristas = await this.motoristaRepositorio.find({
            select: {
                id: true,
                nome: true,
                telefoneWhatsapp: true,
                ativo: true
            },
        });
        return motoristas;
    };

    static async mostrarUmMotorista(id: number): Promise<Motorista> {
        const motorista = await this.motoristaRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                telefoneWhatsapp: true,
                ativo: true
            },
        });

        if(!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado!');
        };

        return motorista;
    };

    static async buscarPorTelefone(telefoneWhatsapp: string): Promise<Motorista | null> {
        return await this.motoristaRepositorio.findOne({
            where: { telefoneWhatsapp }
        });
    };
    
    static async cadastrarMotorista(dados: IMotorista): Promise<Motorista> {
        validarCamposObrigatorios<Motorista>(dados as Motorista, 
            [ 'nome', 'telefoneWhatsapp' ]
        );

        await VerificarDuplicidade<Motorista>({
            repositorio: this.motoristaRepositorio,
            dados: { telefoneWhatsapp: dados.telefoneWhatsapp }
        });

        const novoMotorista = await this.motoristaRepositorio.save(
            this.motoristaRepositorio.create(dados)
        );

        return novoMotorista as Motorista;
    };

    static async editarMotorista(id: number, dados: Partial<IMotorista>): Promise<Motorista> {
        const motorista = await this.motoristaRepositorio.findOne({ where: {id} });

        if(!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado!')
        };

        if(dados.telefoneWhatsapp) {
            await VerificarDuplicidade<IMotorista>({
                repositorio: this.motoristaRepositorio,
                dados:{
                    telefoneWhatsapp: dados.telefoneWhatsapp ?? motorista.telefoneWhatsapp
                },
                idParaIgnorar: id
            });
        }
        this.motoristaRepositorio.merge(motorista, dados as Motorista);
        const motoristaAtualizado = await this.motoristaRepositorio.save(motorista);

        return motoristaAtualizado as Motorista;
    };

    static async alterarStatusAtivo(telefoneWhatsapp: string, status: boolean): Promise<void> {
        const motorista = await this.motoristaRepositorio.findOneBy({ telefoneWhatsapp });
        if (!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado com este telefone!');
        }
        motorista.ativo = status;
        await this.motoristaRepositorio.save(motorista);
    };
    
    static async deletarMotorista(id: number): Promise<void> {
        const motorista = await this.motoristaRepositorio.findOneBy({ id });

        if(!motorista) {
            throw new NaoEncontradoErro('Motorista não encontrado para a exclusão!');
        };

        await this.motoristaRepositorio.remove(motorista);
    };
};

export default MotoristaService;