import { Router } from "express";
import UsuarioController from "../controllers/UsuarioController";
import { autenticar } from "../middlewares/Autenticacao";
import { autorizar } from "../middlewares/Autorizar.middleware";
import { PermissoesDoSistema } from "../utils/dicionario-rbac/DicionarioRbac";

const rotasUsuario = Router();

// Rota para listar todos os usuários (Geral)
rotasUsuario.get('/usuarios',    
    UsuarioController.listar
);

// Rota para exibir um usuário (por ID)
rotasUsuario.get('/usuario/:id',    
    UsuarioController.mostrarUm
);

// Rota para buscar um usuário por WhatsApp LID (@lid)
rotasUsuario.get('/usuario/whatsapp/:whatsappLid', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR), 
    UsuarioController.buscarPorLid
);

// 1. Apenas ADMINISTRADORES conseguem listar outros Administradores
rotasUsuario.get('/usuarios/papeis/admin',

    UsuarioController.listarUsuariosPorPapel
);

// 2. Ambos (ADMIN e USER) conseguem listar os usuários comuns
rotasUsuario.get('/usuarios/papeis/user',

    UsuarioController.listarUsuariosPorPapel
);

// Rota para cadastrar um usuário (Apenas Admin)
rotasUsuario.post('/usuario',      
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_CRIAR_USUARIO),
    UsuarioController.cadastrar
);

// Rota para editar um usuário
rotasUsuario.put('/usuario/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_EDITAR),
    UsuarioController.editar
);

// Rota para deletar um usuário
rotasUsuario.delete('/usuario/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_DELETAR),
    UsuarioController.deletar
);

export default rotasUsuario;
