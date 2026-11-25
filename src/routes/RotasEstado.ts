import { Router } from "express";
import EstadoController from "../controllers/EstadoController";
import { autenticar } from "../middlewares/Autenticacao";
import { autorizar } from "../middlewares/Autorizar.middleware";
import { PermissoesDoSistema } from "../utils/dicionario-rbac/DicionarioRbac";

const rotasEstado = Router();

// Rota para listar estados:
rotasEstado.get('/estados', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    EstadoController.listarEstados
);

// Rota para mostrar um estado (por ID):
rotasEstado.get('/estado/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    EstadoController.mostrarUmEstado
);

// Rota para cadastrar estado:
rotasEstado.post('/estado', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_CRIAR),
    EstadoController.cadastrarEstado
);

// Rota para editar estado:
rotasEstado.put('/estado/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_EDITAR),
    EstadoController.editarEstado
);

// Rota para excluir estado:
rotasEstado.delete('/estado/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_DELETAR),
    EstadoController.deletarEstado
);

export default rotasEstado;