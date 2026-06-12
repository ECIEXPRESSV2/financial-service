import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletTopup } from './entities/wallet-topup.entity';
import { TopupsService } from './topups.service';
import { TopupsController } from './topups.controller';
import { WebhooksController } from './webhooks.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { WompiModule } from '../wompi/wompi.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WalletTopup]),
    WalletsModule,
    WompiModule,
  ],
  controllers: [TopupsController, WebhooksController],
  providers: [TopupsService],
  exports: [TopupsService],
})
export class TopupsModule {}
