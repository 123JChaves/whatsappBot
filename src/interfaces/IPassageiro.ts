import { Empresa } from "../models/Empresa";
import { Endereco } from "../models/Endereco";

interface IPassageiro {
    nome: string;
    telefoneWhatsApp: string;
    endereco: Endereco;
    empresa: Empresa;
}

export default IPassageiro;