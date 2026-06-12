import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderTransaction } from './entities/order-transaction.entity';
import { TransactionsService } from './transactions.service';
import { WalletTransactionsController } from './wallet-transactions.controller';
import { PayoutsController } from './payouts.controller';
import { AdminTransactionsController } from './admin-transactions.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { StoresModule } from '../stores/stores.module';
import { PayoutsModule } from '../payouts/payouts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderTransaction]),
    WalletsModule,
    StoresModule,
    PayoutsModule,
  ],
  controllers: [
    WalletTransactionsController,
    PayoutsController,
    AdminTransactionsController,
  ],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
