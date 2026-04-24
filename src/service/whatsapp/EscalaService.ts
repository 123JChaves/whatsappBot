import { AppDataSource } from "../../data-source";
import { OrdemJoinha } from "../../models/OrdemJoinha";
import { Rota } from "../../models/Rota";
import { RotaAtribuida } from "../../models/RotaAtribuida";
import { Motorista } from "../../models/Motorista";
import { ListaJoia } from "../../models/ListaJoia";
import { DiasTipo } from "../../models/DiasTipo";
import { Not, Repository } from "typeorm";
import { TipoDia, PeriodoRota } from "../../interfaces/ITipos";
import IConfiguracaoEscala from "../../interfaces/IConfiguracaoEscala";
import IRotasAtivas from "../../interfaces/IRotasAtivas";
import IRegistroRelatorio from "../../interfaces/IRegistroRelatorio";

export class EscalaService {
    // Regras de Negócio Centrais
    private readonly LIMITE_PLANTAO_PADRAO = 4;
    private readonly LIMITE_PLANTAO_SEGUNDA = 5;
    private readonly DIA_SEMANA_SEGUNDA = 1;

    private readonly ordemRepositorio: Repository<OrdemJoinha> = AppDataSource.getRepository(OrdemJoinha);
    private readonly rotaRepositorio: Repository<Rota> = AppDataSource.getRepository(Rota);
    private readonly atribuicaoRepositorio: Repository<RotaAtribuida> = AppDataSource.getRepository(RotaAtribuida);
    private readonly listaRepositorio: Repository<ListaJoia> = AppDataSource.getRepository(ListaJoia);
    private readonly diasTipoRepositorio: Repository<DiasTipo> = AppDataSource.getRepository(DiasTipo);

    /**
     * Executa o processamento completo: Atribuição no Banco + Relatório de WhatsApp
     */
    async gerarEscalaCompleta(listaId: number): Promise<string> {
        const listaJoinha = await this.buscarListaOuFalhar(listaId);
        
        // Refatorado para garantir que penalizados fiquem no fim antes de processar lógica
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
        return this.montarRelatorioWhatsapp(motoristasFila, { tipoDia, ehSegundaComum, qtdMaxRotas, dataReferencia: dataMadrugadaAlvo });
    }

    private async identificarTipoDia(data: Date): Promise<TipoDia> {
        const dataApenas = new Date(data.getFullYear(), data.getMonth(), data.getDate());
        const registroManual = await this.diasTipoRepositorio.findOneBy({ data: dataApenas });

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
        const novasAtribuicoes: RotaAtribuida[] = [];
        const dataTarde = this.calcularDataFutura(lista.dia, 1);
        const dataMadrugada = this.calcularDataFutura(lista.dia, 2);

        motoristas.forEach((registro, index) => {
            const posicaoEfetiva = index + 1; // Usa o index do array ordenado para lógica

            if (posicaoEfetiva <= qtdMax) {
                if (rotas.rotasTarde[index]) {
                    novasAtribuicoes.push(this.criarInstanciaAtribuicao(lista, registro.motorista, rotas.rotasTarde[index], dataTarde));
                }
                if (rotas.rotasMadrugada[index]) {
                    novasAtribuicoes.push(this.criarInstanciaAtribuicao(lista, registro.motorista, rotas.rotasMadrugada[index], dataMadrugada));
                }
            } else if (tipo === 'DIA_COMUM' && posicaoEfetiva === qtdMax + 1) {
                this.rotaRepositorio.findOneBy({ tipo: 'APOIO', tipo_rota: 'ROTA_MADRUGADA' }).then(rotaApoio => {
                    if (rotaApoio) {
                        novasAtribuicoes.push(this.criarInstanciaAtribuicao(lista, registro.motorista, rotaApoio, dataMadrugada));
                    }
                });
            }
        });

        if (novasAtribuicoes.length > 0) await this.atribuicaoRepositorio.save(novasAtribuicoes);
    }

    private montarRelatorioWhatsapp(motoristas: OrdemJoinha[], config: IConfiguracaoEscala): string {
        const { tipoDia, ehSegundaComum, qtdMaxRotas, dataReferencia } = config;
        const titulo = ehSegundaComum ? 'MADRUGADA DE SEGUNDA' : tipoDia.replace('_', ' ');
        const limitePlantao = ehSegundaComum ? this.LIMITE_PLANTAO_SEGUNDA : this.LIMITE_PLANTAO_PADRAO;

        let texto = `*Escala dia ${dataReferencia.getDate()}/${dataReferencia.getMonth() + 1}* (${titulo})\n`;
        
        // Abertura do bloco de código para visual organizado
        texto += "```\n";

        motoristas.forEach((reg, index) => {
            // Criamos um objeto temporário com a posição corrigida para a formatação
            const regFormatado = { ...reg, posicao: index + 1 };
            texto += this.formatarLinhaPorRegra(regFormatado, tipoDia, limitePlantao, qtdMaxRotas);
        });

        texto += "```"; // Fechamento do bloco de código
        return texto;
    }

    private formatarLinhaPorRegra(reg: IRegistroRelatorio, tipo: TipoDia, limite: number, qtdMax: number): string {
        const { posicao: p, motorista: { nome } } = reg;

        if (tipo === 'DIA_LIVRE') {
            let linha = "";
            if (p === 1) linha += `*Plantão dia ${new Date().getDate()}*\n*00h até as rotas*\n`;
            
            if (p <= 5) return `${linha}*${p} ${nome}*\n`;
            
            if (p > 5 && p <= qtdMax) {
                const header = (p === 6) ? `\n*Rotas até 06h*\n` : "";
                return `${header}*${p} ${nome}*\n`;
            } 
            
            const headerPl = (p === qtdMax + 1) ? `\n*Horário livre*\n` : "";
            return `${headerPl}- ${nome}\n`;
        }

        // Lógica DIA_COMUM com regra de Apoio
        if (p <= limite) return `${p} ${nome}\n`;
        if (p > limite && p <= qtdMax) {
            const headerRotas = (p === limite + 1) ? `\nRotas\n` : "";
            return `${headerRotas}${p} ${nome}\n`;
        }
        if (p === qtdMax + 1) return `\n${nome} (Apoio/Plantão)\n`;
        
        const headerBackup = (p === qtdMax + 2) ? `\nBackup\n` : "";
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
        return this.rotaRepositorio.find({ where: { tipo_rota: periodo, tipo: Not('APOIO') }, order: { ordem: "ASC" } });
    }

    /**
     * Refatorado para aplicar a lógica de separação de variáveis:
     * Válidos primeiro, Penalizados (posicao 0) por último.
     */
    private async obterMotoristasOrdenados(listaId: number): Promise<OrdemJoinha[]> {
        const todos = await this.ordemRepositorio.find({
            where: { listaJoia: { id: listaId } },
            relations: ["motorista"],
            order: { id: "ASC" } // Ordem de chegada
        });

        const validos = todos.filter(m => m.posicao !== 0);
        const penalizados = todos.filter(m => m.posicao === 0);

        return [...validos, ...penalizados];
    }

    async definirTipoDiaManual(dataBr: string, tipo: TipoDia): Promise<void> {
        const [dia, mes, ano] = dataBr.split('/').map(Number);
        const dataAlvo = new Date(ano, mes - 1, dia);
        dataAlvo.setHours(0, 0, 0, 0);

        // Verifica se já existe, se sim atualiza, se não cria
        let registro = await this.diasTipoRepositorio.findOneBy({ data: dataAlvo });
        
        if (registro) {
            registro.tipo = tipo;
        } else {
            registro = this.diasTipoRepositorio.create({ data: dataAlvo, tipo });
        }

        await this.diasTipoRepositorio.save(registro);
    }

    /**
     * Remove uma marcação manual de feriado/dia livre
     */
    async removerTipoDiaManual(dataBr: string): Promise<void> {
        const [dia, mes, ano] = dataBr.split('/').map(Number);
        const dataAlvo = new Date(ano, mes - 1, dia);
        dataAlvo.setHours(0, 0, 0, 0);

        await this.diasTipoRepositorio.delete({ data: dataAlvo });
    }

    /**
     * Lista todas as exceções cadastradas (Feriados/Dias Livres/Segundas Especiais)
     */
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
        const lista = await this.listaRepositorio.findOneBy({ id });
        if (!lista) throw new Error("Lista de joinha não encontrada.");
        return lista;
    }

    private criarInstanciaAtribuicao(lista: ListaJoia, motorista: Motorista, rota: Rota, data: Date): RotaAtribuida {
        return this.atribuicaoRepositorio.create({ listaJoia: lista, motorista, rota, dataGeracao: data });
    }

    private async limparAtribuicoesAnteriores(id: number): Promise<void> {
        await this.atribuicaoRepositorio.delete({ listaJoia: { id } });
    }
}