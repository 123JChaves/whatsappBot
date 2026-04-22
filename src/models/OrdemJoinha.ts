import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from "typeorm";
import { Motorista } from "./Motorista";
import { ListaJoia } from "./ListaJoia";

@Entity('ordem_joinha')
export class OrdemJoinha {
    
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    posicao!: number;

    @ManyToOne(() => Motorista)
    motorista!: Motorista;

    @ManyToOne(() => ListaJoia, (lista) => lista.ordem_joinha, { nullable: false })
    listaJoia!: ListaJoia;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    horaDoJoinha!: Date;
}