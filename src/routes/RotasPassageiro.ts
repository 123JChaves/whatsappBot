import { Router } from "express";
import PassageiroController from "../controllers/PassageiroController";

const rotasPassageiro = Router();

// Rota pasa listar todos os passageiros:
rotasPassageiro.get('/motoristas',
    (PassageiroController.listarPassageiros)
);

// Rota para mostrar um passageiro (por ID):
rotasPassageiro.get('/motorista/:id',
    (PassageiroController.mostrarUmPassageiro)
);

// Rota para cadastrar passageiros:
rotasPassageiro.post('/motorista', 
    (PassageiroController.cadastrarPassageiro)
);

// Rota para editar passageiro:
rotasPassageiro.put('/motorista/:id',
    (PassageiroController.editarPassageiro)
);

// Rota para editar passageiro:
rotasPassageiro.delete('/motorista/:id',
    (PassageiroController.deletarPassageiro)
);

export default rotasPassageiro;