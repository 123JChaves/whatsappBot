import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { AppDataSource } from "./data-source";
import { EscalaService } from "./service/whatsapp/EscalaService";
import { WhatsAppController } from './bot/WhatsAppController';
import { RegistroService } from "./service/whatsapp/RegistroService";

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
    console.log('✅ WhatsApp conectado e pronto!');
});

// Inicialização do Banco e do Bot
AppDataSource.initialize().then(() => {
    console.log("🚀 Banco Conectado");

    // Instanciamos os Services primeiro
    const registroService = new RegistroService();
    const escalaService = new EscalaService();

    // Passamos ambos para o Controller (Injeção de Dependência)
    const bot = new WhatsAppController(
        client,
        registroService,
        escalaService
    );

    bot.inicializar();
    client.initialize();

}).catch(error => console.log("❌ Erro ao conectar banco:", error));