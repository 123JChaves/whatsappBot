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
        return res.status(401).json({ error: 'Ação não autorizada! Token ausente.' });
    }

    const partes = authorization.split(' ');
    
    if (partes.length !== 2 || partes[0] !== 'Bearer') {
        return res.status(401).json({ error: 'Token mal formatado!' });
    }

    const token = partes[1];

    try {
        const secretKey = process.env.JWT_ADMIN_SECRET;
        
        if (!secretKey) {
            console.error('ERRO CRÍTICO: JWT_ADMIN_SECRET não está definido no .env');
            return res.status(500).json({ error: 'Erro interno de configuração do servidor.' });
        }

        const data = jwt.verify(token, secretKey);
        const { id } = data as { id: number };

        req.userLogadoId = id;
        req.userRole = 'administrador';

        // Segue para o controller com segurança
        return next();
    } catch (error: any) {
        console.error("Falha na validação do JWT:", error?.message || error);
        
        // 🎯 CORREÇÃO: Força o Express a encerrar o fluxo respondendo um JSON estruturado
        // Alterado de 'message' para 'error' para bater com o catch do seu aplicativo frontend
        return res.status(401).json({ 
            error: "Token de administrador inválido ou expirado." 
        });
    }
};

export default AdminAutenticacaoMiddleware;