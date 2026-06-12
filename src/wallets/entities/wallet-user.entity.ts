import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';

/**
 * Proyección local de los compradores. El `id` es el mismo que asigna Identity;
 * por eso es PrimaryColumn (no autogenerado) y se llena desde el evento
 * `identity.user.registered`.
 */
@Entity('wallet_users')
export class WalletUser {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  email: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  wallet: Wallet;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
