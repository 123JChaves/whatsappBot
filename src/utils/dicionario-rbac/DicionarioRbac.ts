import { RoleEnum } from "../../models/Papeis";

// 1. Todas as permissões cruas do sistema
export const PermissoesDoSistema = {
    USUARIO_CRIAR_USUARIO: 'USUARIO_CRIAR_USUARIO',
    USUARIO_CRIAR: 'USUARIO_CRIAR',
    USUARIO_LISTAR: 'USUARIO_LISTAR',
    USUARIO_LISTAR_ADMIN: 'USUARIO_LISTAR_ADMIN',
    USUARIO_EDITAR: 'USUARIO_EDITAR',
    USUARIO_DELETAR: 'USUARIO_DELETAR',
    USUARIO_GERENCIAR_ESCALA: 'USUARIO_GERENCIAR_ESCALA',
    USUARIO_GERENCIAR_ROTA: 'USUARIO_GERENCIAR_ROTA',
};

export const MapaDePermissoesPorPapel = {
    [RoleEnum.ADMIN]: [
        PermissoesDoSistema.USUARIO_CRIAR_USUARIO,
        PermissoesDoSistema.USUARIO_CRIAR,
        PermissoesDoSistema.USUARIO_LISTAR,
        PermissoesDoSistema.USUARIO_LISTAR_ADMIN,
        PermissoesDoSistema.USUARIO_EDITAR,
        PermissoesDoSistema.USUARIO_DELETAR,
        PermissoesDoSistema.USUARIO_GERENCIAR_ESCALA,
        PermissoesDoSistema.USUARIO_GERENCIAR_ROTA
    ],
    [RoleEnum.USER]: [
        PermissoesDoSistema.USUARIO_LISTAR,
        PermissoesDoSistema.USUARIO_CRIAR,
        PermissoesDoSistema.USUARIO_EDITAR,
    ]
};
