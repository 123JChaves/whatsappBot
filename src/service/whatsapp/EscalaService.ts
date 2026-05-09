import { AppDataSource } from "../../data-source";
import { OrdemJoinha } from "../../models/OrdemJoinha";
import { Rota } from "../../models/Rota";
import { RotaAtribuida } from "../../models/RotaAtribuida";
import { Motorista } from "../../models/Motorista";
import { ListaJoia } from "../../models/ListaJoia";
import { DiasTipo } from "../../models/DiasTipo";
import { Repository } from "typeorm";
import { TipoDia, PeriodoRota } from "../../interfaces/ITipos";
import IConfiguracaoEscala from "../../interfaces/IConfiguracaoEscala";
import IRotasAtivas from "../../interfaces/IRotasAtivas";
import IRegistroRelatorio from "../../interfaces/IRegistroRelatorio";

export class EscalaService {
    private readonly LIMITE_PLANTAO_PADRAO = 4;
    private readonly LIMITE_PLANTAO_SEGUNDA = 5;
    private readonly DIA_SEMANA_SEGUNDA = 1;

    private readonly ordemRepositorio: Repository<OrdemJoinha> = AppDataSource.getRepository(OrdemJoinha);
    private readonly rotaRepositorio: Repository<Rota> = AppDataSource.getRepository(Rota);
    private readonly atribuicaoRepositorio: Repository<RotaAtribuida> = AppDataSource.getRepository(RotaAtribuida);
    private readonly listaRepositorio: Repository<ListaJoia> = AppDataSource.getRepository(ListaJoia);
    private readonly diasTipoRepositorio: Repository<DiasTipo> = AppDataSource.getRepository(DiasTipo);

    async gerarEscalaCompleta(listaId: number): Promise<string> {
        const listaJoinha = await this.buscarListaOuFalhar(listaId);
        const motoristasFila = await this.obterMotoristasOrdenados(listaId);
        const { rotasTarde, rotasMadrugada } = await this.obterTodasAsRotasAtivas();
        
        const qtdMaxRotas = Math.max(rotasTarde.length, rotasMadrugada.length);
        const dataMadrugadaAlvo = this.calcularDataFutura(listaJoinha.dia, 2);
        const tipoDia = await this.identificarTipoDia(dataMadrugadaAlvo);
        const ehSegundaComum = this.verificarSeEhSegundaComum(dataMadrugadaAlvo, tipoDia);

        await this.limparAtribuicoesAnteriores(listaId);
        await this.gravarEscalaNoBanco(
            motoristasFila,
            { rotasTarde, rotasMadrugada },
            listaJoinha,
            tipoDia,
            qtdMaxRotas
        );

        return this.montarRelatorioWhatsapp(motoristasFila, { tipoDia, ehSegundaComum, qtdMaxRotas, dataReferencia: dataMadrugadaAlvo });
    }

    private async identificarTipoDia(data: Date): Promise<TipoDia> {
        const dataApenas = new Date(data.getFullYear(), data.getMonth(), data.getDate());
        const registroManual = await this.diasTipoRepositorio.findOneBy({ data: dataApenas });
        if (registroManual) return registroManual.tipo;

        const diaSemana = data.getDay();
        return (diaSemana === 0 || diaSemana === 6) ? 'DIA_LIVRE' : 'DIA_COMUM';
    }

    private async gravarEscalaNoBanco(
        motoristas: OrdemJoinha[],
        rotas: IRotasAtivas,
        lista: ListaJoia,
        tipo: TipoDia,
        qtdMax: number
    ): Promise<void> {
        const novasAtribuicoes: RotaAtribuida[] = [];
        const dataTarde = this.calcularDataFutura(lista.dia, 1);
        const dataMadrugada = this.calcularDataFutura(lista.dia, 2);

        motoristas.forEach((registro, index) => {
            const posicaoEfetiva = index + 1;

            if (posicaoEfetiva <= qtdMax) {
                if (rotas.rotasTarde[index]) {
                    novasAtribuicoes.push(this.criarInstanciaAtribuicao(lista, registro.motorista, rotas.rotasTarde[index], dataTarde, "ROTA"));
                }
                if (rotas.rotasMadrugada[index]) {
                    novasAtribuicoes.push(this.criarInstanciaAtribuicao(lista, registro.motorista, rotas.rotasMadrugada[index], dataMadrugada, "ROTA"));
                }
            } 
            else if (tipo === 'DIA_COMUM' && posicaoEfetiva === qtdMax + 1) {
                // APOIO agora gravado diretamente como status, usando a primeira rota da lista como referência técnica
                const rotaReferencia = rotas.rotasMadrugada[0]; 
                novasAtribuicoes.push(this.criarInstanciaAtribuicao(lista, registro.motorista, rotaReferencia, dataMadrugada, "APOIO"));
            }
        });

        if (novasAtribuicoes.length > 0) await this.atribuicaoRepositorio.save(novasAtribuicoes);
    }

    // --- MÉTODOS MANUAIS PARA O APP MOBILE (RESTAURADOS) ---

    async definirTipoDiaManual(dataBr: string, tipo: TipoDia): Promise<void> {
        const [dia, mes, ano] = dataBr.split('/').map(Number);
        const dataAlvo = new Date(ano, mes - 1, dia);
        dataAlvo.setHours(0, 0, 0, 0);

        let registro = await this.diasTipoRepositorio.findOneBy({ data: dataAlvo });
        if (registro) {
            registro.tipo = tipo;
        } else {
            registro = this.diasTipoRepositorio.create({ data: dataAlvo, tipo });
        }
        await this.diasTipoRepositorio.save(registro);
    }

    async removerTipoDiaManual(dataBr: string): Promise<void> {
        const [dia, mes, ano] = dataBr.split('/').map(Number);
        const dataAlvo = new Date(ano, mes - 1, dia);
        dataAlvo.setHours(0, 0, 0, 0);
        await this.diasTipoRepositorio.delete({ data: dataAlvo });
    }

    async listarDiasManuais(): Promise<string> {
        const dias = await this.diasTipoRepositorio.find({ order: { data: "ASC" } });
        if (dias.length === 0) return "📅 Nenhuma data manual cadastrada.";

        let texto = "*Datas Manuais Cadastradas:*\n";
        dias.forEach(d => {
            const dataFormatada = `${d.data.getDate()}/${d.data.getMonth() + 1}/${d.data.getFullYear()}`;
            texto += `• ${dataFormatada}: *${d.tipo}*\n`;
        });
        return texto;
    }

    // --- AUXILIARES E RELATÓRIO ---

    private criarInstanciaAtribuicao(lista: ListaJoia, motorista: Motorista, rota: Rota, data: Date, tipo: "ROTA" | "APOIO" | "PLANTAO"): RotaAtribuida {
        return this.atribuicaoRepositorio.create({
            listaJoia: lista,
            motorista,
            rota,
            dataGeracao: data,
            tipoAtribuicao: tipo
        });
    }

    private async obterTodasAsRotasAtivas(): Promise<IRotasAtivas> {
        const [rotasTarde, rotasMadrugada] = await Promise.all([
            this.obterRotasPorPeriodo('ROTA_TARDE'),
            this.obterRotasPorPeriodo('ROTA_MADRUGADA')
        ]);
        return { rotasTarde, rotasMadrugada };
    }

    private async obterRotasPorPeriodo(periodo: PeriodoRota): Promise<Rota[]> {
        return this.rotaRepositorio.find({
            where: { tipo_rota: periodo },
            order: { ordem: "ASC" }
        });
    }

    private montarRelatorioWhatsapp(motoristas: OrdemJoinha[], config: IConfiguracaoEscala): string {
        const { tipoDia, ehSegundaComum, qtdMaxRotas, dataReferencia } = config;
        const titulo = ehSegundaComum ? 'MADRUGADA DE SEGUNDA' : tipoDia.replace('_', ' ');
        const limitePlantao = ehSegundaComum ? this.LIMITE_PLANTAO_SEGUNDA : this.LIMITE_PLANTAO_PADRAO;

        let texto = `*Escala dia ${dataReferencia.getDate()}/${dataReferencia.getMonth() + 1}* (${titulo})\n`;
        texto += "```\n";

        let listaParaRelatorio = [...motoristas];
        if (tipoDia === 'DIA_COMUM' && listaParaRelatorio.length >= 5) {
            const apoio = listaParaRelatorio.splice(4, 1)[0];
            const novaPosicao = Math.min(qtdMaxRotas, listaParaRelatorio.length);
            listaParaRelatorio.splice(novaPosicao, 0, apoio);
        }

        listaParaRelatorio.forEach((reg, index) => {
            texto += this.formatarLinhaPorRegra(reg as any, tipoDia, limitePlantao, qtdMaxRotas, index + 1);
        });

        texto += "```";
        return texto;
    }

    private formatarLinhaPorRegra(reg: IRegistroRelatorio, tipo: TipoDia, limite: number, qtdMax: number, posicaoAtual: number): string {
        const { motorista: { nome } } = reg;
        if (tipo === 'DIA_COMUM') {
            if (posicaoAtual <= limite) return (posicaoAtual === 1 ? `*Plantão*\n` : "") + `${posicaoAtual} ${nome}\n`;
            if (posicaoAtual > limite && posicaoAtual <= qtdMax) return (posicaoAtual === limite + 1 ? `\n*Rota*\n` : "") + `${posicaoAtual} ${nome}\n`;
            if (posicaoAtual === qtdMax + 1) return `\n${nome} (Apoio/Plantão)\n`;
            return (posicaoAtual === qtdMax + 2 ? `\n*Backup*\n` : "") + `${nome}\n`;
        }
        if (tipo === 'DIA_LIVRE') {
            if (posicaoAtual === 1) return `*Plantão (até o fim das rotas)*\n1 ${nome}\n`;
            if (posicaoAtual <= 5) return `${posicaoAtual} ${nome}\n`;
            if (posicaoAtual === 6) return `\n*Plantão (das 04h00 às 06h00)*\n6 ${nome}\n`;
            if (posicaoAtual <= 9) return `${posicaoAtual} ${nome}\n`;
            return (posicaoAtual === 10 ? `\n*Livre*\n` : "") + `${posicaoAtual} ${nome}\n`;
        }
        return `${posicaoAtual} ${nome}\n`;
    }

    private async obterMotoristasOrdenados(listaId: number): Promise<OrdemJoinha[]> {
        return await this.ordemRepositorio.find({
            where: { listaJoia: { id: listaId } },
            relations: ["motorista"],
            order: { isPenalizado: "ASC", horaDoJoinha: "ASC" }
        });
    }

    private calcularDataFutura(base: Date, dias: number): Date {
        const data = new Date(base);
        data.setDate(data.getDate() + dias);
        return data;
    }

    private verificarSeEhSegundaComum(data: Date, tipo: TipoDia): boolean {
        return data.getDay() === this.DIA_SEMANA_SEGUNDA && tipo === 'DIA_COMUM';
    }

    private async buscarListaOuFalhar(id: number): Promise<ListaJoia> {
        const lista = await this.listaRepositorio.findOneBy({ id });
        if (!lista) throw new Error("Lista de joinha não encontrada.");
        return lista;
    }

    private async limparAtribuicoesAnteriores(id: number): Promise<void> {
        await this.atribuicaoRepositorio.delete({ listaJoia: { id } });
    }
}