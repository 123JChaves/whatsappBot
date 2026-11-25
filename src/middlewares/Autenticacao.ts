import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { AppDataSource } from '../data-source';
import { Usuario } from '../models/Usuario';

export async function autenticar(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ erro: 'Token de autenticação não fornecido.' });
    }

    const [, token] = authHeader.split(' ');

    try {
        const senhaSecreta = process.env.JWT_SECRET;
        if (!senhaSecreta) throw new Error('JWT_SECRET não definido.');

        const decoded = jwt.verify(token, senhaSecreta) as { id: number };

        // Busca o usuário com papéis e permissões atualizados
        const repositorio = AppDataSource.getRepository(Usuario);
        const usuario = await repositorio.findOne({
            where: { id: decoded.id },
            relations: ['papeis', 'papeis.permissoes']
        });

        if (!usuario) {
            return res.status(401).json({ erro: 'Usuário do token não encontrado.' });
        }

        const { senha, ...usuarioSemSenha } = usuario;
        req.usuario = usuarioSemSenha;

        return next();
    } catch (err) {
        return res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
}