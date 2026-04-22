import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { OrdemJoinha } from "./OrdemJoinha";

@Entity('lista_joia')
export class ListaJoia {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    dia!: Date; // Apenas para sabermos de qual dia é essa captura

    @Column({ default: 'CAPTURA_DIARIA' })
    identificador!: string; // Ex: "CAPTURA_DIARIA" ou "LISTA_RESERVA"

    @OneToMany(() => OrdemJoinha, (ordemJoinha) => ordemJoinha.listaJoia, { cascade: true })
    ordem_joinha!: OrdemJoinha[];
}