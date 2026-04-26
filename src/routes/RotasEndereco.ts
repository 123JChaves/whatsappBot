import { Router } from "express";
import EnderecoController from "../controllers/EnderecoController";

const rotasEndereco = Router();

// Rotas para listar todos os enderecos:
rotasEndereco.get('/enderecos', 
    (EnderecoController.listarEnderecos)
);

// Rotas para listar um endereco (por ID):
rotasEndereco.get('/endereco/:id', 
    (EnderecoController.mostrarUmEndereco)
);

// Rotas para cadastrar enderecos:
rotasEndereco.post('/endereco', 
    (EnderecoController.cadastrarEndereco)
);

// Rotas para editar um endereco:
rotasEndereco.put('/endereco/:id', 
    (EnderecoController.editarEndereco)
);

// Rotas para deletar um endereco:
rotasEndereco.delete('/endereco/:id', 
    (EnderecoController.deletarEndereco)
);

export default rotasEndereco;