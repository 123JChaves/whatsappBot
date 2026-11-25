import { Request, Response, NextFunction } from 'express';
import { verificarPermissaoUsuario } from './VerificarPermissaoUsuario';

export function autorizar(permissaoRequerida: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        const usuario = req.usuario;
        const temPermissao = verificarPermissaoUsuario(usuario, permissaoRequerida);

        if (!temPermissao) {
            return res.status(403).json({ 
                erro: 'Acesso negado. Você não possui permissão para esta ação ou não está autenticado.' 
            });
        }

        return next();
    };
}