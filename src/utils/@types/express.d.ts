import IUsuario from "../interfaces/IUsuario";

declare global {
    namespace Express {
        interface Request {
            usuario?: Omit<IUsuario, 'senha'>;
        }
    }
}