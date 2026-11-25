import { Router } from "express";
import PaisController from "../controllers/PaisController";
import { autenticar } from "../middlewares/Autenticacao";
import { autorizar } from "../middlewares/Autorizar.middleware";
import { PermissoesDoSistema } from "../utils/dicionario-rbac/DicionarioRbac";

const rotasPais = Router();

// Rota para listar países:
rotasPais.get('/paises', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    PaisController.listarPaises
);

// Rota para mostrar um país(por ID)
rotasPais.get('/pais/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    PaisController.mostrarUmPais
);

// Rota para cadastrar país:
rotasPais.post('/pais', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_CRIAR),
    PaisController.cadastarPais
);

// Rota para editar país:
rotasPais.put('/pais/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_EDITAR),
    PaisController.editarPais
);

// Rota para excluír país:
rotasPais.delete('/pais/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_DELETAR),
    PaisController.deletarPais
);

export default rotasPais;