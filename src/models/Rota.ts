import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { ListaRota } from "./ListaRota";
import { Passageiro } from "./Passageiro";
import { Empresa } from "./Empresa";

@Entity('rota')
export class Rota {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string

    @Column()
    ordem!: string;

    @OneToMany(() => Passageiro, passageiro => passageiro.rota)
    passageiros!: Passageiro[];

    @Column()
    tipo_rota!: 'ROTA_TARDE' | 'ROTA_MADRUGADA';

    @Column({ default: 'COMUM' })
    tipo!: 'COMUM' | 'APOIO';

    @OneToMany(() => Empresa, empresa => empresa.rota)
    empresas!: Empresa[];

    @Column()
    horario!: string;

    @ManyToOne(() => ListaRota, listaRota => listaRota.rotaLista)
    listaRota?: ListaRota;
}