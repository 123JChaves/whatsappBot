// whatsappBot/src/data-source-test.ts
import { DataSource } from "typeorm";
import { MysqlConnectionOptions } from "typeorm/driver/mysql/MysqlConnectionOptions"; 
import { AppDataSource } from "./data-source";

export const TestDataSource = new DataSource({
    // 🔥 Força o TypeScript a reconhecer o objeto estritamente como opções de MySQL
    ...(AppDataSource.options as MysqlConnectionOptions), 
    host: process.env.DB_HOST || 'localhost',
    port: 3306,
    database: 'whatsapp_bot_test', // Conecta com segurança no banco de testes isolado
    synchronize: true,             // Monta e atualiza as tabelas do zero para o Jest
    logging: false
});
