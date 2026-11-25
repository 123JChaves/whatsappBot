import { Router } from "express";
import RotaController from "../controllers/RotaController";
// CORREÇÃO: Importação nomeada mantida com as chaves {}, corrigindo apenas a palavra 'Autenticacao'
import { autenticar } from "../middlewares/Autenticacao"; 
import { autorizar } from "../middlewares/Autorizar.middleware";
import { PermissoesDoSistema } from "../utils/dicionario-rbac/DicionarioRbac";

const rotasRota = Router();

// Listar todas as rotas (útil para os menus de Tarde/Madrugada)
rotasRota.get('/rotas', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    RotaController.listarRotas
);

// Rota para listar rotas por turno: 
rotasRota.get('/rotas/turno/:tipo', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    RotaController.listarPorTurno
);

// Mostrar detalhes de uma rota
rotasRota.get('/rota/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    RotaController.mostrarUmaRota
);

// Cadastrar nova rota (Apenas administradores através da permissão de gerenciar rota)
rotasRota.post('/rota', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_GERENCIAR_ROTA),
    RotaController.cadastrarRota
);

// Editar dados ou ordem dos passageiros da rota
rotasRota.put('/rota/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_GERENCIAR_ROTA),
    RotaController.editarRota
);

// Excluir rota e liberar passageiros
rotasRota.delete('/rota/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_GERENCIAR_ROTA),
    RotaController.deletarRota
);

export default rotasRota;