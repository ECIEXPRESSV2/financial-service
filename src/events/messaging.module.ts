import {
  Global,
  Inject,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServiceBusClient } from '@azure/service-bus';
import { DefaultAzureCredential } from '@azure/identity';
import { EventPublisherService } from './event-publisher.service';

/**
 * Token de inyección del ServiceBusClient compartido (sender y receiver).
 */
export const SERVICE_BUS_CLIENT = Symbol('SERVICE_BUS_CLIENT');

/**
 * Módulo global del bus de eventos (Azure Service Bus). Crea un único `ServiceBusClient`
 * autenticado con Managed Identity (DefaultAzureCredential) contra el FQDN del namespace,
 * y expone `EventPublisherService`. Reemplaza al RabbitMQModule (@golevelup/amqplib).
 *
 * Es @Global para que el cliente y el publisher estén disponibles sin reimportar. La
 * conexión se cierra al apagar la app.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SERVICE_BUS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ServiceBusClient => {
        const fqns = config.getOrThrow<string>(
          'serviceBus.fullyQualifiedNamespace',
        );
        return new ServiceBusClient(fqns, new DefaultAzureCredential());
      },
    },
    EventPublisherService,
  ],
  exports: [SERVICE_BUS_CLIENT, EventPublisherService],
})
export class MessagingModule implements OnApplicationShutdown {
  constructor(
    @Inject(SERVICE_BUS_CLIENT) private readonly client: ServiceBusClient,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.close();
  }
}
