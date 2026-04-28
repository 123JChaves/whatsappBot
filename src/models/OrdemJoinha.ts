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

    @Column({ default: false })
    isPenalizado!: boolean;

    @ManyToOne(() => ListaJoia, (lista) => lista.ordem_joinha, { nullable: false })
    listaJoia!: ListaJoia;

    @Column({ 
    type: "timestamp", 
    precision: 6, // Define a precisão para milissegundos
    default: () => "CURRENT_TIMESTAMP(3)" // Garante que o MySQL gere o tempo com milissegundos
    })
    horaDoJoinha!: Date;
}