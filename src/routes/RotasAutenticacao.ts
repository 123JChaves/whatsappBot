import { Router } from 'express';
import AutenticacaoController from '../controllers/AutenticacaoController';

const rotasAutenticacao = Router();
rotasAutenticacao.post('/login', AutenticacaoController.logar);

export default rotasAutenticacao;
