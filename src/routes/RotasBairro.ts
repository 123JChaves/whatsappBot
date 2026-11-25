import { Router } from "express";
import BairroController from "../controllers/BairroController";
import { autenticar } from "../middlewares/Autenticacao";
import { autorizar } from "../middlewares/Autorizar.middleware";
import { PermissoesDoSistema } from "../utils/dicionario-rbac/DicionarioRbac";

const rotasBairro = Router();

// Rota para listar todos os bairros:
rotasBairro.get('/bairros', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    BairroController.listarBairros
);

// Rota para mostrar um bairro (por ID):
rotasBairro.get('/bairro/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    BairroController.mostrarUmBairro
);

// Rota para cadastrar bairro:
rotasBairro.post('/bairro', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_CRIAR),
    BairroController.cadastrarBairro
);

// Rota para editar um bairro:
rotasBairro.put('/bairro/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_EDITAR),
    BairroController.editarBairro
);

// Rota para excluir bairro:
rotasBairro.delete('/delete/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_DELETAR),
    BairroController.deletarBairro
);

export default rotasBairro;