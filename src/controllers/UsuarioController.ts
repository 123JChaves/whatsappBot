import { Request, Response } from 'express';
import ServicosUsuario from '../service/UsuarioService';

class UsuarioController {

    static async listar(req: Request, res: Response): Promise<Response> {
        const usuarios = await ServicosUsuario.listarUsuarios();
        return res.status(200).json(usuarios);
    }

    static async mostrarUm(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        const usuario = await ServicosUsuario.mostrarUmUsuario(Number(id));
        return res.status(200).json(usuario);
    }

    static async listarUsuariosPorPapel(req: Request, res: Response): Promise<Response> {
        const { papel } = req.params;
        
        if (papel !== 'admin' && papel !== 'user') {
            return res.status(400).json({ erro: 'Papel inválido. Use admin ou user.' });
        }

        const usuarios = await ServicosUsuario.listarPorPapel(papel);
        return res.status(200).json(usuarios);
    }


    static async buscarPorLid(req: Request, res: Response): Promise<Response> {
        const { whatsappLid } = req.params;
        if (!whatsappLid || typeof whatsappLid !== 'string') {
        return res.status(400).json({ erro: 'O parâmetro whatsappLid deve ser uma string válida.' });
        }
        const usuario = await ServicosUsuario.buscarUsuarioPorLid(whatsappLid);
        return res.status(200).json(usuario);
    }

    static async cadastrar(req: Request, res: Response): Promise<Response> {
        const dados = req.body;
        const novoUsuario = await ServicosUsuario.cadastrarUsuario(dados);
        return res.status(201).json({
            message: 'Usuário cadastrado com Sucesso!',
            novoUsuario
        });
    }

    static async editar(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        const dados = req.body;
        const usuarioEditado = await ServicosUsuario.editarUsuario(Number(id), dados);
        return res.status(200).json({
            message: 'Usuário atualizado com sucesso!',
            usuarioAtualizado: usuarioEditado
        });
    }

    static async deletar(req: Request, res: Response): Promise<Response> {
        const { id } = req.params;
        const usuarioDeletado = await ServicosUsuario.deletarUsuario(Number(id));
        return res.status(200).json({ 
            mensagem: 'Usuário excluído com sucesso!',
            usuarioExcluido: usuarioDeletado 
        });
    }
}

export default UsuarioController;