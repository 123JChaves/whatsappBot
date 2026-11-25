import { Request, Response } from 'express';
import ServicosAutenticacao from '../service/AutenticacaoService';

class AutenticacaoController {
    
    static async logar(req: Request, res: Response): Promise<Response> {
        const dadosLogin = req.body;
        const resultado = await ServicosAutenticacao.logar(dadosLogin);        
        return res.status(200).json(resultado);
    }
}
export default AutenticacaoController;
