import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigIntTransformer } from '../../common/transformers/bigint.transformer';
import { PayoutType } from '../../stores/entities/store.entity';

export enum StorePayoutType {
  AUTOMATIC = 'AUTOMATIC',
  ON_DEMAND = 'ON_DEMAND',
}

export enum StorePayoutStatus {
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

/**
 * Un giro (liquidación) ejecutado hacia un negocio: agrupa todas las `OrderTransaction`
 * RELEASED que estaban disponibles al momento del giro (ver `payout_id` en
 * `order_transactions`). Puede ser AUTOMATIC (liquidación mensual) u ON_DEMAND (retiro
 * anticipado pedido por el negocio).
 *
 * La cuenta destino se guarda en snapshot: si el negocio cambia su cuenta después, el
 * histórico de este giro no se altera.
 *
 * `status` siempre es COMPLETED hoy porque el ejecutor es simulado (sandbox, sin
 * aprobación de producción de Wompi para dispersión); se conserva el campo para cuando
 * exista una integración real que sí pueda fallar.
 */
@Entity('store_payouts')
export class StorePayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_store_payouts_store_id')
  @Column({ name: 'store_id', type: 'uuid' })
  storeId: string;

  @Column({ type: 'enum', enum: StorePayoutType })
  type: StorePayoutType;

  @Column({
    type: 'enum',
    enum: StorePayoutStatus,
    default: StorePayoutStatus.COMPLETED,
  })
  status: StorePayoutStatus;

  // Centavos COP.
  @Column({ type: 'bigint', transformer: bigIntTransformer })
  amount: number;

  @Column({ name: 'destination_type', type: 'enum', enum: PayoutType })
  destinationType: PayoutType;

  @Column({ name: 'destination_account_number', type: 'varchar' })
  destinationAccountNumber: string;

  @Column({ name: 'destination_bank_code', type: 'varchar', nullable: true })
  destinationBankCode?: string | null;

  @Column({ name: 'destination_holder_name', type: 'varchar' })
  destinationHolderName: string;

  // Referencia del giro (simulada hoy: `SIM-<uuid>`).
  @Column({ type: 'varchar' })
  reference: string;

  @Column({ name: 'executed_at', type: 'timestamptz' })
  executedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
