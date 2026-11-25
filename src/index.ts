import 'dotenv/config'; 
import 'reflect-metadata'; 
import express from 'express'; 
import cors from 'cors'; 
import path from 'path'; 
import { AppDataSource } from "./data-source";  

// Services e Controllers do Bot 
import { WhatsAppController } from './bot/WhatsAppController'; 
import { RegistroService } from "./service/whatsapp/RegistroService"; 
import { EscalaService } from "./service/whatsapp/EscalaService";
import { rodarSeedRbac } from './service/RbacService'; 

// Importação das Rotas 
import rotasAutenticacao from './routes/RotasAutenticacao'; 
import rotasMotorista from "./routes/RotasMotorista"; 
import rotasAdministrador from "./routes/RotasAdministrador"; 
import rotasPassageiro from './routes/RotasPassageiro'; 
import rotasEmpresa from './routes/RotasEmpresa'; 
import rotasEndereco from './routes/RotasEndereco'; 
import rotasBairro from './routes/RotasBairro'; 
import rotasCidade from './routes/RotasCidade'; 
import rotasEstado from './routes/RotasEstado'; 
import rotasPais from './routes/RotasPais';
import rotasRota from './routes/RotasRota';
import rotasAtribuicao from './routes/RotasAtrbuicao'; 
import MiddlewareErro from './middlewares/MiddlewareErro'; 
import rotasWhatsApp from './routes/RotasWhatsApp';
import rotasUsuario from './routes/RotasUsuario';
import rotasSaude from './routes/RotasSaude';

// Infraestrutura: Redis (cache + Pub/Sub), logs estruturados, observabilidade e resiliência
import ObservabilidadeHttp from './middlewares/ObservabilidadeHttp';
import { conectarRedis, desconectarRedis } from './infra/redis/RedisClient';
import { eventBus } from './infra/eventos/EventBus';
import { registrarAssinantes } from './infra/eventos/Assinantes';
import { comRetry } from './infra/resiliencia/Resiliencia';
import { logger } from './infra/logger/Logger';

const app = express(); 
app.use(ObservabilidadeHttp); 
app.use(cors()); 
app.use(express.json()); 
// Health checks e métricas disponíveis desde o boot (antes do WhatsApp conectar)
app.use(rotasSaude); 
app.use('/imagens', express.static(path.join(__dirname, 'public', 'imagem_uso'))); 
app.use('/fontes', express.static(path.join(__dirname, 'public', 'imagem_fonte'))); 

export let botInstance: WhatsAppController; 

async function startApp() { 
    try { 
        // RESILIÊNCIA: o MySQL pode demorar a aceitar conexões no boot do container -> retry com backoff
        await comRetry(() => AppDataSource.initialize(), {
            operacao: "mysql.initialize", tentativas: 5, atrasoInicialMs: 1000,
        });
        logger.info("🚀 Banco Conectado!"); 

        // REDIS: cache distribuído + mensageria. Se falhar, a API segue em modo degradado.
        await conectarRedis();
        registrarAssinantes();
        await eventBus.iniciar();

        await rodarSeedRbac();

        const registroService = new RegistroService(); 
        const escalaService = new EscalaService(); 

        botInstance = new WhatsAppController(registroService, escalaService); 
        
        console.log("🤖 Iniciando WhatsApp..."); 

        await botInstance.inicializar(); 

        app.get('/', (req, res) => res.json({ message: 'API Online' }));
        app.use(rotasAutenticacao);
        app.use(rotasAdministrador);
        app.use(rotasUsuario); 
        app.use(rotasMotorista);  
        app.use(rotasPassageiro); 
        app.use(rotasEmpresa); 
        app.use(rotasEndereco); 
        app.use(rotasBairro); 
        app.use(rotasCidade); 
        app.use(rotasEstado); 
        app.use(rotasPais); 
        app.use(rotasRota); 
        app.use(rotasAtribuicao); 
        app.use(rotasWhatsApp); 
        app.use(MiddlewareErro); 

        // 5. Inicialização do Servidor Express na Rede Local
        const PORTA = 8085; 
        const servidor = app.listen(PORTA, '0.0.0.0', () => { 
            logger.info(`🌐 Servidor conectado na porta ${PORTA}: http://localhost:${PORTA}`); 
        }); 

        // Encerramento gracioso: fecha conexões antes do container ser finalizado (deploy/rollback)
        const encerrar = async (sinal: string) => {
            logger.warn({ sinal }, "Encerrando aplicação de forma graciosa...");
            servidor.close();
            await desconectarRedis();
            if (AppDataSource.isInitialized) await AppDataSource.destroy();
            process.exit(0);
        };
        process.on("SIGTERM", () => void encerrar("SIGTERM"));
        process.on("SIGINT", () => void encerrar("SIGINT"));

    } catch (error) { 
        logger.fatal({ erro: (error as Error)?.message, stack: (error as Error)?.stack }, "❌ Falha crítica na inicialização");
        process.exit(1); 
    } 
} 

startApp();