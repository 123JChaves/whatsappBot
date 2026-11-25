import { Router } from 'express';
import EmpresaController from '../controllers/EmpresaController';
import { realizarUpload } from '../middlewares/MiddlewareMulter';
import { autenticar } from "../middlewares/Autenticacao";
import { autorizar } from "../middlewares/Autorizar.middleware";
import { PermissoesDoSistema } from "../utils/dicionario-rbac/DicionarioRbac";

const rotasEmpresa = Router();

// Rota para listar todas as empresas: (Geralmente não precisa de upload no GET, mantido conforme seu original)
rotasEmpresa.get('/empresas', 

    realizarUpload.single('logo'),
    EmpresaController.listarEmpresas
);

// Rota para mostrar uma empresa (por ID):
rotasEmpresa.get('/empresa/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    EmpresaController.mostrarUmaEmpresa
);

// Rota para mostrar uma empresa com todos os atributos:
rotasEmpresa.get('/empresa/completa/:id', 

    EmpresaController.mostrarEmpresaIndividualCompleta
);

// Rota para mostrar uma empresa com a logo, sem funcionários:
rotasEmpresa.get('/empresa/logo/:id', 

    EmpresaController.mostrarEmpresaComALogo
);

// Rota para mostrar a empresa com funcionários, sem a logo:
rotasEmpresa.get('/empresa/funcionarios/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_LISTAR),
    EmpresaController.mostrarEmpresaComFuncionarios
);

// Rota para cadastrar empresa:
rotasEmpresa.post('/empresa', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_CRIAR),
    realizarUpload.single('logo'),
    EmpresaController.cadastrarEmpresa
);

// Rota para editar empresa:
rotasEmpresa.put('/empresa/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_EDITAR),
    realizarUpload.single('logo'),
    EmpresaController.editarEmpresa
);

// Rota para excluir a empresa do sistema:
rotasEmpresa.delete('/empresa/:id', 
    autenticar,
    autorizar(PermissoesDoSistema.USUARIO_DELETAR),
    EmpresaController.deletarEmpresa
);

export default rotasEmpresa;