import { Router } from "express";
import CidadeController from "../controllers/CidadeController";
import { autenticar } from "../middlewares/Autenticacao";
import { autorizar } from "../middlewares/Autorizar.middleware";
import { PermissoesDoSistema } from "../utils/dicionario-rbac/DicionarioRbac";

const rotasCidade = Router();

// Rota para listar cidades:
rotasCidade.get('/cidades', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    CidadeController.listarCidades
);

// Rota para mostrar uma cidade (por ID):
rotasCidade.get('/cidade/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    CidadeController.mostrarUmaCidade
);

// Rota para cadastrar cidade:
rotasCidade.post('/cidade', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_CRIAR),
    CidadeController.cadastarCidade
);

// Rota para editar cidade:
rotasCidade.put('/cidade/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_EDITAR),
    CidadeController.editarCidade
);

// Rota para excluir cidade:
rotasCidade.delete('/cidade', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_DELETAR),
    CidadeController.deletarCidade
);

export default rotasCidade;