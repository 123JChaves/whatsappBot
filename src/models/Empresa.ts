import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Rota } from "./Rota";
import { Passageiro } from "./Passageiro";

@Entity('empresa')
export class Empresa {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @Column()
    logo!: string;
    
    @ManyToOne(() => Rota, rota => rota.empresas)
    rota?: Rota;

    @OneToMany(() => Passageiro, passageiro => passageiro.empresa)
    passageiros?: Passageiro[];

}