import { Papeis } from "../models/Papeis";

export interface IUsuario {
    id: number;
    nome: string;
    cpf: string;
    email: string;
    senha?: string;
    telefoneWhatsApp?: string;
    whatsappLid?: string;
    dataDeRegistro: Date;
    dataDeEdicao: Date;
    papeis?: Papeis[];
}
export default IUsuario;