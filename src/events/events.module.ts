import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WalletsModule } from '../wallets/wallets.module';
import { StoresModule } from '../stores/stores.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { EventConsumerService } from './event-consumer.service';
import { ServiceBusSubscriberService } from './service-bus-subscriber.service';

/**
 * Registra el consumidor del bus y el suscriptor de Service Bus que lo alimenta.
 * Importa los módulos de dominio para inyectar sus servicios en el dispatcher. El
 * publisher y el ServiceBusClient viven en MessagingModule (global).
 */
@Module({
  imports: [ConfigModule, WalletsModule, StoresModule, TransactionsModule],
  providers: [EventConsumerService, ServiceBusSubscriberService],
})
export class EventsModule {}
