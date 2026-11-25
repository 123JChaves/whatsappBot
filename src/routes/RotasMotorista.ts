import { Router } from "express";
import MotoristaController from "../controllers/MotoristaController";
import { autenticar } from "../middlewares/Autenticacao";
import { autorizar } from "../middlewares/Autorizar.middleware";
import { PermissoesDoSistema } from "../utils/dicionario-rbac/DicionarioRbac";


const rotasMotorista = Router();

// Rota para listar todos os motoristas:
rotasMotorista.get('/motoristas', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    MotoristaController.listarMotoristas
);

// Rota para mostrar um motorista (por ID):
rotasMotorista.get('/motorista/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    MotoristaController.mostrarUmMotorista
);

// Rota para cadastrar motorista:
rotasMotorista.post('/motorista', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_CRIAR),
    MotoristaController.cadastrarMotorista
);

// Rota para editar um motorista:
rotasMotorista.put('/motorista/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_EDITAR),
    MotoristaController.editarMotorista
);

// Rota para alterar o status de ativo ou desativado de motorista:
rotasMotorista.patch('/motoristas/:id/status', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_EDITAR),
    MotoristaController.alterarStatus
);

// Rota para excluir motorista:
rotasMotorista.delete('/motorista/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_DELETAR),
    MotoristaController.deletarMotorista
);

export default rotasMotorista;