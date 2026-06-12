# Instrucciones para Claude Code — financial-service de ECIExpress (versión definitiva)

## Contexto del proyecto

Estás construyendo el microservicio `financial-service` de **ECIExpress**, un marketplace
universitario para la Universidad Escuela Colombiana de Ingeniería. La plataforma tiene 8
microservicios desplegados en Render que se comunican de forma asíncrona mediante un bus de
eventos en CloudAMQP (RabbitMQ).

El repositorio ya tiene:
- Scaffold base de NestJS con TypeScript
- Endpoint `GET /health`
- Swagger configurado (auto-apertura via singleton browser lock file)
- Puerto asignado: 3004

**Stack obligatorio:**
- NestJS, TypeScript
- PostgreSQL en NeonDB (`DATABASE_URL`)
- TypeORM SIN sincronización automática. Tablas solo via migraciones CLI
- Bus de eventos: RabbitMQ en CloudAMQP via `@nestjs/microservices` con `Transport.RMQ`
- Pasarela de pagos: Wompi en modo sandbox
- Despliegue: Render

## Modelo de negocio decidido (no lo cambies ni lo cuestiones)

1. **Billetera interna de créditos**. Cada comprador tiene una billetera con saldo en pesos
   colombianos (almacenado en centavos como entero). La billetera se recarga via Wompi con
   Nequi, Daviplata, PSE, Bre-B o tarjeta. Las órdenes se pagan exclusivamente con saldo de
   la billetera.
2. **Sin reembolsos de recargas**. Una vez recargado el saldo, no se devuelve a la cuenta
   bancaria del usuario. Deja este comentario en el código del endpoint de recarga:
   `// IMPORTANTE FRONTEND: antes de recargar, mostrar un modal de confirmación que advierta que las recargas no tienen reembolso y preguntar si está seguro de realizar la acción.`
3. **ECIExpress es el intermediario financiero** (cuenta propia que recibe recargas y
   desembolsa a los negocios). Deja este comentario en `WompiService`:
   `// NOTA LEGAL: este modelo retiene dinero de usuarios y lo desembolsa a terceros. Para operar con dinero real en producción, ECIExpress debe estar regulada bajo la normativa financiera colombiana (SFC). En sandbox no aplica.`
4. **Comisiones en dos partes, ambas porcentuales y configurables por negocio**:
   - `platform_fee_percent`: porcentaje que ECIExpress retiene al negocio en cada orden al
     momento del desembolso. El comprador no la ve.
   - `peak_fee_percent`: porcentaje adicional que paga el comprador solo si la orden se crea
     dentro de la franja de horas pico configurada para ese negocio.
   - Ambas las administra un administrador de ECIExpress via endpoints `/admin`.
5. **Cuenta de desembolso por negocio**: cada negocio registra dónde recibe su dinero
   (Nequi, Daviplata o cuenta bancaria). Es editable via endpoint PATCH.
6. **Retención hasta entrega**: al pagar una orden el dinero queda en estado HELD. Cuando
   Fulfillment confirma la entrega pasa a RELEASED y se desembolsa al negocio descontando la
   comisión de plataforma. Si la orden se cancela pasa a REFUNDED y el saldo regresa
   completo a la billetera (incluida la peak fee).

## Reglas técnicas obligatorias

1. NUNCA uses `synchronize: true` ni `autoLoadEntities: true` en TypeORM. Entidades
   registradas explícitamente, tablas creadas solo con migraciones.
2. NUNCA guardes datos crudos de tarjetas. Solo tokens de Wompi.
3. Todos los montos en centavos COP como `bigint`. Usa un `ValueTransformer` de TypeORM
   para convertir el string que devuelve PostgreSQL a number.
4. Los porcentajes de comisión como `decimal(5,2)`.
5. El `userId` y el `storeId` llegan en headers `x-user-id` y `x-store-id` inyectados por
   el API Gateway. Este servicio no valida JWT ni llama a otros servicios por HTTP.
6. Este servicio NUNCA llama a otro microservicio por HTTP ni se conecta a otra base de
   datos. Toda información externa llega por eventos del bus.
7. Operaciones sobre el saldo de la billetera deben ser atómicas y a prueba de
   concurrencia. Para debitar usa un UPDATE condicional del tipo
   `UPDATE wallets SET balance = balance - $1 WHERE id = $2 AND balance >= $1` y verifica
   filas afectadas, o usa un lock pesimista dentro de una transacción de base de datos.
8. Todos los handlers de eventos deben ser idempotentes. Antes de procesar verifica si ya
   existe el registro (por `order_id`, por `wompi_transaction_id`, por `id` del negocio,
   según el caso). Los eventos pueden llegar duplicados.
9. Nombres de código en inglés, comentarios en español.
10. Cada cambio de estado de una transacción se registra con su timestamp correspondiente.

## Arquitectura del bus de eventos

La app es híbrida: HTTP normal más consumidor RabbitMQ.

- Exchange compartido de toda la plataforma: `eciexpress_events`, tipo `topic`, durable.
- Cola propia de este servicio: `financial_service_queue`, durable.
- Este servicio necesita recibir eventos cuyos routing keys empiecen con `identity.`,
  `order.` y `fulfillment.`.

Configura el consumidor en `main.ts` con `Transport.RMQ`. Las versiones recientes de
`@nestjs/microservices` soportan exchanges de tipo topic con las opciones `exchange`,
`exchangeType` y `wildcards: true`, donde los patrones de `@EventPattern` actúan como
routing keys con comodines. Verifica la versión instalada de `@nestjs/microservices` y su
documentación antes de implementar. Si la versión instalada no soporta estas opciones,
usa la librería `@golevelup/nestjs-rabbitmq` para declarar el exchange topic, la cola y
los bindings `identity.#`, `order.#` y `fulfillment.#` desde código al arrancar. En
cualquiera de los dos casos el resultado debe ser: cola propia enlazada al exchange
`eciexpress_events` con esos tres patrones.

La URL de conexión llega en la variable de entorno `RABBITMQ_URL`. No la escribas en el
código fuente bajo ninguna circunstancia.

### Eventos que este servicio CONSUME

| Routing key | Acción |
|---|---|
| `identity.user.registered` | Crear registro en `wallet_users` y crear su `wallet` con saldo 0 |
| `identity.user.deleted` | Desactivar `wallet_users.is_active` y `wallets.is_active` |
| `identity.store.created` | Crear proyección local en `stores` con comisiones por defecto |
| `identity.store.updated` | Actualizar nombre y datos generales de la proyección local |
| `identity.store.deleted` | Desactivar `stores.is_active` y congelar desembolsos pendientes |
| `order.order.created` | Cobrar la orden desde la billetera, crear transacción HELD |
| `order.order.cancelled` | Reembolsar el total cobrado a la billetera, estado REFUNDED |
| `fulfillment.delivery.confirmed` | Liberar el pago, estado RELEASED, registrar desembolso |

Como los payloads exactos de los eventos de otros servicios aún no están definidos, crea
interfaces TypeScript en `src/events/payloads/` con los campos mínimos que este servicio
necesita y un comentario `// TODO: alinear con el contrato definitivo del event catalog`.
Campos mínimos esperados:
- user.registered: `{ userId, email }`
- store.created/updated: `{ storeId, name }`
- order.created: `{ orderId, buyerId, storeId, totalAmount }` (totalAmount en centavos)
- order.cancelled: `{ orderId }`
- delivery.confirmed: `{ orderId }`

### Eventos que este servicio PUBLICA

Registra un `ClientProxy` con `ClientsModule` apuntando al mismo exchange y emite:

| Routing key | Cuándo |
|---|---|
| `financial.payment.processed` | Orden cobrada con éxito (HELD creado) |
| `financial.payment.failed` | Saldo insuficiente u otro fallo al cobrar |
| `financial.payment.released` | Pago liberado al negocio tras entrega |
| `financial.refund.issued` | Reembolso a billetera por cancelación |
| `financial.wallet.topup.approved` | Recarga aprobada por Wompi |

Incluye en cada payload: ids relevantes, montos en centavos, y timestamp ISO.

## Modelo de datos (5 tablas)

### wallet_users (proyección local de compradores)
```
id          uuid PK (mismo id que Identity)
email       varchar
is_active   boolean default true
created_at, updated_at
```

### wallets
```
id          uuid PK
user_id     uuid unique (FK lógica a wallet_users, no FK física a otro servicio)
balance     bigint default 0 (centavos COP, nunca negativo)
is_active   boolean default true
created_at, updated_at
```

### wallet_topups
```
id                    uuid PK
wallet_id             uuid
amount                bigint (centavos)
payment_method        enum: NEQUI, DAVIPLATA, PSE, BREB, CARD
status                enum: PENDING, APPROVED, FAILED
wompi_transaction_id  varchar unique nullable
wompi_response        jsonb nullable
created_at, updated_at
```

### stores (proyección local de negocios más configuración financiera)
```
id                     uuid PK (mismo id que Identity)
name                   varchar
is_active              boolean default true

platform_fee_percent   decimal(5,2) default desde env DEFAULT_PLATFORM_FEE_PERCENT
peak_fee_percent       decimal(5,2) default desde env DEFAULT_PEAK_FEE_PERCENT
peak_hours_start       time nullable (ej 11:30)
peak_hours_end         time nullable (ej 14:00)
peak_days              text[] nullable (ej {MON,TUE,WED,THU,FRI})

payout_type            enum nullable: NEQUI, DAVIPLATA, BANK_ACCOUNT
payout_account_number  varchar nullable
payout_bank_code       varchar nullable
payout_holder_name     varchar nullable

created_at, updated_at
```

### order_transactions
```
id                   uuid PK
order_id             varchar unique (idempotencia)
wallet_id            uuid
store_id             uuid

order_amount         bigint  (valor del pedido)
peak_fee_amount      bigint  (0 si no es hora pico)
total_charged        bigint  (order_amount + peak_fee_amount, lo debitado del wallet)
platform_fee_amount  bigint  (retención de ECIExpress al negocio)
store_payout_amount  bigint  (order_amount - platform_fee_amount)

status               enum: PENDING, HELD, RELEASED, REFUNDED, FAILED
is_peak_hour         boolean
failure_reason       varchar nullable (ej INSUFFICIENT_FUNDS)

held_at, released_at, refunded_at  timestamps nullable
created_at, updated_at
```

La zona horaria para evaluar horas pico es America/Bogota. Evalúa contra la hora de
creación de la orden en esa zona, no en UTC.

## Endpoints REST

### Billetera (comprador, header x-user-id)
```
GET    /wallet                  → saldo y estado de mi billetera
GET    /wallet/topups           → historial de recargas
GET    /wallet/transactions     → historial de pagos de órdenes
POST   /wallet/topups           → iniciar recarga
       body: { amount (centavos), paymentMethod }
       crea el topup PENDING, crea la transacción en Wompi y devuelve los datos
       necesarios para que el front complete el pago.
       Incluye aquí el comentario del modal sin reembolsos.
```

### Webhook de Wompi (público, sin auth de gateway)
```
POST   /webhooks/wompi
       Recibe los eventos de Wompi. Valida la firma del evento usando
       WOMPI_EVENTS_SECRET según la documentación oficial de Wompi (el evento llega
       con un checksum SHA256 de propiedades concatenadas más el secreto, en
       signature.checksum). Rechaza con 401 si la firma no es válida.
       Si transaction.status es APPROVED: marcar topup APPROVED y acreditar el saldo
       en la billetera de forma atómica e idempotente (si el topup ya está APPROVED,
       responder 200 sin reprocesar). Si es DECLINED o ERROR: marcar FAILED.
       Siempre responder 200 rápido, procesar en el servicio.
       El saldo SOLO se acredita desde este webhook, nunca al crear el topup.
```

### Administración (header x-user-id de un admin; por ahora solo deja un guard
placeholder con comentario TODO para validar rol admin cuando Identity lo defina)
```
PATCH  /admin/stores/:storeId/commission-config
       body: { platformFeePercent?, peakFeePercent?, peakHoursStart?, peakHoursEnd?, peakDays? }
GET    /admin/stores/:storeId/transactions    → trazabilidad por negocio
GET    /admin/transactions                    → todas, con filtros por estado y fechas
```

### Negocio (header x-store-id)
```
PATCH  /stores/payout-account
       body: { type, accountNumber, bankCode?, holderName }
GET    /stores/payouts          → desembolsos recibidos y pendientes del negocio
```

Todos los endpoints documentados en Swagger con ejemplos y todos los DTOs con
class-validator.

## Lógica de cobro de una orden (handler de order.order.created)

1. Verificar idempotencia por `order_id`.
2. Cargar el store. Si no existe o está inactivo, crear transacción FAILED con razón y
   publicar `financial.payment.failed`.
3. Determinar si la hora actual en America/Bogota cae dentro de la franja pico del store
   (día incluido en peak_days y hora entre start y end). Calcular `peak_fee_amount`
   redondeando al centavo entero más cercano.
4. Calcular `total_charged`, `platform_fee_amount` y `store_payout_amount`.
5. Debitar `total_charged` del wallet con UPDATE condicional atómico. Si no alcanza el
   saldo, transacción FAILED con `INSUFFICIENT_FUNDS` y publicar `financial.payment.failed`.
6. Crear la transacción HELD con todos los montos desglosados y publicar
   `financial.payment.processed`.

## Lógica de liberación (handler de fulfillment.delivery.confirmed)

1. Buscar transacción HELD por order_id. Si no existe, log warning y terminar.
2. Pasar a RELEASED con `released_at`.
3. Registrar en log el desembolso de `store_payout_amount` a la cuenta payout del store.
   Crea un `PayoutService` con un método `disburse(storeId, amount)` que en sandbox solo
   loguea y guarda el resultado. Comentario:
   `// TODO PRODUCCION: ejecutar la transferencia real desde la cuenta de ECIExpress mediante Wompi. Requiere operacion regulada.`
4. Publicar `financial.payment.released`.

## Lógica de reembolso (handler de order.order.cancelled)

1. Buscar transacción HELD por order_id. Si está RELEASED, log warning y no reembolsar
   (la entrega ya ocurrió). Si no existe, log y terminar.
2. Acreditar `total_charged` de vuelta al wallet de forma atómica.
3. Pasar a REFUNDED con `refunded_at` y publicar `financial.refund.issued`.

## Integración con Wompi (sandbox)

Crea `WompiService` con:
- `getAcceptanceToken()`: GET `/merchants/:publicKey`, devuelve el acceptance_token.
- `createTopupTransaction(...)`: POST `/transactions` con amount_in_cents, currency COP,
  customer_email, payment_method según el tipo, y reference única (usa el id del topup).
- `getTransactionStatus(id)`: GET `/transactions/:id`.
- `verifyWebhookSignature(event)`: implementa la validación del checksum según la
  documentación oficial de Wompi para eventos.

URL base sandbox: `https://sandbox.wompi.co/v1`. Llaves con prefijo `pub_test_` y
`prv_test_`. Consulta la documentación oficial en docs.wompi.co para los campos exactos
de cada método de pago (Nequi y PSE tienen estructuras distintas en payment_method).
Si Bre-B no está disponible en el sandbox de Wompi, déjalo en el enum con un comentario
TODO y no lo implementes en el checkout.

## Estructura de carpetas

```
src/
├── config/            database.config.ts, wompi.config.ts, rabbitmq.config.ts
├── common/
│   ├── decorators/    current-user.decorator.ts, current-store.decorator.ts
│   ├── guards/        admin.guard.ts (placeholder con TODO)
│   └── transformers/  bigint.transformer.ts
├── events/
│   ├── payloads/      interfaces de los eventos consumidos
│   ├── event-patterns.ts
│   └── event-publisher.service.ts
├── wallets/           entidad, servicio, controlador, módulo (wallets y wallet_users)
├── topups/            entidad, servicio, controlador, módulo, webhook controller
├── stores/            entidad, servicio, controladores (negocio y admin), módulo
├── transactions/      entidad, servicio, controladores, módulo, event handlers
├── payouts/           payout.service.ts
├── wompi/             wompi.service.ts, módulo
└── database/migrations/
data-source.ts (raíz, para el CLI de TypeORM)
```

## Migraciones

Scripts en package.json para typeorm CLI con data-source.ts (migration:generate,
migration:run, migration:revert). Genera una migración inicial con las 5 tablas, sus
enums e índices (índice en wallets.user_id, order_transactions.order_id unique,
order_transactions.store_id, wallet_topups.wompi_transaction_id unique). Ejecuta la
migración y verifica contra NeonDB.

## Variables de entorno

Crea `.env.example` con todas las variables y asegúrate de que `.env` esté en
`.gitignore`. Al finalizar, lista en tu resumen final cuáles variables quedaron
pendientes de valor real por parte del usuario.

```
DATABASE_URL=                        # NeonDB, con sslmode=require
RABBITMQ_URL=                        # CloudAMQP, formato amqps://user:pass@host/vhost
WOMPI_PUBLIC_KEY=                    # pub_test_...
WOMPI_PRIVATE_KEY=                   # prv_test_...
WOMPI_EVENTS_SECRET=                 # secreto de eventos para validar webhooks
DEFAULT_PLATFORM_FEE_PERCENT=5
DEFAULT_PEAK_FEE_PERCENT=3
NODE_ENV=development
PORT=3004
TZ=America/Bogota
```

## Verificación final

1. `npm run start:dev` levanta sin errores en el puerto 3004, conecta a NeonDB y a
   CloudAMQP, y en el panel de CloudAMQP aparecen el exchange `eciexpress_events` y la
   cola `financial_service_queue` con los bindings `identity.#`, `order.#`,
   `fulfillment.#`.
2. Swagger muestra todos los endpoints.
3. Publicando manualmente desde el panel de CloudAMQP un evento de prueba
   `identity.user.registered`, se crean el wallet_user y su wallet en la base de datos.
4. Publicando `identity.store.created`, se crea el store con comisiones por defecto.
5. `POST /wallet/topups` crea el topup PENDING y la transacción en Wompi sandbox.
6. Simulando el webhook de Wompi con un APPROVED firmado, el saldo se acredita una sola
   vez aunque el webhook llegue dos veces.
7. Publicando `order.order.created` con saldo suficiente, se debita el saldo, se crea la
   transacción HELD con el desglose de comisiones correcto, y se publica
   `financial.payment.processed` (visible en el panel de CloudAMQP).
8. Publicando `order.order.created` sin saldo suficiente, la transacción queda FAILED con
   INSUFFICIENT_FUNDS y el saldo no cambia.
9. Publicando `fulfillment.delivery.confirmed`, la transacción pasa a RELEASED.
10. Publicando `order.order.cancelled` sobre una transacción HELD, pasa a REFUNDED y el
    saldo regresa completo.
11. Escribe tests unitarios al menos para: cálculo de hora pico y comisiones, débito
    atómico con saldo insuficiente, idempotencia del webhook y del handler de orden.

## Lo que NO debes hacer

- No habilites synchronize de TypeORM bajo ninguna circunstancia.
- No llames a otros microservicios por HTTP ni te conectes a sus bases de datos.
- No acredites saldo al crear el topup, solo desde el webhook validado.
- No implementes la transferencia real de dinero al negocio, solo el registro y el log.
- No inventes campos de los eventos externos más allá de las interfaces mínimas indicadas.
- No escribas credenciales en el código fuente ni en archivos versionados.
