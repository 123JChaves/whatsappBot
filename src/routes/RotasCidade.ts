import { Router } from "express";
import CidadeController from "../controllers/CidadeController";

const rotasCidade = Router();

// Rota para listar cidades:
rotasCidade.get('/cidades', 
    (CidadeController.listarCidades)
);

// Rota para mostrar uma cidade (por ID):
rotasCidade.get('/cidade/:id', 
    (CidadeController.mostrarUmaCidade)
);

// Rota para cadastrar cidade:
rotasCidade.post('/cidade', 
    (CidadeController.cadastarCidade)
);

// Rota para editar cidade:
rotasCidade.put('/cidade/:id', 
    (CidadeController.editarCidade)
);

// Rota para excluir cidade:
rotasCidade.delete('/cidade', 
    (CidadeController.deletarCidade)
);

export default rotasCidade;