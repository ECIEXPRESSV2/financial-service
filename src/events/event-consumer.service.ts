import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import type { ConsumeMessage } from 'amqplib';
import { QUEUE_NAME, EXCHANGE_NAME } from '../config/rabbitmq.config';
import { ConsumedEvents, BINDING_PATTERNS } from './event-patterns';
import { WalletsService } from '../wallets/wallets.service';
import { StoresService } from '../stores/stores.service';
import { TransactionsService } from '../transactions/transactions.service';
import {
  UserRegisteredPayload,
  UserDeletedPayload,
  StoreUpsertedPayload,
  StoreDeletedPayload,
} from './payloads/identity.payloads';
import {
  OrderCreatedPayload,
  OrderCancelledPayload,
  ReturnConfirmedPayload,
} from './payloads/order.payloads';
import { DeliveryConfirmedPayload } from './payloads/fulfillment.payloads';

/**
 * Único punto de consumo del bus. Enlaza la cola propia `financial_service_queue` al
 * exchange topic compartido con los tres patrones comodín requeridos (`identity.#`,
 * `order.#`, `fulfillment.#`) y despacha cada mensaje al servicio de dominio según su
 * routing key concreta.
 *
 * Los handlers de cada servicio son idempotentes: verifican si el registro ya existe
 * antes de procesar, porque los eventos pueden llegar duplicados.
 */
@Injectable()
export class EventConsumerService {
  private readonly logger = new Logger(EventConsumerService.name);

  constructor(
    private readonly walletsService: WalletsService,
    private readonly storesService: StoresService,
    private readonly transactionsService: TransactionsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_NAME,
    routingKey: BINDING_PATTERNS, // ['identity.#', 'order.#', 'fulfillment.#']
    queue: QUEUE_NAME,
    queueOptions: { durable: true },
    createQueueIfNotExists: true,
  })
  async handleEvent(payload: unknown, amqpMsg: ConsumeMessage): Promise<void> {
    const routingKey = amqpMsg.fields.routingKey;
    this.logger.log(`Evento recibido: ${routingKey}`);

    try {
      switch (routingKey) {
        case ConsumedEvents.USER_REGISTERED:
          await this.walletsService.handleUserRegistered(
            payload as UserRegisteredPayload,
          );
          break;
        case ConsumedEvents.USER_DELETED:
          await this.walletsService.handleUserDeleted(
            payload as UserDeletedPayload,
          );
          break;
        case ConsumedEvents.STORE_CREATED:
          await this.storesService.handleStoreCreated(
            payload as StoreUpsertedPayload,
          );
          break;
        case ConsumedEvents.STORE_UPDATED:
          await this.storesService.handleStoreUpdated(
            payload as StoreUpsertedPayload,
          );
          break;
        case ConsumedEvents.STORE_DELETED:
          await this.storesService.handleStoreDeleted(
            payload as StoreDeletedPayload,
          );
          break;
        case ConsumedEvents.ORDER_CREATED:
          await this.transactionsService.handleOrderCreated(
            payload as OrderCreatedPayload,
          );
          break;
        case ConsumedEvents.ORDER_CANCELLED:
          await this.transactionsService.handleOrderCancelled(
            payload as OrderCancelledPayload,
          );
          break;
        case ConsumedEvents.RETURN_CONFIRMED:
          await this.transactionsService.handleReturnConfirmed(
            payload as ReturnConfirmedPayload,
          );
          break;
        case ConsumedEvents.DELIVERY_CONFIRMED:
          await this.transactionsService.handleDeliveryConfirmed(
            payload as DeliveryConfirmedPayload,
          );
          break;
        default:
          // Otros eventos de los dominios identity/order/fulfillment que no nos
          // interesan: se ignoran silenciosamente (la cola los recibe por el comodín).
          this.logger.debug(`Routing key ignorada: ${routingKey}`);
      }
    } catch (error) {
      // Se loguea y se deja terminar (ack) para no reencolar indefinidamente un
      // evento que falla por datos. Los handlers ya son idempotentes y atómicos.
      this.logger.error(
        `Error procesando ${routingKey}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
