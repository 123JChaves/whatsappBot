import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from "typeorm";

@Entity('motorista')
export class Motorista {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @Column( { unique: true })
    telefone!: string;

    @Column( { default: true })
    ativo!: boolean;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    dataDeRegistro!: Date;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP" })
    dataDeEdicao!: Date;
}