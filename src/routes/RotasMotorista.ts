import { Router } from "express";
import MotoristaController from "../controllers/MotoristaController";
import ManipulacaoAssincrona from "../utils/adapters/ManipulacaoAssincrona";

const rotasMotorista = Router();

// Rota para listar todos os motoristas:
rotasMotorista.get('/motoristas', ManipulacaoAssincrona
    (MotoristaController.listarMotoristas)
);

// Rota para mostrar um motorista (por ID):
rotasMotorista.get('/motorista/:id', ManipulacaoAssincrona
    (MotoristaController.mostrarUmMotorista)
);

// Rota para cadastrar motorista:
rotasMotorista.post('/motorista', ManipulacaoAssincrona
    (MotoristaController.cadastrarMotorista)
);

// Rota para editar um motorista:
rotasMotorista.put('/motorista/:id', ManipulacaoAssincrona
    (MotoristaController.editarMotorista)
);

// Rota para alterar o status de ativo ou desativado de motorista:
rotasMotorista.patch('/motoristas/:id/status', ManipulacaoAssincrona
    (MotoristaController.alterarStatus)
);

// Rota para excluir motorista:
rotasMotorista.delete('/motorista/:id', ManipulacaoAssincrona
    (MotoristaController.deletarMotorista)
);

export default rotasMotorista;