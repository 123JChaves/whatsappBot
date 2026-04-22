import { Column, Entity, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Rota } from "./Rota";
import { Empresa } from "./Empresa";
import { Endereco } from "./Endereco";

@Entity('passageiro')
export class Passageiro {

    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    nome!: string;

    @ManyToOne(() => Endereco, endereco => endereco.passageiro, { cascade: true })
    endereco!: Endereco;

    @ManyToOne(() => Empresa, empresa => empresa.passageiros, { cascade: true })
    empresa!: Empresa;

    @ManyToOne(() => Rota, rota => rota.passageiros, {})
    rota?: Rota;

    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
    dataDeRegistro!: Date;
    
    @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP" })
    dataDeEdicao!: Date;
}