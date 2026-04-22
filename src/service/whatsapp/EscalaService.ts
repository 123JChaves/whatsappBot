import { AppDataSource } from "../../data-source";
import { OrdemJoinha } from "../../models/OrdemJoinha";
import { Rota } from "../../models/Rota";
import { RotasAtribuidas } from "../../models/RotasAtribuidas";
import { Motorista } from "../../models/Motorista";
import { ListaJoia } from "../../models/ListaJoia";
import { DiasTipo } from "../../models/DiasTipo";
import { Not, Repository } from "typeorm";
import { TipoDia, PeriodoRota } from "../../interfaces/ITipos";
import IConfiguracaoEscala from "../../interfaces/IConfiguracaoEscata";
import IRotasAtivas from "../../interfaces/IRotasAtivas";

export class EscalaService {
    // Regras de Negócio Centrais
    private readonly LIMITE_PLANTAO_PADRAO = 4;
    private readonly LIMITE_PLANTAO_SEGUNDA = 5;
    private readonly DIA_SEMANA_SEGUNDA = 1;

    private readonly ordemRepo: Repository<OrdemJoinha> = AppDataSource.getRepository(OrdemJoinha);
    private readonly rotaRepo: Repository<Rota> = AppDataSource.getRepository(Rota);
    private readonly atribuicaoRepo: Repository<RotasAtribuidas> = AppDataSource.getRepository(RotasAtribuidas);
    private readonly listaRepo: Repository<ListaJoia> = AppDataSource.getRepository(ListaJoia);
    private readonly diasTipoRepo: Repository<DiasTipo> = AppDataSource.getRepository(DiasTipo);

    /**
     * Executa o processamento completo: Atribuição no Banco + Relatório de WhatsApp
     */
    async gerarEscalaCompleta(listaId: number): Promise<string> {
        const listaJoinha = await this.buscarListaOuFalhar(listaId);
        const motoristasFila = await this.obterMotoristasOrdenados(listaId);
        
        const { rotasTarde, rotasMadrugada } = await this.obterTodasAsRotasAtivas();
        const qtdMaxRotas = Math.max(rotasTarde.length, rotasMadrugada.length);

        const dataMadrugadaAlvo = this.calcularDataFutura(listaJoinha.dia, 2);
        const tipoDia = await this.identificarTipoDia(dataMadrugadaAlvo);
        const ehSegundaComum = this.verificarSeEhSegundaComum(dataMadrugadaAlvo, tipoDia);

        // Persistência
        await this.limparAtribuicoesAnteriores(listaId);
        await this.gravarEscalaNoBanco(
            motoristasFila, 
            { rotasTarde, rotasMadrugada }, 
            listaJoinha, 
            tipoDia, 
            qtdMaxRotas
        );

        // Comunicação
        return this.montarRelatorioWhatsapp(motoristasFila, {
            tipoDia,
            ehSegundaComum,
            qtdMaxRotas,
            dataReferencia: dataMadrugadaAlvo
        });
    }

    private async identificarTipoDia(data: Date): Promise<TipoDia> {
        const dataApenas = new Date(data.getFullYear(), data.getMonth(), data.getDate());
        const registroManual = await this.diasTipoRepo.findOneBy({ data: dataApenas });
        
        if (registroManual) return registroManual.tipo;

        const diaSemana = data.getDay();
        const ehFimDeSemana = (diaSemana === 0 || diaSemana === 6);
        return ehFimDeSemana ? 'DIA_LIVRE' : 'DIA_COMUM';
    }

    private async gravarEscalaNoBanco(
        motoristas: OrdemJoinha[], 
        rotas: IRotasAtivas,
        lista: ListaJoia, 
        tipo: TipoDia, 
        qtdMax: number
    ): Promise<void> {
        const novasAtribuicoes: RotasAtribuidas[] = [];
        const dataTarde = this.calcularDataFutura(lista.dia, 1);
        const dataMadrugada = this.calcularDataFutura(lista.dia, 2);

        for (const registro of motoristas) {
            const idx = registro.posicao - 1;

            if (registro.posicao <= qtdMax) {
                if (rotas.rotasTarde[idx]) {
                    novasAtribuicoes.push(this.criarInstanciaAtribuicao(lista, registro.motorista, rotas.rotasTarde[idx], dataTarde));
                }
                if (rotas.rotasMadrugada[idx]) {
                    novasAtribuicoes.push(this.criarInstanciaAtribuicao(lista, registro.motorista, rotas.rotasMadrugada[idx], dataMadrugada));
                }
            } 
            else if (tipo === 'DIA_COMUM' && registro.posicao === qtdMax + 1) {
                const rotaApoio = await this.rotaRepo.findOneBy({ tipo: 'APOIO', tipo_rota: 'ROTA_MADRUGADA' });
                if (rotaApoio) {
                    novasAtribuicoes.push(this.criarInstanciaAtribuicao(lista, registro.motorista, rotaApoio, dataMadrugada));
                }
            }
        }
        if (novasAtribuicoes.length > 0) await this.atribuicaoRepo.save(novasAtribuicoes);
    }

    private montarRelatorioWhatsapp(motoristas: OrdemJoinha[], config: IConfiguracaoEscala): string {
        const { tipoDia, ehSegundaComum, qtdMaxRotas, dataReferencia } = config;
        const titulo = ehSegundaComum ? 'MADRUGADA DE SEGUNDA' : tipoDia;
        const limitePlantao = ehSegundaComum ? this.LIMITE_PLANTAO_SEGUNDA : this.LIMITE_PLANTAO_PADRAO;

        let texto = `*Escala dia ${dataReferencia.getDate()}/${dataReferencia.getMonth()+1}* (${titulo})\n\n`;

        motoristas.forEach(reg => {
            texto += this.formatarLinhaPorRegra(reg, tipoDia, limitePlantao, qtdMaxRotas);
        });

        return texto;
    }

    private formatarLinhaPorRegra(reg: OrdemJoinha, tipo: TipoDia, limite: number, qtdMax: number): string {
        const { posicao: p, motorista: { nome } } = reg;

        if (tipo === 'DIA_LIVRE') {
            if (p <= 4) return `*${p} ${nome}* (00h-04h)\n`;
            if (p === 5) return `*${p} ${nome}* (04h-06h)\n`;
            if (p > 5 && p <= qtdMax) {
                const header = (p === 6) ? `\n_*Rotas*_\n` : "";
                return `${header}*${p} ${nome}*\n`;
            }
            const headerPl = (p === qtdMax + 1) ? `\n_*Plantonistas Livres*_\n` : "";
            return `${headerPl}${nome}\n`;
        }

        // DIA_COMUM ou SEGUNDA
        if (p <= limite) return `*${p} ${nome}*\n`;
        if (p > limite && p <= qtdMax) {
            const headerRotas = (p === limite + 1) ? `\n_*Rotas*_\n` : "";
            return `${headerRotas}*${p} ${nome}*\n`;
        }
        if (p === qtdMax + 1) return `\n*${nome} (Apoio/Plantão)*\n`;
        
        const headerBackup = (p === qtdMax + 2) ? `\n_*Backup*_\n` : "";
        return `${headerBackup}${nome}\n`;
    }

    // Auxiliares de Consulta
    private async obterTodasAsRotasAtivas(): Promise<IRotasAtivas> {
        const [rotasTarde, rotasMadrugada] = await Promise.all([
            this.obterRotasPorPeriodo('ROTA_TARDE'),
            this.obterRotasPorPeriodo('ROTA_MADRUGADA')
        ]);
        return { rotasTarde, rotasMadrugada };
    }

    private async obterRotasPorPeriodo(periodo: PeriodoRota): Promise<Rota[]> {
        return this.rotaRepo.find({ 
            where: { tipo_rota: periodo, tipo: Not('APOIO') }, 
            order: { ordem: "ASC" } 
        });
    }

    private async obterMotoristasOrdenados(listaId: number): Promise<OrdemJoinha[]> {
        return this.ordemRepo.find({ 
            where: { listaJoia: { id: listaId } }, 
            relations: ["motorista"], 
            order: { posicao: "ASC" } 
        });
    }

    // Auxiliares de Lógica
    private calcularDataFutura(base: Date, dias: number): Date {
        const data = new Date(base);
        data.setDate(data.getDate() + dias);
        return data;
    }

    private verificarSeEhSegundaComum(data: Date, tipo: TipoDia): boolean {
        return data.getDay() === this.DIA_SEMANA_SEGUNDA && tipo === 'DIA_COMUM';
    }

    private async buscarListaOuFalhar(id: number): Promise<ListaJoia> {
        const lista = await this.listaRepo.findOneBy({ id });
        if (!lista) throw new Error("Lista de joinha não encontrada.");
        return lista;
    }

    private criarInstanciaAtribuicao(lista: ListaJoia, motorista: Motorista, rota: Rota, data: Date): RotasAtribuidas {
        return this.atribuicaoRepo.create({ listaJoia: lista, motorista, rota, dataGeracao: data });
    }

    private async limparAtribuicoesAnteriores(id: number): Promise<void> {
        await this.atribuicaoRepo.delete({ listaJoia: { id } });
    }
}