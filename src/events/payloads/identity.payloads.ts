// TODO: alinear con el contrato definitivo del event catalog.
// Por ahora solo se declaran los campos mínimos que este servicio necesita.

/** Payload de `identity.user.registered`. */
export interface UserRegisteredPayload {
  userId: string;
  email: string;
}

/** Payload de `identity.user.deleted`. */
export interface UserDeletedPayload {
  userId: string;
}

/** Payload de `identity.store.created` e `identity.store.updated`. */
export interface StoreUpsertedPayload {
  storeId: string;
  name: string;
}

/** Payload de `identity.store.deleted`. */
export interface StoreDeletedPayload {
  storeId: string;
}
