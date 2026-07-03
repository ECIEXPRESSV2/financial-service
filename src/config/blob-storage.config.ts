import { registerAs } from '@nestjs/config';

/**
 * Configuración del Azure Blob Storage donde Financial archiva los comprobantes de
 * pago (recargas de billetera y pagos de pedidos). El contenedor es PRIVADO: los
 * comprobantes solo se acceden mediante SAS tokens de lectura de corta vida que
 * genera este servicio para el dueño de la transacción.
 *
 * La cadena de conexión (incluye AccountKey, con el que se firman los SAS) nunca se
 * escribe en el código: llega por variable de entorno. Si no está definida, la subida
 * se omite (se loguea) y el flujo de negocio continúa: el comprobante igual viaja
 * adjunto en el correo.
 */
export const blobStorageConfig = registerAs('blobStorage', () => ({
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING ?? '',
  // Contenedor privado ya creado en la cuenta de storage.
  container: process.env.PAYMENT_RECEIPTS_CONTAINER ?? 'payment-receipts',
  // Vigencia del SAS token de lectura (minutos).
  sasTtlMinutes: Number(process.env.PAYMENT_RECEIPTS_SAS_TTL_MINUTES ?? 60),
}));
