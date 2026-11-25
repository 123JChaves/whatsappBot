import "reflect-metadata";
import { DataSource } from "typeorm";
import { Administrador } from "./models/Administrador";
import { Usuario } from "./models/Usuario";
import { Motorista } from "./models/Motorista";
import { Passageiro } from "./models/Passageiro";
import { Empresa } from "./models/Empresa";
import { Rota } from "./models/Rota";
import { ListaRota } from "./models/ListaRota";
import { OrdemJoinha } from "./models/OrdemJoinha";
import { RotaAtribuida } from "./models/RotaAtribuida";
import { Endereco } from "./models/Endereco";
import { Bairro } from "./models/Bairro";
import { Cidade } from "./models/Cidade";
import { Estado } from "./models/Estado";
import { Pais } from "./models/Pais";
import { ListaJoia } from "./models/ListaJoia";
import { DiasTipo } from "./models/DiasTipo";
import { Banimento } from "./models/Banimento";
import { SolicitacaoCorrida } from "./models/SolicitaçãoCorrida";
import { Papeis } from "./models/Papeis";
import { Permissoes } from "./models/Permissoes";

export const AppDataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    synchronize: true,
    // Log de TODAS as consultas só quando DB_LOGGING=true (debug); no dia a dia, apenas erros e avisos
    logging: process.env.DB_LOGGING === 'true' ? true : ['error', 'warn'],
    timezone: '-03:00',
    extra: {
        dateStrings: [
            'DATE'
        ]
    },
    entities: [
        Administrador, Usuario, Motorista, Passageiro, Endereco, Bairro, Cidade, Estado, Pais,
        Empresa, Rota, ListaJoia, ListaRota, DiasTipo, Banimento, OrdemJoinha, RotaAtribuida,
        SolicitacaoCorrida, Papeis, Permissoes
    ],
    subscribers: [],
    // Adaptação para rodar migrações tanto localmente (.ts) quanto compilado (.js)
    migrations: [__dirname + "/migrations/*.{ts,js}"],
});