import 'reflect-metadata';
import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import qrcode from 'qrcode-terminal';
import { Client, LocalAuth } from 'whatsapp-web.js';

import { AppDataSource } from "./data-source";

// Services e Controllers do Bot
import { WhatsAppController } from './bot/WhatsAppController';
import { RegistroService } from "./service/whatsapp/RegistroService";
import { EscalaService } from "./service/whatsapp/EscalaService";

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
import rotasRota from './routes/RotasRota';

// Middleware de erro
import MiddlewareErro from './middlewares/MiddlewareErro';

const app = express();

// --- 1. Middlewares de Configuração ---
app.use(cors());
app.use(express.json());

// Serve as imagens da pasta public/imagem_uso para que o App as acesse via URL
// Ex: http://localhost:8080/imagens/logo_2024.png
// Caminho absoluto garantindo a entrada na pasta public dentro de src
app.use('/imagens', express.static(path.join(__dirname, 'public', 'imagem_uso')));
// Para acesso via mobile
app.use('/fontes', express.static(path.join(__dirname, 'public', 'imagem_fonte')));


// Variável para armazenar a instância do controlador do Bot
export let botInstance: WhatsAppController;

// --- 2. Configuração do Cliente WhatsApp ---
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

// --- 3. Inicialização do Banco e App ---
AppDataSource.initialize().then(() => {
    console.log("🚀 Banco Conectado com Sucesso!");

    // Rota Raiz para Teste
    app.get('/', (req: Request, res: Response) => {
        res.status(200).json({ message: 'API Rodando - Bem-vindo, Juliano' });
    });

    // Inicialização do Controlador do WhatsApp
    const registroService = new RegistroService();
    const escalaService = new EscalaService();
    botInstance = new WhatsAppController(client, registroService, escalaService);
    botInstance.inicializar();

    // --- 4. Registro das Rotas ---
    app.use(rotasMotorista);
    app.use(rotasAdministrador);
    app.use(rotasPassageiro);
    app.use(rotasEmpresa);
    app.use(rotasEndereco);
    app.use(rotasBairro);
    app.use(rotasCidade);
    app.use(rotasEstado);
    app.use(rotasPais);
    app.use(rotasRota);
    app.use(rotasWhatsapp);

    // Middleware de erro deve ser o último após as rotas
    app.use(MiddlewareErro);

    // --- 5. Inicialização do Servidor ---
    const PORTA = 8080;
    app.listen(PORTA, '0.0.0.0', () => {
        console.log(`🌐 Servidor rodando na porta ${PORTA}`);
    });

    // Inicialização assíncrona do WhatsApp
    setTimeout(() => {
        console.log("🤖 Tentando inicializar o WhatsApp...");
        client.initialize().catch(e => {
            console.error("❌ Falha ao iniciar WhatsApp (API segue ativa):", e.message);
        });
    }, 2000);

}).catch(error => {
    console.error("❌ Erro fatal ao conectar no Banco de Dados:", error);
});