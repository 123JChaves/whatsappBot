import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { OrdemJoinha } from "./OrdemJoinha";

@Entity('lista_joia')
export class ListaJoia {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    dia!: Date;

    @Column({ default: 'CAPTURA_DIARIA' })
    identificador!: string;
    
    @OneToMany(() => OrdemJoinha, (ordemJoinha) => ordemJoinha.listaJoia, { cascade: true })
    ordem_joinha!: OrdemJoinha[];
}