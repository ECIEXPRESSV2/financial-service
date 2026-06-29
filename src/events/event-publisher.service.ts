import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ServiceBusClient, ServiceBusSender } from '@azure/service-bus';
import { SERVICE_BUS_CLIENT } from './service-bus.tokens';

/**
 * Publica los eventos de dominio de este servicio sobre el topic compartido
 * `eciexpress_events` (Azure Service Bus). Los campos de negocio (ids, montos en
 * centavos, ...) van planos en el primer nivel; este publisher añade la metadata
 * estándar del bus. El tipo de evento (routing key) viaja como el `subject` del mensaje.
 */
@Injectable()
export class EventPublisherService implements OnModuleDestroy {
  private readonly logger = new Logger(EventPublisherService.name);
  private readonly sender: ServiceBusSender;

  constructor(
    @Inject(SERVICE_BUS_CLIENT) private readonly client: ServiceBusClient,
  ) {
    this.sender = this.client.createSender(
      process.env.SERVICE_BUS_TOPIC ?? 'eciexpress_events',
    );
  }

  /**
   * Emite un evento al exchange compartido con la routing key indicada. Envuelve el
   * payload de negocio en el sobre estándar uniforme: `occurredAt`, `source`,
   * `idempotencyKey`, `eventVersion` y `correlationId`. El tipo de evento lo identifica
   * la routing key, no se duplica en el cuerpo.
   */
  async publish<T extends Record<string, unknown>>(
    routingKey: string,
    payload: T,
  ): Promise<void> {
    const message = {
      ...payload,
      occurredAt:
        (payload.occurredAt as string | undefined) ?? new Date().toISOString(),
      source: 'financial-service',
      idempotencyKey:
        (payload.idempotencyKey as string | undefined) ?? randomUUID(),
      eventVersion: (payload.eventVersion as number | undefined) ?? 1,
      correlationId: (payload.correlationId as string | undefined) ?? null,
    };

    try {
      await this.sender.sendMessages({
        body: message,
        subject: routingKey,
        applicationProperties: { routingKey },
      });
      this.logger.log(`Evento publicado: ${routingKey}`);
    } catch (error) {
      // No interrumpimos el flujo de negocio si el bus falla momentáneamente; el
      // estado ya quedó persistido en la base de datos y se puede reconciliar.
      this.logger.error(
        `Error publicando evento ${routingKey}: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.sender.close();
  }
}
