import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Rota } from "./Rota";

@Entity('lista_rota')
export class ListaRota {

    @PrimaryGeneratedColumn()
    id!: number

    @Column()
    nomeLista!: string;

    @OneToMany(() => Rota, rota => rota.listaRota)
    rotaLista!: Rota[];
}