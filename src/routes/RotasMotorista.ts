import { Router } from "express";
import MotoristaController from "../controllers/MotoristaController";

const rotasMotorista = Router();

// Rota para listar todos os motoristas:
rotasMotorista.get('/motoristas', 
    (MotoristaController.listarMotoristas)
);

// Rota para mostrar um motorista (por ID):
rotasMotorista.get('/motorista/:id', 
    (MotoristaController.mostrarUmMotorista)
);

// Rota para cadastrar motorista:
rotasMotorista.post('/motorista', 
    (MotoristaController.cadastrarMotorista)
);

// Rota para editar um motorista:
rotasMotorista.put('/motorista/:id', 
    (MotoristaController.editarMotorista)
);

// Rota para alterar o status de ativo ou desativado de motorista:
rotasMotorista.patch('/motoristas/:id/status', 
    (MotoristaController.alterarStatus)
);

// Rota para excluir motorista:
rotasMotorista.delete('/motorista/:id', 
    (MotoristaController.deletarMotorista)
);

export default rotasMotorista;