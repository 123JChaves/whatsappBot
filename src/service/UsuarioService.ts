import { AppDataSource } from '../data-source';
import { Usuario } from '../models/Usuario';
import IUsuario from '../interfaces/IUsuario';
import validarCamposObrigatorios from '../utils/helpers/VerificarCamposObrigatorios';
import CpfValido from '../utils/validators/ValidacaoDeCpf';
import RequisicaoInvalidaErro from '../error/RequisicaoInvalida.400';
import TextoHelper from '../utils/helpers/TextoHelper';
import VerificarDuplicidade from '../utils/helpers/VerificarDuplicidade';
import NaoEncontradoErro from '../error/NaoEncontrado.404';
import { Papeis } from '../models/Papeis';

class ServicosUsuario {
    
    private static repositorioUsuario = AppDataSource.getRepository(Usuario);

    static async listarUsuarios(): Promise<Usuario[]> {
        return await this.repositorioUsuario.find({
            select: {
                id: true,
                nome: true,
                cpf: true,
                email: true,
                telefoneWhatsApp: true,
                whatsappLid: true,
                dataDeRegistro: true,
                dataDeEdicao: true
            },
        });
    }

    static async mostrarUmUsuario(id: number): Promise<Usuario> {
        const usuario = await this.repositorioUsuario.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                cpf: true,
                email: true,
                telefoneWhatsApp: true,
                whatsappLid: true,
                dataDeRegistro: true,
                dataDeEdicao: true
            },
        });
        if (!usuario) {
            throw new NaoEncontradoErro('Usuário não encontrado!');
        }
        return usuario;
    }

    static async listarPorPapel(nomeDoPapel: 'admin' | 'user'): Promise<Usuario[]> {
        return await this.repositorioUsuario.createQueryBuilder('usuario')
            .leftJoin('usuario.papeis', 'papel')
            .where('papel.nome = :nomeDoPapel', { nomeDoPapel })
            .getMany();
    }


    // Service para buscar usuário por @lid:
    static async buscarUsuarioPorLid(whatsappLid: string): Promise<IUsuario | null> {
        const jidLimpo = whatsappLid.replace(/:[0-9]+/, '');
        return await this.repositorioUsuario.findOne({ 
            where: { whatsappLid: jidLimpo } 
        });
    }

    static async cadastrarUsuario(dados: IUsuario): Promise<Usuario> {
        validarCamposObrigatorios<Usuario>(dados as Usuario, ['nome', 'cpf', 'email', 'senha']);
        if (!CpfValido(dados.cpf)) {
            throw new RequisicaoInvalidaErro('CPF Inválido!');
        }
        if (dados.nome) dados.nome = TextoHelper.sanitizarNome(dados.nome);
        if (dados.whatsappLid) dados.whatsappLid = TextoHelper.sanitizarNumero(dados.whatsappLid);
        if (dados.telefoneWhatsApp) dados.telefoneWhatsApp = TextoHelper.sanitizarNumero(dados.telefoneWhatsApp);
        await VerificarDuplicidade<IUsuario>({
            repositorio: this.repositorioUsuario,
            dados: {
                cpf: dados.cpf,
                email: dados.email,
                ...(dados.telefoneWhatsApp ? { telefoneWhatsApp: dados.telefoneWhatsApp } : {})
            }
        });
        const novoUsuario = this.repositorioUsuario.create(dados);
        if (dados.papeis && dados.papeis.length > 0) {
            const repositorioPapeis = AppDataSource.getRepository(Papeis);
            const papeisCarregados: Papeis[] = [];
            for (const papel of dados.papeis) {
                const papelEncontrado = await repositorioPapeis.findOne({
                    where: [
                        ...(papel.id ? [{ id: papel.id }] : []),
                        ...(papel.nome ? [{ nome: papel.nome }] : [])
                    ]
                });
                if (!papelEncontrado) {
                    throw new RequisicaoInvalidaErro(`O papel informado (${papel.nome || papel.id}) não existe no sistema.`);
                }
                papeisCarregados.push(papelEncontrado);
            }
            novoUsuario.papeis = papeisCarregados;
        } else {
            // Fallback de segurança: Caso não envie nada, você pode optar por lançar um erro ou definir 'user' como padrão
            throw new RequisicaoInvalidaErro('É obrigatório informar ao menos um papel (ex: admin ou user) para o usuário.');
        }
        const usuarioSalvo = await this.repositorioUsuario.save(novoUsuario);        
        const { senha, ...resultado } = usuarioSalvo;
        return resultado as Usuario;
    }

    static async editarUsuario(id: number, dados: Partial<IUsuario>): Promise<Usuario> {
        const usuarioEditado = await this.repositorioUsuario.findOne({ where: { id } });
        if (!usuarioEditado) {
            throw new NaoEncontradoErro('Usuário não encontrado para a edição');
        }
        if (dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }
        if (dados.cpf && !CpfValido(dados.cpf)) {
            throw new RequisicaoInvalidaErro('O novo CPF é inválido');
        }
        if (dados.cpf || dados.email || dados.telefoneWhatsApp) {
            await VerificarDuplicidade<IUsuario>({
                repositorio: this.repositorioUsuario,
                dados: {
                    cpf: dados.cpf ?? usuarioEditado.cpf,
                    email: dados.email ?? usuarioEditado.email,
                    telefoneWhatsApp: dados.telefoneWhatsApp ?? usuarioEditado.telefoneWhatsApp
                },
                idParaIgnorar: id,
            });
        }

        this.repositorioUsuario.merge(usuarioEditado, dados as Usuario);
        const usuarioAtualizado = await this.repositorioUsuario.save(usuarioEditado);
        const { senha, ...resultado } = usuarioAtualizado;
        return resultado as Usuario;
    }

    static async deletarUsuario(id: number): Promise<void> {        
        const usuarioDeletado = await this.repositorioUsuario.findOne({ where: { id } });
        if (!usuarioDeletado) {
            throw new NaoEncontradoErro('Usuário não encontrado para a exclusão!');
        }
        await this.repositorioUsuario.remove(usuarioDeletado);
    }
}

export default ServicosUsuario;