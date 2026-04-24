import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Rota } from "./Rota";

@Entity('lista_rota')
export class ListaRota {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nomeLista!: string; // Ex: "Escala Compilada Madrugada"

    @Column({ type: 'timestamp' }) // Mudamos para timestamp para bater com seu Service
    dataReferencia!: Date; 

    @Column()
    tipo_lista!: 'ROTA_TARDE' | 'ROTA_MADRUGADA';

    @OneToMany(() => Rota, rota => rota.listaRota)
    rotaLista!: Rota[];
}