import { NextFunction, Request, Response } from 'express';
import ApiErro from '../error/ApiErro';

const middlewareErro = (
    erro: Error & Partial<ApiErro>,
    req: Request,
    res: Response, 
    next: NextFunction
) => {
    console.error(`[Erro]: ${erro.message}`);

    const status = erro instanceof ApiErro ? 
        erro.statusDeCodigo : 500;
        
    const mensagem = erro instanceof ApiErro ? 
        erro.message : "Erro interno no servidor";

    return res.status(status).json(mensagem)
};

export default middlewareErro;