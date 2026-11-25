import { Column, Entity, PrimaryGeneratedColumn, ManyToMany } from "typeorm";
import { Papeis } from "./Papeis";

@Entity('permissao')
export class Permissoes {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ unique: true })
    nome!: string;

    @Column({ nullable: true })
    descricao?: string;

    @ManyToMany(() => Papeis, (papeis) => papeis.permissoes)
    papeis!: Papeis[];
}