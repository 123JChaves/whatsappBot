import { Empresa } from "../models/Empresa";
import { Endereco } from "../models/Endereco";

interface IPassageiro {
    id: number;
    nome: string;
    telefoneWhatsApp: string;
    whatsAppLid?: string;
    ativo: boolean;
    endereco: Endereco;
    empresa: Empresa;
}

export default IPassageiro;