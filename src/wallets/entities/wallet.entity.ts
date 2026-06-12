import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigIntTransformer } from '../../common/transformers/bigint.transformer';
import { WalletUser } from './wallet-user.entity';

/**
 * Billetera interna de créditos del comprador. El saldo se almacena en centavos COP
 * como bigint y nunca puede ser negativo (lo garantizan los UPDATE condicionales del
 * servicio). El saldo solo se acredita desde el webhook de Wompi validado.
 */
@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_wallets_user_id', { unique: true })
  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @Column({ type: 'bigint', default: 0, transformer: bigIntTransformer })
  balance: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToOne(() => WalletUser, (user) => user.wallet)
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: WalletUser;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
