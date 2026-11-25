import { AppDataSource } from "../data-source";
import { Empresa } from "../models/Empresa";
import NaoEncontradoErro from "../error/NaoEncontrado.404";
import RequisicaoInvalidaErro from "../error/RequisicaoInvalida.400";
import IEmpresa from "../interfaces/IEmpresa";
import validarCamposObrigatorios from "../utils/helpers/VerificarCamposObrigatorios";
import VerificarDuplicidade from "../utils/helpers/VerificarDuplicidade";
import validarCNPJCompleto from "../utils/validators/ValidacaoDeCnpj";
import TextoHelper from "../utils/helpers/TextoHelper";
import { cache, ChavesCache, TTL } from "../infra/cache/CacheService";
import { eventBus, CanaisEventos } from "../infra/eventos/EventBus";

class EmpresaService {

    private static empresaRepositorio = AppDataSource.getRepository(Empresa);

    // Service para listar todas as empresas:
    static async listarEmpresas(): Promise<Empresa[]>{
        return cache.obterOuCarregar(ChavesCache.empresasTodas(), TTL.EMPRESAS, () => this.listarEmpresasDoBanco());
    }

    private static async listarEmpresasDoBanco(): Promise<Empresa[]>{
        const empresas = await this.empresaRepositorio.find({
            select: {
                id: true,
                nome: true,
                cnpj: true,
                logo: true
            },
        });
        return empresas;
    };

    // Service para listar uma empresa (por ID):
    static async mostrarUmaEmpresa(id: number): Promise<Empresa>{
        return cache.obterOuCarregar(ChavesCache.empresaPorId(id), TTL.EMPRESAS, () => this.mostrarUmaEmpresaDoBanco(id));
    }

    private static async mostrarUmaEmpresaDoBanco(id: number): Promise<Empresa>{
        const empresa = await this.empresaRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                cnpj: true
            },
        });

        if(!empresa) {
            throw new NaoEncontradoErro('Empresa não encontrada no sistema!');
        };

        return empresa;
    };

    // Mostrar empresa individual completa:
    static async mostrarEmpresaIndividualCompleta(id: number): Promise<Empresa>{
        const empresa = await this.empresaRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                cnpj: true,
                logo: true,
                passageiros: true
            },
            relations: [
                'passageiros'
            ],
        });

        if(!empresa) {
            throw new NaoEncontradoErro('Empresa não encontrada no sistema!')
        };

        return empresa;
    };

    // Mostrar empresa individual com a logo:
    static async mostrarEmpresaComALogo(id: number): Promise<Empresa>{
        const empresa = await this.empresaRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                cnpj: true,
                logo: true
            },
        });

        if(!empresa) {
            throw new NaoEncontradoErro('Empresa não encontrada no sistema!')
        };

        return empresa;
    };

    // Mostrar empresa individual e os passageiros a ela vinculados:
    static async mostrarEmpresaComFuncionarios(id: number): Promise<Empresa>{
        const empresa = await this.empresaRepositorio.findOne({
            where: { id },
            select: {
                id: true,
                nome: true,
                cnpj: true,
                passageiros: true
            },
            relations: [
                'passageiros'
            ],
        });
        if(!empresa) {
            throw new NaoEncontradoErro('Empresa não encontrada no sistema!')
        };

        return empresa;
    };

    // Rota para cadastar empresa:
    static async cadastrarEmpresa(dados: IEmpresa): Promise<Empresa>{
        validarCamposObrigatorios<Empresa>(dados as Empresa, 
            ['nome', 'cnpj']
        );

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if(!validarCNPJCompleto(dados.cnpj)) {
            throw new RequisicaoInvalidaErro('CNPJ inválido!')
        };

        await VerificarDuplicidade<Empresa>({
            repositorio: this.empresaRepositorio,
            dados: { cnpj: dados.cnpj },
        });

        const novaEmpresa = await this.empresaRepositorio.save(
            this.empresaRepositorio.create(dados)
        );

        await this.aposAlteracao(novaEmpresa.id, 'CRIADA');
        return novaEmpresa;
    };

    // Service para editar a empresa:
    static async editarEmpresa(id: number, dados: Partial<IEmpresa>): Promise<Empresa>{
        const empresaAtual = await this.empresaRepositorio.findOne({ where: { id } });

        if(!empresaAtual) {
            throw new NaoEncontradoErro('Empresa não encontrada para a edição!');
        };

        if(dados.nome) {
            dados.nome = TextoHelper.sanitizarNome(dados.nome);
        }

        if(dados.cnpj && !validarCNPJCompleto(dados.cnpj)) {
            throw new RequisicaoInvalidaErro('O novo CNPJ é inválido!')
        };

        if(dados.cnpj){
            await VerificarDuplicidade<IEmpresa>({
                repositorio: this.empresaRepositorio,
                dados: {
                    cnpj: dados.cnpj ?? empresaAtual.cnpj
                },
                idParaIgnorar: id
            });
        };

        this. empresaRepositorio.merge(empresaAtual, dados);
        const empresaEditada = await this.empresaRepositorio.save(empresaAtual);

        await this.aposAlteracao(id, 'EDITADA');
        return empresaEditada as Empresa;
    };

    // INVALIDAÇÃO + EVENTO (rotas também exibem empresas, por isso as duas famílias de chaves)
    private static async aposAlteracao(empresaId: number, acao: 'CRIADA' | 'EDITADA' | 'EXCLUIDA'): Promise<void> {
        await cache.invalidarPorPrefixo(ChavesCache.PREFIXO_EMPRESAS);
        await cache.invalidarPorPrefixo(ChavesCache.PREFIXO_ROTAS);
        await eventBus.publicar(CanaisEventos.EMPRESA_ALTERADA, { empresaId, acao });
    }

    // Service para deletar a empresa:
    static async deletarEmpresa(id: number): Promise<Empresa>{
        const empresaDeletada = await this.empresaRepositorio.findOne({ where: { id } });

        if(!empresaDeletada) {
            throw new NaoEncontradoErro('Empresa não encontrada no sistema para a exclusão!')
        };

        await this.empresaRepositorio.remove(empresaDeletada);
        await this.aposAlteracao(id, 'EXCLUIDA');

        return empresaDeletada;
    }
};

export default EmpresaService;