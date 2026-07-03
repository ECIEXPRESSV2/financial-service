/**
 * Datos y utilidades del comprobante de pago de ECIExpress.
 *
 * El comprobante se renderiza como PDF (ver `receipt-pdf.ts`), se archiva en Blob
 * Storage y se adjunta al correo de la notificación. Aquí viven el modelo de datos y
 * los formateadores compartidos (monto COP y fecha en zona America/Bogota).
 */

/** Tipo de comprobante: define concepto y textos de cabecera. */
export enum ReceiptConcept {
  WALLET_TOPUP = 'Recarga de billetera',
  ORDER_PAYMENT = 'Pago de pedido',
}

export interface ReceiptData {
  concept: ReceiptConcept;
  /** Monto pagado en centavos COP. */
  amountCents: number;
  paymentMethodLabel: string;
  /** Identificador del comprador (correo). */
  buyer: string;
  /** Etiqueta del identificador de la operación (ej. "ID transacción", "ID pedido"). */
  referenceLabel: string;
  reference: string;
  /** Momento en que se aprobó/cobró la operación. */
  date: Date;
}

/**
 * Formatea centavos COP al estilo colombiano. Ej: 1500000 -> "$15.000".
 * Se replica aquí (en vez de importarlo de notifications) para no acoplar servicios.
 */
export function formatCop(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '$0';
  const pesos = Math.round(cents / 100);
  const withSeparators = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${withSeparators}`;
}

/**
 * Formatea la fecha como "dd/MM/yyyy · HH:mm" en la zona America/Bogota,
 * independientemente del TZ del proceso.
 */
export function formatDateTimeBogota(date: Date): string {
  const parts = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} · ${get('hour')}:${get('minute')}`;
}

/** Nombre de archivo del comprobante, con marca de tiempo en segundos para diferenciarlo. */
export function buildReceiptFilename(date: Date = new Date()): string {
  const seconds = Math.floor(date.getTime() / 1000);
  return `comprobante-${seconds}.pdf`;
}
