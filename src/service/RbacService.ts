import { AppDataSource } from "../data-source";
import { Papeis, RoleEnum } from "../models/Papeis";
import { Permissoes } from "../models/Permissoes";
import { MapaDePermissoesPorPapel, PermissoesDoSistema } from "../utils/dicionario-rbac/DicionarioRbac";

export async function rodarSeedRbac() {
    const repositorioPermissoes = AppDataSource.getRepository(Permissoes);
    const repositorioPapeis = AppDataSource.getRepository(Papeis);

    const nomesPermissoes = Object.values(PermissoesDoSistema);
    const permissoesBanco: Record<string, Permissoes> = {};

    for (const nome of nomesPermissoes) {
        let permissao = await repositorioPermissoes.findOne({ where: { nome } });
        if (!permissao) {
            permissao = repositorioPermissoes.create({ nome, descricao: `Permissão para ${nome.toLowerCase().replace('_', ' ')}` });
            permissao = await repositorioPermissoes.save(permissao);
        }
        permissoesBanco[nome] = permissao;
    }

    let papelAdmin = await repositorioPapeis.findOne({ where: { nome: RoleEnum.ADMIN } });
    if (!papelAdmin) papelAdmin = repositorioPapeis.create({ nome: RoleEnum.ADMIN });
    
    papelAdmin.permissoes = MapaDePermissoesPorPapel[RoleEnum.ADMIN].map(nome => permissoesBanco[nome]);
    await repositorioPapeis.save(papelAdmin);

    let papelUser = await repositorioPapeis.findOne({ where: { nome: RoleEnum.USER } });
    if (!papelUser) papelUser = repositorioPapeis.create({ nome: RoleEnum.USER });
    
    papelUser.permissoes = MapaDePermissoesPorPapel[RoleEnum.USER].map(nome => permissoesBanco[nome]);
    await repositorioPapeis.save(papelUser);

    console.log("✨ Banco de dados sincronizado com as regras do RBAC!");
}