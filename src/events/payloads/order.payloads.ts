// TODO: alinear con el contrato definitivo del event catalog.
// Por ahora solo se declaran los campos mínimos que este servicio necesita.

/** Payload de `order.order.created`. `totalAmount` viene en centavos COP. */
export interface OrderCreatedPayload {
  orderId: string;
  buyerId: string;
  storeId: string;
  totalAmount: number;
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
