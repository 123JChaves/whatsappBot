import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity('dias_tipo')
export class DiasTipo {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'date', unique: true })
    data!: Date; // Ex: 2024-12-25

    @Column({ type: 'enum', enum: ['DIA_COMUM', 'DIA_LIVRE'] })
    tipo!: 'DIA_COMUM' | 'DIA_LIVRE';
}
