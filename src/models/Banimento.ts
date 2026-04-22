import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Motorista } from "./Motorista";

@Entity('banimento')
export class Banimento {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    dia!: Date;

    @Column({ nullable: true })
    motivo!: string;

    @ManyToOne(() => Motorista, { eager: true })
    motorista!: Motorista;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    dataRegistro!: Date;
}
