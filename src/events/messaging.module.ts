import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE_NAME } from '../config/rabbitmq.config';
import { EventPublisherService } from './event-publisher.service';

/**
 * Módulo global del bus de eventos. Configura la conexión a RabbitMQ (CloudAMQP) y
 * declara el exchange topic compartido `eciexpress_events`.
 *
 * Se marca @Global para que tanto `AmqpConnection` (usada por los @RabbitSubscribe del
 * consumidor) como `EventPublisherService` estén disponibles en todos los módulos sin
 * tener que reimportar RabbitMQModule. La URL de conexión llega por `RABBITMQ_URL`.
 */
@Global()
@Module({
  imports: [
    RabbitMQModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('RABBITMQ_URL'),
        exchanges: [
          {
            name: EXCHANGE_NAME,
            type: 'topic',
            createExchangeIfNotExists: true,
            options: { durable: true },
          },
        ],
        // No bloquea el arranque si CloudAMQP no responde de inmediato; el
        // connection-manager reintenta y reasienta las colas/bindings al reconectar.
        connectionInitOptions: { wait: false },
      }),
    }),
  ],
  providers: [EventPublisherService],
  exports: [RabbitMQModule, EventPublisherService],
})
export class MessagingModule {}
