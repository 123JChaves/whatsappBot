import { Router } from "express";
import MotoristaController from "../controllers/MotoristaController";
import AdminAutenticacaoMiddleware from "../middlewares/AdminAutenticacao";

const rotasMotorista = Router();

// Rota para listar todos os motoristas:
rotasMotorista.get('/motoristas',
    AdminAutenticacaoMiddleware, 
    (MotoristaController.listarMotoristas)
);

// Rota para mostrar um motorista (por ID):
rotasMotorista.get('/motorista/:id', 
    (MotoristaController.mostrarUmMotorista)
);

// Rota para cadastrar motorista:
rotasMotorista.post('/motorista',
    AdminAutenticacaoMiddleware, 
    (MotoristaController.cadastrarMotorista)
);

// Rota para editar um motorista:
rotasMotorista.put('/motorista/:id',
    AdminAutenticacaoMiddleware, 
    (MotoristaController.editarMotorista)
);

// Rota para alterar o status de ativo ou desativado de motorista:
rotasMotorista.patch('/motoristas/:id/status',
    AdminAutenticacaoMiddleware, 
    (MotoristaController.alterarStatus)
);

// Rota para excluir motorista:
rotasMotorista.delete('/motorista/:id',
    AdminAutenticacaoMiddleware, 
    (MotoristaController.deletarMotorista)
);

export default rotasMotorista;