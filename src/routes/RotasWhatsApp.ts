import { Router, Request, Response } from "express";
import { botInstance } from "../index"; 
import MotoristaService from "../service/MotoristaService";

const rotasWhatsapp = Router();

/**
 * Middleware para garantir que o bot está inicializado antes de qualquer comando
 */
const verificarBot = (req: Request, res: Response, next: any) => {
    if (!botInstance) {
        return res.status(503).json({ error: "O serviço de WhatsApp está offline ou inicializando." });
    }
    next();
};

/**
 * 1. STATUS DO CADASTRO (Ligar/Desligar @cadastrar)
 */
rotasWhatsapp.post('/whatsapp/status-cadastro', verificarBot, async (req: Request, res: Response) => {
    const { aberto } = req.body;
    try {
        botInstance.setCadastroStatus(aberto);
        
        const titulo = "SISTEMA DE CADASTRO";
        const aviso = aberto 
            ? "🔓 *CADASTRO LIBERADO!* \nMotoristas novos podem enviar: `@cadastrar Seu Nome`" 
            : "🔒 *CADASTRO FECHADO!* \nNovos registros estão suspensos.";
        
        await botInstance.enviarMensagemExterna(titulo, aviso);
        
        return res.status(200).json({ message: "Status alterado e grupo avisado!" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao comunicar com o WhatsApp." });
    }
});

/**
 * 2. GERAR ESCALA (Disparo Manual)
 */
rotasWhatsapp.post('/whatsapp/gerar-escala', verificarBot, async (req: Request, res: Response) => {
    try {
        const relatorio = await botInstance.dispararEscalaManual();
        // Feedback extra de auditoria
        await botInstance.enviarMensagemExterna("🤖 BOT INFO", "✅ Escala gerada e enviada via *Painel Mobile*.");
        
        return res.status(200).json({ message: "Escala disparada!", relatorio });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * 3. LIMPAR FILA (Zerar Joinhas do dia)
 */
rotasWhatsapp.post('/whatsapp/limpar-fila', verificarBot, async (req: Request, res: Response) => {
    try {
        await botInstance.resetarFilaDoDia();
        return res.status(200).json({ message: "Fila zerada com sucesso!" });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * 4. ENVIAR LISTA DE MOTORISTAS (Equivalente ao @motoristas)
 */
rotasWhatsapp.post('/whatsapp/enviar-lista-motoristas', verificarBot, async (req: Request, res: Response) => {
    try {
        const motoristas = await MotoristaService.listarMotoristas();
        let listaTexto = motoristas.length === 0 ? "Nenhum motorista cadastrado." : "";
        
        motoristas.forEach((m, i) => {
            listaTexto += `${i + 1}. ${m.nome} [${m.ativo ? "✅" : "🚫"}]\n`;
        });

        await botInstance.enviarMensagemExterna("👥 LISTA DE MOTORISTAS", listaTexto);
        return res.status(200).json({ message: "Lista enviada para o grupo!" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao gerar lista." });
    }
});

/**
 * 5. CONFIGURAR DIA (Feriados / Dias Livres)
 */
rotasWhatsapp.post('/whatsapp/configurar-dia', verificarBot, async (req: Request, res: Response) => {
    const { data, tipo } = req.body; // data: 'DD/MM/AAAA', tipo: 'DIA_LIVRE' | 'DIA_COMUM'
    if (!data || !tipo) return res.status(400).json({ error: "Data e tipo são obrigatórios." });

    try {
        await botInstance.escalaService.definirTipoDiaManual(data, tipo);
        await botInstance.enviarMensagemExterna("📅 CONFIGURAÇÃO", `O dia *${data}* foi configurado como *${tipo}* via App.`);
        return res.status(200).json({ message: "Calendário atualizado!" });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

/**
 * 6. COMUNICADO LIVRE
 */
rotasWhatsapp.post('/whatsapp/comunicado', verificarBot, async (req: Request, res: Response) => {
    const { mensagem } = req.body;
    if (!mensagem) return res.status(400).json({ error: "Mensagem vazia." });

    try {
        await botInstance.enviarMensagemExterna("📢 AVISO VIA APP", mensagem);
        return res.status(200).json({ message: "Mensagem enviada!" });
    } catch (error) {
        return res.status(500).json({ error: "Erro ao enviar." });
    }
});

export default rotasWhatsapp;