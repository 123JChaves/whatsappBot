import 'reflect-metadata'; // Importante para o TypeORM
import express from 'express';
import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { AppDataSource } from "./data-source";
import { EscalaService } from "./service/whatsapp/EscalaService";
import { WhatsAppController } from './bot/WhatsAppController';
import { RegistroService } from "./service/whatsapp/RegistroService";
import rotasMotorista from "./routes/RotasMotorista";
import rotasAdministrador from "./routes/RotasAdministrador";
import middlewareErro from './middlewares/MiddlewareErro';
import rotasPassageiro from './routes/RotasPassageiro';

const app = express();
app.use(express.json());

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ WhatsApp conectado!'));

// Inicialização do Banco, API e Bot
AppDataSource.initialize().then(() => {
    console.log("🚀 Banco Conectado");

    app.use(rotasMotorista);
    app.use(rotasAdministrador);
    app.use(rotasPassageiro);
    app.use(middlewareErro);

    const PORTA = 8080;

    app.listen(PORTA, () => {
        console.log(`🌐 API rodando em http://localhost:${PORTA}`);
    });

    // 2. Configuração do Bot
    const registroService = new RegistroService();
    const escalaService = new EscalaService();
    const bot = new WhatsAppController(client, registroService, escalaService);
    
    bot.inicializar();
    client.initialize();

}).catch(error => console.log("❌ Erro fatal:", error));