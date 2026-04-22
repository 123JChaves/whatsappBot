import { Router } from "express";
import ManipulacaoAssincrona from "../utils/adapters/manipulacaoAssincrona";
import AdministradorController from "../controllers/AdministradorController";

const rotasAdministrador = Router();

// Rota para listar todos os administradores:
rotasAdministrador.get('/administradores', ManipulacaoAssincrona
    (AdministradorController.listarAdministradores)
);

rotasAdministrador.get('/administrador/:id', ManipulacaoAssincrona
    (AdministradorController.mostrarUmAdministrador)
);

rotasAdministrador.post('/administradores', ManipulacaoAssincrona
    (AdministradorController.cadastrarAdministrador)
);

rotasAdministrador.put('/administradores/:id', ManipulacaoAssincrona
    (AdministradorController.editarAdministrador)
);

rotasAdministrador.delete('/administrador/:id', ManipulacaoAssincrona
    (AdministradorController.deletarAdministrador)
);

export default rotasAdministrador;