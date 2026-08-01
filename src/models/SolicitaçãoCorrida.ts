import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique, JoinColumn } from "typeorm";
import { Passageiro } from "./Passageiro";

@Entity('solicitacao_corrida')
@Unique(["passageiroId", "dataViagem", "tipoTurno"])
export class SolicitacaoCorrida {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    passageiroId!: number;

    @ManyToOne(() => Passageiro, { onDelete: 'CASCADE' })
    @JoinColumn({ name: "passageiroId" })
    passageiro!: Passageiro;

    @Column({ type: "date" })
    dataViagem!: string; // Armazena estritamente "AAAA-MM-DD" para sumir com problemas de fuso

    @Column({ type: "enum", enum: ["IDA", "VOLTA"] })
    tipoTurno!: "IDA" | "VOLTA";

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    dataCriacao!: Date;
}
