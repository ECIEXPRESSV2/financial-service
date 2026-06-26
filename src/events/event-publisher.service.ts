import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE_NAME } from '../config/rabbitmq.config';

/**
 * Publica los eventos de dominio de este servicio sobre el exchange topic compartido
 * `eciexpress_events`. Los campos de negocio (ids, montos en centavos, ...) van planos
 * en el primer nivel; este publisher añade la metadata estándar del bus.
 */
@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(private readonly amqp: AmqpConnection) {}

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
      await this.amqp.publish(EXCHANGE_NAME, routingKey, message);
      this.logger.log(`Evento publicado: ${routingKey}`);
    } catch (error) {
      // No interrumpimos el flujo de negocio si el bus falla momentáneamente; el
      // estado ya quedó persistido en la base de datos y se puede reconciliar.
      this.logger.error(
        `Error publicando evento ${routingKey}: ${(error as Error).message}`,
      );
    }
  }
}
