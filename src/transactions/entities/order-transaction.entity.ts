import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigIntTransformer } from '../../common/transformers/bigint.transformer';

export enum OrderTransactionStatus {
  PENDING = 'PENDING',
  HELD = 'HELD',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

/** Razones de fallo al cobrar una orden. */
export enum FailureReason {
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  STORE_NOT_FOUND = 'STORE_NOT_FOUND',
  STORE_INACTIVE = 'STORE_INACTIVE',
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',
}

/**
 * Transacción de pago de una orden contra la billetera del comprador.
 *
 * Flujo de estados: HELD (dinero retenido) → RELEASED (liberado al negocio tras la
 * entrega) o REFUNDED (devuelto al comprador si se cancela). FAILED si el cobro no
 * se pudo realizar. Cada cambio de estado registra su timestamp.
 *
 * Todos los montos están en centavos COP.
 */
@Entity('order_transactions')
export class OrderTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // order_id da idempotencia: un evento order.created duplicado no crea dos cobros.
  @Index('idx_order_transactions_order_id', { unique: true })
  @Column({ name: 'order_id', unique: true })
  orderId: string;

  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId: string;

  @Index('idx_order_transactions_store_id')
  @Column({ name: 'store_id', type: 'uuid' })
  storeId: string;

  // Valor del pedido.
  @Column({
    name: 'order_amount',
    type: 'bigint',
    transformer: bigIntTransformer,
  })
  orderAmount: number;

  // Recargo por hora pico que paga el comprador (0 si no es hora pico).
  @Column({
    name: 'peak_fee_amount',
    type: 'bigint',
    default: 0,
    transformer: bigIntTransformer,
  })
  peakFeeAmount: number;

  // Total debitado del wallet = order_amount + peak_fee_amount.
  @Column({
    name: 'total_charged',
    type: 'bigint',
    transformer: bigIntTransformer,
  })
  totalCharged: number;

  // Retención de ECIExpress al negocio (comisión de plataforma).
  @Column({
    name: 'platform_fee_amount',
    type: 'bigint',
    default: 0,
    transformer: bigIntTransformer,
  })
  platformFeeAmount: number;

  // Lo que recibe el negocio = order_amount - platform_fee_amount.
  @Column({
    name: 'store_payout_amount',
    type: 'bigint',
    default: 0,
    transformer: bigIntTransformer,
  })
  storePayoutAmount: number;

  @Column({
    type: 'enum',
    enum: OrderTransactionStatus,
    default: OrderTransactionStatus.PENDING,
  })
  status: OrderTransactionStatus;

  @Column({ name: 'is_peak_hour', default: false })
  isPeakHour: boolean;

  @Column({
    name: 'failure_reason',
    type: 'enum',
    enum: FailureReason,
    nullable: true,
  })
  failureReason?: FailureReason | null;

  @Column({ name: 'held_at', type: 'timestamptz', nullable: true })
  heldAt?: Date | null;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt?: Date | null;

  @Column({ name: 'refunded_at', type: 'timestamptz', nullable: true })
  refundedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
