import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Cuenta donde el negocio recibe sus desembolsos. */
export enum PayoutType {
  NEQUI = 'NEQUI',
  DAVIPLATA = 'DAVIPLATA',
  BANK_ACCOUNT = 'BANK_ACCOUNT',
}

/**
 * Proyección local de los negocios más su configuración financiera. El `id` es el
 * mismo que asigna Identity (se llena desde `identity.store.created`).
 *
 * Los porcentajes de comisión se guardan como decimal(5,2). El driver de PostgreSQL
 * devuelve los decimal como string, por eso se usa un transformer que los convierte a
 * number en la capa de aplicación.
 */
@Entity('stores')
export class Store {
  @PrimaryColumn('uuid')
  id: string;

  /**
   * Estado del negocio replicado desde `identity.store.status_changed`
   * (OPEN, TEMPORARILY_CLOSED, CLOSED, ...). Cuando vuelve a OPEN no se congelan
   * los desembolsos; cualquier otro estado los congela.
   */
  @Column({ default: 'OPEN' })
  status: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // --- Configuración de comisiones (administrada por un admin de ECIExpress) ---

  @Column({
    name: 'platform_fee_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  platformFeePercent: number;

  @Column({
    name: 'peak_fee_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) },
  })
  peakFeePercent: number;

  @Column({ name: 'peak_hours_start', type: 'time', nullable: true })
  peakHoursStart?: string | null;

  @Column({ name: 'peak_hours_end', type: 'time', nullable: true })
  peakHoursEnd?: string | null;

  @Column({ name: 'peak_days', type: 'text', array: true, nullable: true })
  peakDays?: string[] | null;

  // --- Cuenta de desembolso del negocio ---

  @Column({
    name: 'payout_type',
    type: 'enum',
    enum: PayoutType,
    nullable: true,
  })
  payoutType?: PayoutType | null;

  @Column({ name: 'payout_account_number', type: 'varchar', nullable: true })
  payoutAccountNumber?: string | null;

  @Column({ name: 'payout_bank_code', type: 'varchar', nullable: true })
  payoutBankCode?: string | null;

  @Column({ name: 'payout_holder_name', type: 'varchar', nullable: true })
  payoutHolderName?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
