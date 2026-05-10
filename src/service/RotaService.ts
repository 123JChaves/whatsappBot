import { AppDataSource } from "../data-source";
import { Rota } from "../models/Rota";
import { Passageiro } from "../models/Passageiro";
import { Empresa } from "../models/Empresa";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";

class RotaService {
    private static rotaRepositorio = AppDataSource.getRepository(Rota);
    private static passageiroRepositorio = AppDataSource.getRepository(Passageiro);
    private static empresaRepositorio = AppDataSource.getRepository(Empresa);

    // Service para listar todas as rotas:
    static async listarRotas(): Promise<Rota[]> {
        return await this.rotaRepositorio.find({
            relations: ["passageiros", "passageiros.endereco", "passageiros.endereco.bairro", "empresas"],
            order: { 
                ordem: "ASC",
                passageiros: { ordem_na_rota: "ASC" }
            }
        });
    }

    // Service para listar rotas por TURNO (Tarde ou Madrugada):
    static async listarPorTurno(tipo: 'ROTA_TARDE' | 'ROTA_MADRUGADA'): Promise<Rota[]> {
        return await this.rotaRepositorio.find({
            where: { tipo_rota: tipo },
            relations: ["passageiros", "passageiros.endereco", "passageiros.endereco.bairro", "empresas"],
            order: { 
                ordem: "ASC",
                passageiros: { ordem_na_rota: "ASC" }
            }
        });
    }

    // Service para mostrar uma rota específica (por ID):
    static async mostrarUmaRota(id: number): Promise<Rota> {
        const rota = await this.rotaRepositorio.findOne({
            where: { id },
            relations: ["passageiros", "passageiros.endereco", "passageiros.endereco.bairro", "empresas"],
            order: { passageiros: { ordem_na_rota: "ASC" } }
        });
        if (!rota) throw new NaoEncontradoErro("Rota não encontrada no sistema!");
        return rota;
    }

    // Service para cadastrar rota:
    static async cadastrarRota(dados: any): Promise<Rota> {
        validarCamposObrigatorios<Rota>(dados, ['nome', 'ordem', 'tipo_rota', 'horario']);
        
        // Busca a empresa para a relação ManyToMany
        const empresa = await this.empresaRepositorio.findOneBy({ id: Number(dados.empresaId) });

        const novaRota = this.rotaRepositorio.create({
            nome: dados.nome,
            ordem: dados.ordem,
            tipo_rota: dados.tipo_rota,
            horario: dados.horario,
            empresas: empresa ? [empresa] : []
        });

        const rotaSalva = await this.rotaRepositorio.save(novaRota);

        if (dados.passageirosIds && dados.passageirosIds.length > 0) {
            await this.vincularPassageirosARota(rotaSalva, dados.passageirosIds);
        }

        return rotaSalva;
    }

    // Service para editar rota:
    static async editarRota(id: number, dados: any): Promise<Rota> {
        const rotaExistente = await this.rotaRepositorio.findOne({ 
            where: { id }, 
            relations: ["passageiros", "empresas"] 
        });

        if (!rotaExistente) throw new NaoEncontradoErro("Rota não encontrada para edição!");

        // 1. Atualiza Empresa (ManyToMany)
        if (dados.empresaId) {
            const novaEmpresa = await this.empresaRepositorio.findOneBy({ id: Number(dados.empresaId) });
            rotaExistente.empresas = novaEmpresa ? [novaEmpresa] : [];
        }

        // 2. Atualiza Passageiros e Ordem
        if (dados.passageirosIds) {
            // Limpa apenas o vínculo desta rota específica na tabela de passageiros
            await this.passageiroRepositorio.update(
                { rota: { id } }, 
                { rota: null as any, ordem_na_rota: null as any }
            );
            await this.vincularPassageirosARota(rotaExistente, dados.passageirosIds);
        }

        // 3. O SEGREDO: Removemos o array de passageiros da memória para o save() não dar conflito
        // de FK ou re-limpar o que o loop de update acima acabou de fazer.
        delete (rotaExistente as any).passageiros;

        const { passageirosIds, empresaId, ...dadosRestantes } = dados;
        this.rotaRepositorio.merge(rotaExistente, dadosRestantes);
        
        return await this.rotaRepositorio.save(rotaExistente);
    }

    // Service para excluir rota:
    static async deletarRota(id: number): Promise<void> {
        const rota = await this.rotaRepositorio.findOneBy({ id });
        if (!rota) throw new NaoEncontradoErro("Rota não encontrada para exclusão!");

        // Libera passageiros vinculados a esta rota antes de apagá-la
        await this.passageiroRepositorio.update({ rota: { id } }, { rota: null as any, ordem_na_rota: null as any });
        
        await this.rotaRepositorio.remove(rota);
    }

    // Helper para atualizar os passageiros com o ID da rota e a ORDEM numérica:
    private static async vincularPassageirosARota(rota: Rota, passageirosIds: number[]) {
        if (passageirosIds.length > 0) {
            for (let i = 0; i < passageirosIds.length; i++) {
                await this.passageiroRepositorio.update(passageirosIds[i], { 
                    rota: { id: rota.id } as any,
                    ordem_na_rota: i + 1 
                });
            }
        }
    }
}

export default RotaService;