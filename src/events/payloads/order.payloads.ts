// TODO: alinear con el contrato definitivo del event catalog.
// Por ahora solo se declaran los campos mínimos que este servicio necesita.

/**
 * Payload de `order.order.created`. Montos en centavos COP. orders-service fija el recargo
 * de hora pico en el checkout y envía el desglose; financial cobra `orderAmount + peakFeeAmount`
 * sin recalcular el pico. `orderAmount`/`peakFeeAmount`/`isPeakHour` son opcionales por
 * retrocompatibilidad con eventos viejos (que solo traían `totalAmount` como base).
 */
export interface OrderCreatedPayload {
  orderId: string;
  buyerId: string;
  storeId: string;
  /** Total del pedido (con hora pico) = orderAmount + peakFeeAmount. */
  totalAmount: number;
  /** Valor de los productos (base para la comisión de plataforma). */
  orderAmount?: number;
  /** Recargo de hora pico que paga el comprador (0 si no aplica). */
  peakFeeAmount?: number;
  /** true si el checkout cayó en hora pico. */
  isPeakHour?: boolean;
}

/** Payload de `order.order.cancelled`. */
export interface OrderCancelledPayload {
  orderId: string;
}

/**
 * Payload de `order.return.confirmed`: orders-service autoriza el reembolso de una
 * devolución (total o parcial) con el monto que products-service ya cotizó.
 * `refundAmount` va en centavos COP.
 */
export interface ReturnConfirmedPayload {
  orderId: string;
  buyerId: string;
  storeId: string;
  full: boolean;
  refundAmount: number;
}
