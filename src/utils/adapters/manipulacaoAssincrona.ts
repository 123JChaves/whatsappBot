import { NextFunction, Request, Response, RequestHandler } from 'express';

const ManipulacaoAssincrona = (funcao: RequestHandler): RequestHandler => 
(req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(funcao(req, res, next)).catch(next);
};

export default ManipulacaoAssincrona;