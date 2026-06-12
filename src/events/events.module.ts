import { Module } from '@nestjs/common';
import { WalletsModule } from '../wallets/wallets.module';
import { StoresModule } from '../stores/stores.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { EventConsumerService } from './event-consumer.service';

/**
 * Registra el consumidor del bus. Importa los módulos de dominio para inyectar sus
 * servicios en el dispatcher. El publisher y la conexión viven en MessagingModule
 * (global), por lo que aquí no se reimportan.
 */
@Module({
  imports: [WalletsModule, StoresModule, TransactionsModule],
  providers: [EventConsumerService],
})
export class EventsModule {}
