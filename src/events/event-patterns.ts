/**
 * Routing keys del bus de eventos de ECIExpress.
 *
 * Todos los servicios publican sobre el exchange topic compartido `eciexpress_events`.
 * Este servicio se enlaza con los patrones `identity.#`, `order.#` y `fulfillment.#`,
 * pero solo reacciona a las routing keys concretas listadas como CONSUMED.
 */

// Eventos que este servicio CONSUME.
export const ConsumedEvents = {
  USER_REGISTERED: 'identity.user.registered',
  USER_DELETED: 'identity.user.deleted',
  STORE_CREATED: 'identity.store.created',
  STORE_UPDATED: 'identity.store.updated',
  STORE_DELETED: 'identity.store.deleted',
  ORDER_CREATED: 'order.order.created',
  ORDER_CANCELLED: 'order.order.cancelled',
  DELIVERY_CONFIRMED: 'fulfillment.delivery.confirmed',
} as const;

// Eventos que este servicio PUBLICA.
export const PublishedEvents = {
  PAYMENT_PROCESSED: 'financial.payment.processed',
  PAYMENT_FAILED: 'financial.payment.failed',
  PAYMENT_RELEASED: 'financial.payment.released',
  REFUND_ISSUED: 'financial.refund.issued',
  WALLET_TOPUP_APPROVED: 'financial.wallet.topup.approved',
} as const;

// Patrones de binding de la cola propia al exchange compartido.
export const BINDING_PATTERNS = ['identity.#', 'order.#', 'fulfillment.#'];
