import { Router } from "express";
import AdministradorController from "../controllers/AdministradorController";
import AdminAutenticacaoMiddleware from "../middlewares/AdminAutenticacao";

const rotasAdministrador = Router();

// Rota pública de autenticação:
rotasAdministrador.post('/administrador/login', 
    AdministradorController.logarAdministrador
);

// Rota para listar todos os administradores
rotasAdministrador.get('/administradores',
    AdminAutenticacaoMiddleware, 
    (AdministradorController.listarAdministradores)
);

// Rota para exibir um administrador (por ID)
rotasAdministrador.get('/administrador/:id', 
    AdminAutenticacaoMiddleware, 
    (AdministradorController.mostrarUmAdministrador)
);

// Rota para cadastrar administrador
rotasAdministrador.post('/administrador', 
    AdminAutenticacaoMiddleware, 
    (AdministradorController.cadastrarAdministrador)
);

// Rota para editar um administrador
rotasAdministrador.put('/administrador/:id', 
    AdminAutenticacaoMiddleware, 
    (AdministradorController.editarAdministrador)
);

// Rota para deletar um administrador
rotasAdministrador.delete('/administrador/:id', 
    AdminAutenticacaoMiddleware, 
    (AdministradorController.deletarAdministrador)
);

export default rotasAdministrador;