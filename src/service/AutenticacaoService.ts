import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { AppDataSource } from '../data-source';
import { Usuario } from '../models/Usuario';
import IUsuario from '../interfaces/IUsuario';
import validarCamposObrigatorios from '../utils/helpers/VerificarCamposObrigatorios';
import RequisicaoInvalidaErro from '../error/RequisicaoInvalida.400';


class ServicosAutenticacao {
    
    private static repositorioUsuario = AppDataSource.getRepository(Usuario);

    static async logar(dados: Partial<IUsuario>): Promise<{
        token: string;
        usuario: Omit<IUsuario, 'senha'> & { dataDeRegistro: Date; dataDeEdicao: Date }
    }> {
        // 1. Valida campos obrigatórios de login
        validarCamposObrigatorios<Partial<IUsuario>>(dados, ['email', 'senha']);
        
        // 2. Busca o usuário trazendo explicitamente a senha oculta e os relacionamentos do RBAC corrigidos (papeis e permissoes)
        const usuario = await this.repositorioUsuario.createQueryBuilder('usuario')
            .where('usuario.email = :email', { email: dados.email })
            .addSelect('usuario.senha')
            .leftJoinAndSelect('usuario.papeis', 'papeis')
            .leftJoinAndSelect('papeis.permissoes', 'permissoes')
            .getOne();

        if (!usuario) {
            throw new RequisicaoInvalidaErro('Email ou Senha inválidos!');
        }

        // 3. Compara os hashes das senhas
        const senhaValida = await bcrypt.compare(dados.senha!, usuario.senha);
        if (!senhaValida) {
            throw new RequisicaoInvalidaErro('Email ou Senha inválidos!');
        }

        // 4. Valida a chave secreta no ambiente
        const senhaSecreta = process.env.JWT_SECRET;
        if (!senhaSecreta) {
            console.error('ERRO CRÍTICO: JWT_SECRET não configurado no .env!');
            throw new Error('Erro interno no servidor de autenticação!');
        }

        const token = jwt.sign(
            {
                id: usuario.id,
                email: usuario.email
            },
            senhaSecreta,
            { expiresIn: '8h' }
        );

        return { 
            token, 
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                cpf: usuario.cpf,
                telefoneWhatsApp: usuario.telefoneWhatsApp,
                whatsappLid: usuario.whatsappLid,
                email: usuario.email,
                dataDeRegistro: usuario.dataDeRegistro,
                dataDeEdicao: usuario.dataDeEdicao
            }
        };
    }
}

export default ServicosAutenticacao;