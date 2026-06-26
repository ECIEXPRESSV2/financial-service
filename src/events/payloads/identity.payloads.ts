// TODO: alinear con el contrato definitivo del event catalog.
// Por ahora solo se declaran los campos mínimos que este servicio necesita.

/** Payload de `identity.user.registered`. */
export interface UserRegisteredPayload {
  userId: string;
  email: string;
}

/** Payload de `identity.user.deactivated`. */
export interface UserDeactivatedPayload {
  userId: string;
}

/** Payload de `identity.store.created` e `identity.store.updated`. */
export interface StoreUpsertedPayload {
  storeId: string;
  /** Identity lo envía, pero financial ya no espeja el nombre del negocio. */
  name?: string;
}

/** Payload de `identity.store.status_changed` (lo emite identity con estos campos). */
export interface StoreStatusChangedPayload {
  storeId: string;
  /** Estado anterior de la tienda. */
  previousStatus?: string;
  /** Estado nuevo: OPEN, TEMPORARILY_CLOSED, CLOSED, ... */
  newStatus: string;
  /** Motivo del cambio, si lo hay. */
  reason?: string;
}
