import { Request, Response } from "express";
import MotoristaService from "../service/motorista/MotoristaService";

class MotoristaController {

    static async listarMotoristas(req: Request, res: Response) {
        const motoristas = await MotoristaService.listarMotoristas();
        return res.status(200).json(motoristas);
    };

    static async mostrarUmMotorista(req: Request, res: Response) {
        const {id} = req.params;
        const motorista = await MotoristaService.mostrarUmMotorista(Number(id));
        return res.status(200).json(motorista);
    };

    static async cadastrarMotorista(req: Request, res: Response) {
        const novoMotorista = await MotoristaService.cadastrarMotorista(req.body);
        return res.status(200).json({
            message: 'Motorista cadastrado com sucesso!',
            novoMotorista
        });
    };

    static async editarMotorista(req: Request, res: Response) {
        const {id} = req.params;
        const motoristaEditado = await MotoristaService.editarMotorista(Number(id), req.body);
        return res.status(200).json({
            message: 'Motorista atualizado com sucesso!',
            motoristaEditado
        });
    };

    static async alterarStatus(req: Request, res: Response) {
        const { id } = req.params;
        const { ativo } = req.body;
        const motorista = await MotoristaService.mostrarUmMotorista(Number(id));
        await MotoristaService.alterarStatusAtivo(motorista.telefoneWhatsapp, ativo);
        return res.status(200).json({
            message: `Motorista ${ativo ? 'ativado' : 'inativado'} com sucesso!` 
        });
    };

    static async deletarMotorista(req: Request, res: Response) {
        const {id} = req.params;
        await MotoristaService.deletarMotorista(Number(id));
        return res.status(200).json({
            message: 'Motorista excluído com sucesso!',
        });
    };
};

export default MotoristaController;