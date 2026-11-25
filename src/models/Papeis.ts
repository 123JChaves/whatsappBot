import { Column, Entity, PrimaryGeneratedColumn, ManyToMany, JoinTable } from "typeorm";
import { Permissoes } from "./Permissoes";
import { Usuario } from "./Usuario";

export enum RoleEnum {
    ADMIN = 'admin',
    USER = 'user'
}

@Entity('papel')
export class Papeis {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', unique: true })
    nome!: RoleEnum;

    @ManyToMany(() => Permissoes, (permissoes) => permissoes.papeis, { eager: true })
    @JoinTable({ name: 'papel_permissoes' })
    permissoes!: Permissoes[];

    @ManyToMany(() => Usuario, (usuario) => usuario.papeis)
    usuarios!: Usuario[];
}
