import { registerAs } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import { join } from 'path';
import { WalletUser } from '../wallets/entities/wallet-user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { WalletTopup } from '../topups/entities/wallet-topup.entity';
import { Store } from '../stores/entities/store.entity';
import { OrderTransaction } from '../transactions/entities/order-transaction.entity';

/**
 * Configuración de TypeORM para PostgreSQL en NeonDB.
 *
 * Reglas obligatorias:
 * - synchronize SIEMPRE en false: las tablas solo se crean/alteran via migraciones CLI.
 * - autoLoadEntities NO se usa: las entidades se registran explícitamente.
 */
export const databaseConfig = registerAs(
  'database',
  (): DataSourceOptions => ({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // NeonDB requiere SSL (sslmode=require)
    entities: [WalletUser, Wallet, WalletTopup, Store, OrderTransaction],
    migrations: [join(__dirname, '..', 'database', 'migrations', '*{.ts,.js}')],
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
  }),
);
