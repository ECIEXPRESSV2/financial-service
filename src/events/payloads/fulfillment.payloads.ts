// TODO: alinear con el contrato definitivo del event catalog.
// Por ahora solo se declaran los campos mínimos que este servicio necesita.

/** Payload de `fulfillment.delivery.confirmed`. */
export interface DeliveryConfirmedPayload {
  orderId: string;
}
