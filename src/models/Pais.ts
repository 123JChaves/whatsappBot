import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Estado } from "./Estado";

@Entity('pais')
export class Pais{
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @OneToMany(() => Estado, estado => estado.pais)
    estados?: Estado[];
}