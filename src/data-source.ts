import { DataSource } from "typeorm";
import { Administrador } from "./models/Administrador";
import { Usuario } from "./models/Usuario";
import { Motorista } from "./models/Motorista";
import { Passageiro } from "./models/Passageiro";
import { Empresa } from "./models/Empresa";
import { Rota } from "./models/Rota";
import { ListaRota } from "./models/ListaRota";
import { OrdemJoinha } from "./models/OrdemJoinha";
import { RotasAtribuidas } from "./models/RotasAtribuidas";
import { Endereco } from "./models/Endereco";
import { Bairro } from "./models/Bairro";
import { Cidade } from "./models/Cidade";
import { Estado } from "./models/Estado";
import { Pais } from "./models/Pais";
import { ListaJoia } from "./models/ListaJoia";

export const AppDataSource = new DataSource({
    type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    password: '123456',
    database: 'whatsapp_bot',
    synchronize: true,
    logging: true,
    entities: [Administrador, Usuario,  Motorista, Passageiro, Endereco, Bairro, Cidade, Estado, Pais,
               Empresa, Rota, ListaJoia, ListaRota, OrdemJoinha, RotasAtribuidas],

    subscribers: [],
    migrations: [__dirname+"/migrations/*.ts"],

});
