import { IUsuario } from "../interfaces/IUsuario"; // Importe a sua interface de usuário

/**
 * Verifica se um usuário possui uma permissão específica dentro de seus papéis (RBAC).
 * @param usuario Objeto do usuário autenticado vindo do banco ou da requisição.
 * @param permissaoRequerida Nome da permissão que deseja validar.
 * @returns boolean true se tiver a permissão, false caso contrário.
 */
export function verificarPermissaoUsuario(
    usuario: Omit<IUsuario, 'senha'> | undefined, 
    permissaoRequerida: string
): boolean {
    if (!usuario || !usuario.papeis) {
        return false;
    }

    // Bloco isolado da checagem
    return usuario.papeis.some(papel => 
        papel.permissoes?.some(permissao => permissao.nome === permissaoRequerida)
    );
}
