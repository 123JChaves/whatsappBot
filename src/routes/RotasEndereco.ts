import { Router } from "express";
import EnderecoController from "../controllers/EnderecoController";
import { autenticar } from "../middlewares/Autenticacao";
import { autorizar } from "../middlewares/Autorizar.middleware";
import { PermissoesDoSistema } from "../utils/dicionario-rbac/DicionarioRbac";

const rotasEndereco = Router();

// Rotas para listar todos os enderecos:
rotasEndereco.get('/enderecos', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    EnderecoController.listarEnderecos
);

// Rotas para listar um endereco (por ID):
rotasEndereco.get('/endereco/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    EnderecoController.mostrarUmEndereco
);

// Rotas para cadastrar enderecos:
rotasEndereco.post('/endereco', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_CRIAR),
    EnderecoController.cadastrarEndereco
);

// Rotas para editar um endereco:
rotasEndereco.put('/endereco/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_EDITAR),
    EnderecoController.editarEndereco
);

// Rotas para deletar um endereco:
rotasEndereco.delete('/endereco/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_DELETAR),
    EnderecoController.deletarEndereco
);

export default rotasEndereco;