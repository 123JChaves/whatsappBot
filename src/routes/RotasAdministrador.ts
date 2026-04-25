import { Router } from "express";
import AdministradorController from "../controllers/AdministradorController";

const rotasAdministrador = Router();

// Rota para listar todos os administradores:
rotasAdministrador.get('/administradores', 
    (AdministradorController.listarAdministradores)
);

// Rota para mostrar um administrador (por ID):
rotasAdministrador.get('/administrador/:id', 
    (AdministradorController.mostrarUmAdministrador)
);

// Rota para cadastrar administrador:
rotasAdministrador.post('/administrador', 
    (AdministradorController.cadastrarAdministrador)
);

// Rota para editar um administrador:
rotasAdministrador.put('/administrador/:id', 
    (AdministradorController.editarAdministrador)
);

// Rota para excluir um administrador:
rotasAdministrador.delete('/administrador/:id', 
    (AdministradorController.deletarAdministrador)
);

export default rotasAdministrador;