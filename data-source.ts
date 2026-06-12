import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { WalletUser } from './src/wallets/entities/wallet-user.entity';
import { Wallet } from './src/wallets/entities/wallet.entity';
import { WalletTopup } from './src/topups/entities/wallet-topup.entity';
import { Store } from './src/stores/entities/store.entity';
import { OrderTransaction } from './src/transactions/entities/order-transaction.entity';

dotenv.config();

/**
 * DataSource para el CLI de TypeORM (migration:generate / run / revert).
 * synchronize SIEMPRE en false: las tablas se crean exclusivamente con migraciones.
 */
const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  entities: [WalletUser, Wallet, WalletTopup, Store, OrderTransaction],
  migrations: ['src/database/migrations/*{.ts,.js}'],
  synchronize: false,
});

export default AppDataSource;
