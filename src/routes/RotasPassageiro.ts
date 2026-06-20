import { Router } from "express";
import PassageiroController from "../controllers/PassageiroController";
import AdminAutenticacaoMiddleware from "../middlewares/AdminAutenticacao";

const rotasPassageiro = Router();

// Rota pasa listar todos os passageiros:
rotasPassageiro.get('/passageiros',
    AdminAutenticacaoMiddleware,
    (PassageiroController.listarPassageiros)
);

// Rota para mostrar um passageiro (por ID):
rotasPassageiro.get('/passageiro/:id',
    AdminAutenticacaoMiddleware,
    (PassageiroController.mostrarUmPassageiro)
);

// Rota para captar um passageiro disponível
rotasPassageiro.get("/passageiros/disponiveis/:empresaId", 
    (PassageiroController.listarDisponiveis)
);
// Rota para cadastrar passageiros:
rotasPassageiro.post('/passageiro',
    AdminAutenticacaoMiddleware, 
    (PassageiroController.cadastrarPassageiro)
);

// Rota para editar passageiro:
rotasPassageiro.put('/passageiro/:id',
    AdminAutenticacaoMiddleware,
    (PassageiroController.editarPassageiro)
);

// Rota para editar passageiro:
rotasPassageiro.delete('/passageiro/:id',
    AdminAutenticacaoMiddleware,
    (PassageiroController.deletarPassageiro)
);

export default rotasPassageiro;