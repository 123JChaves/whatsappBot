import 'dotenv/config';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
    namespace Express {
        interface Request {
            userLogadoId?: number;
            userRole?: string;
        }
    }
}

const AdminAutenticacaoMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const { authorization } = req.headers;

    if (!authorization) {
        return res.status(401).json({ message: 'Ação não autorizada! Token ausente.' });
    }

    const partes = authorization.split(' ');
    
    // 🔍 CORREÇÃO 1: Valida se o índice 0 é exatamente a palavra 'Bearer'
    if (partes.length !== 2 || partes[0] !== 'Bearer') {
        return res.status(401).json({ message: 'Token mal formatado!' });
    }

    // 🔍 CORREÇÃO 2: Captura estritamente a string do token no índice 1 do array
    const token = partes[1];

    try {
        const secretKey = process.env.JWT_ADMIN_SECRET;
        
        if (!secretKey) {
            console.error('ERRO CRÍTICO: JWT_ADMIN_SECRET não está definido no .env');
            return res.status(500).json({ message: 'Erro interno de configuração do servidor.' });
        }

        const data = jwt.verify(token, secretKey);
        const { id } = data as { id: number };

        req.userLogadoId = id;
        req.userRole = 'administrador';

        return next();
    } catch (error) {
        // Retorna o erro real no console do backend para você diagnosticar se expirou ou a chave está errada
        console.error("Falha na validação do JWT:", error);
        return res.status(401).json({ message: "Token de administrador inválido ou expirado" });
    }
};

export default AdminAutenticacaoMiddleware;