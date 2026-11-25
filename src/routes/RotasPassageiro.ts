import { Router } from "express";
import PassageiroController from "../controllers/PassageiroController";
import { autenticar } from "../middlewares/Autenticacao";
import { autorizar } from "../middlewares/Autorizar.middleware";
import { PermissoesDoSistema } from "../utils/dicionario-rbac/DicionarioRbac";

const rotasPassageiro = Router();

// Rota para listar todos os passageiros:
rotasPassageiro.get('/passageiros',
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    PassageiroController.listarPassageiros
);

// Rota para mostrar um passageiro (por ID):
rotasPassageiro.get('/passageiro/:id',
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    PassageiroController.mostrarUmPassageiro
);

// Rota para captar um passageiro disponível
rotasPassageiro.get("/passageiros/disponiveis/:empresaId", 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    PassageiroController.listarDisponiveis
);

// Rota para cadastrar passageiros:
rotasPassageiro.post('/passageiro', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_CRIAR),
    PassageiroController.cadastrarPassageiro
);

// Rota para editar passageiro:
rotasPassageiro.put('/passageiro/:id',
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_EDITAR),
    PassageiroController.editarPassageiro
);

// Rota para excluir passageiro:
rotasPassageiro.delete('/passageiro/:id',
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_DELETAR),
    PassageiroController.deletarPassageiro
);

export default rotasPassageiro;