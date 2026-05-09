import cors from 'cors';
import 'reflect-metadata';
import express, { Request, Response } from 'express';
import qrcode from 'qrcode-terminal';
import { Client, LocalAuth } from 'whatsapp-web.js';
import { AppDataSource } from "./data-source";
import { EscalaService } from "./service/whatsapp/EscalaService";
import { WhatsAppController } from './bot/WhatsAppController';
import { RegistroService } from "./service/whatsapp/RegistroService";

// Importação das Rotas
import rotasMotorista from "./routes/RotasMotorista";
import rotasAdministrador from "./routes/RotasAdministrador";
import rotasPassageiro from './routes/RotasPassageiro';
import rotasEmpresa from './routes/RotasEmpresa';
import rotasEndereco from './routes/RotasEndereco';
import rotasBairro from './routes/RotasBairro';
import rotasCidade from './routes/RotasCidade';
import rotasEstado from './routes/RotasEstado';
import rotasPais from './routes/RotasPais';
import rotasWhatsapp from './routes/RotasWhatsApp';

// Middleware de erro
import MiddlewareErro from './middlewares/MiddlewareErro';

const app = express();
app.use(express.json());
app.use(cors());

// Variável para armazenar a instância do controlador (usada nas rotas)
export let botInstance: WhatsAppController;

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ]
    }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ WhatsApp conectado!'));

AppDataSource.initialize().then(() => {
    console.log("🚀 Banco Conectado");

    // Rota de teste
    app.get('/', (req: Request, res: Response) => {
        res.status(200).json({ message: 'Bem-vindo, Juliano' });
    });

    // 1. Instanciar o Bot primeiro para que ele esteja disponível para as rotas
    const registroService = new RegistroService();
    const escalaService = new EscalaService();
    botInstance = new WhatsAppController(client, registroService, escalaService);
    botInstance.inicializar();

    // 2. Middlewares e Rotas (Incluindo a rota de controle do Bot)
    app.use(rotasMotorista);
    app.use(rotasAdministrador);
    app.use(rotasPassageiro);
    app.use(rotasEmpresa);
    app.use(rotasEndereco);
    app.use(rotasBairro);
    app.use(rotasCidade);
    app.use(rotasEstado);
    app.use(rotasPais);
    app.use(rotasWhatsapp);
    
    app.use(MiddlewareErro);

    const PORTA = 8080;
    app.listen(PORTA, '0.0.0.0', () => {
        console.log(`🌐 API rodando em todas as interfaces na porta ${PORTA}`);
    });

    // Inicialização do WhatsApp assíncrona
    setTimeout(() => {
        console.log("🤖 Tentando inicializar o WhatsApp...");
        client.initialize().catch(e => {
            console.error("❌ Erro no WhatsApp (API continua rodando):", e.message);
        });
    }, 2000);

}).catch(error => console.log("❌ Erro fatal no Banco de Dados:", error));