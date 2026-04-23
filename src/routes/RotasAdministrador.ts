import { Router } from "express";
import ManipulacaoAssincrona from "../utils/adapters/ManipulacaoAssincrona";
import AdministradorController from "../controllers/AdministradorController";

const rotasAdministrador = Router();

// Rota para listar todos os administradores:
rotasAdministrador.get('/administradores', ManipulacaoAssincrona
    (AdministradorController.listarAdministradores)
);

// Rota para mostrar um administrador (por ID):
rotasAdministrador.get('/administrador/:id', ManipulacaoAssincrona
    (AdministradorController.mostrarUmAdministrador)
);

// Rota para cadastrar administrador:
rotasAdministrador.post('/administrador', ManipulacaoAssincrona
    (AdministradorController.cadastrarAdministrador)
);

// Rota para editar um administrador:
rotasAdministrador.put('/administrador/:id', ManipulacaoAssincrona
    (AdministradorController.editarAdministrador)
);

// Rota para excluir um administrador:
rotasAdministrador.delete('/administrador/:id', ManipulacaoAssincrona
    (AdministradorController.deletarAdministrador)
);

export default rotasAdministrador;