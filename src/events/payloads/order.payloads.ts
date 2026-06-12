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
