import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

// 1. Instancia o cliente
const client = new Client({
    authStrategy: new LocalAuth(), // Mantém a sessão logada
    puppeteer: {
        args: ['--no-sandbox'] // Necessário em alguns ambientes Linux/Servidores
    }
});

// 2. Gera o QR Code no terminal
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

// 3. Aviso de conexão
client.on('ready', () => {
    console.log('✅ Bot do WhatsApp está pronto!');
});

// Aqui entram os seus listeners:
client.on('message', async (msg) => {
    // ... seu código de 👍🏻 e !desistir aqui
});

// 4. Inicializa o serviço
client.initialize();