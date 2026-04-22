import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from "typeorm";
import { Motorista } from "./Motorista";
import { ListaJoia } from "./ListaJoia";
import { Rota } from "./Rota";

@Entity('atribuicao_final')
export class RotasAtribuidas {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => ListaJoia)
    listaJoia!: ListaJoia;

    @ManyToOne(() => Motorista)
    motorista!: Motorista;

    @ManyToOne(() => Rota)
    rota!: Rota;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    dataGeracao!: Date;
}
