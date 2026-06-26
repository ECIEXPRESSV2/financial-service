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
  // Identity no emite `*.deleted`; reaccionamos a la desactivación del usuario.
  USER_DEACTIVATED: 'identity.user.deactivated',
  STORE_CREATED: 'identity.store.created',
  STORE_UPDATED: 'identity.store.updated',
  // Identity no emite `store.deleted`; reaccionamos al cambio de estado de la tienda
  // (el handler puede inspeccionar el status dentro del payload si necesita distinguir cierres).
  STORE_STATUS_CHANGED: 'identity.store.status_changed',
  ORDER_CREATED: 'order.order.created',
  ORDER_CANCELLED: 'order.order.cancelled',
  // orders autoriza el reembolso (total/parcial) tras la cotización de products.
  RETURN_CONFIRMED: 'order.return.confirmed',
  DELIVERY_CONFIRMED: 'fulfillment.delivery.confirmed',
} as const;

// Eventos que este servicio PUBLICA.
export const PublishedEvents = {
  PAYMENT_PROCESSED: 'financial.payment.processed',
  PAYMENT_FAILED: 'financial.payment.failed',
  PAYMENT_RELEASED: 'financial.payment.released',
  REFUND_ISSUED: 'financial.refund.issued',
  WALLET_TOPUP_APPROVED: 'financial.wallet.topup.approved',
  WALLET_TOPUP_FAILED: 'financial.wallet.topup.failed',
} as const;

// Patrones de binding de la cola propia al exchange compartido.
export const BINDING_PATTERNS = ['identity.#', 'order.#', 'fulfillment.#'];
