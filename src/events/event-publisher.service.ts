import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGE_NAME } from '../config/rabbitmq.config';

/**
 * Publica los eventos de dominio de este servicio sobre el exchange topic compartido
 * `eciexpress_events`. Cada payload incluye los ids relevantes, los montos en centavos
 * y un timestamp ISO.
 */
@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(private readonly amqp: AmqpConnection) {}

  /**
   * Emite un evento al exchange compartido con la routing key indicada. Se añade
   * automáticamente `timestamp` (ISO) si el payload no lo trae.
   */
  async publish<T extends Record<string, unknown>>(
    routingKey: string,
    payload: T,
  ): Promise<void> {
    const message = {
      ...payload,
      timestamp: payload.timestamp ?? new Date().toISOString(),
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
