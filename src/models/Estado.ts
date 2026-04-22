import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Cidade } from "./Cidade";
import { Pais } from "./Pais";

@Entity('estado')
export class Estado{
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @OneToMany(() => Cidade, cidade => cidade.estado)
    cidades?: Cidade[];

    @Column()
    paisId?: number;

    @ManyToOne(() => Pais, pais => pais.estados, {
        cascade: ["insert", "update"], 
        eager: true
    })
    @JoinColumn({name: 'paisId'})
    pais?: Pais;
}