/**
 * Utilidades puras (sin dependencias de Nest/DB) para evaluar la hora pico y calcular
 * las comisiones de una orden. Se mantienen aisladas para poder probarlas fácilmente.
 */

export interface PeakConfig {
  peakDays?: string[] | null;
  peakHoursStart?: string | null; // 'HH:mm' o 'HH:mm:ss'
  peakHoursEnd?: string | null;
}

const PEAK_TIMEZONE = 'America/Bogota';

/** Convierte 'HH:mm[:ss]' a minutos desde medianoche. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

/**
 * Devuelve el día (MON..SUN) y los minutos desde medianoche de una fecha evaluada en la
 * zona horaria America/Bogota (no en UTC).
 */
export function getBogotaDayAndMinutes(date: Date): {
  dayCode: string;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PEAK_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday'); // 'Mon', 'Tue', ...
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // algunos entornos devuelven '24' para medianoche
  const minute = parseInt(get('minute'), 10);

  const dayCode = weekday.slice(0, 3).toUpperCase();
  return { dayCode, minutes: hour * 60 + minute };
}

/**
 * Determina si `referenceDate` cae dentro de la franja de hora pico del negocio,
 * evaluada en America/Bogota. El día debe estar en `peakDays` y la hora entre
 * `peakHoursStart` (inclusive) y `peakHoursEnd` (exclusive). Soporta franjas que cruzan
 * la medianoche.
 */
export function isPeakHour(referenceDate: Date, config: PeakConfig): boolean {
  const { peakDays, peakHoursStart, peakHoursEnd } = config;
  if (!peakDays?.length || !peakHoursStart || !peakHoursEnd) {
    return false;
  }

  const { dayCode, minutes } = getBogotaDayAndMinutes(referenceDate);
  if (!peakDays.includes(dayCode)) {
    return false;
  }

  const start = timeToMinutes(peakHoursStart);
  const end = timeToMinutes(peakHoursEnd);

  if (start <= end) {
    return minutes >= start && minutes < end;
  }
  // Franja que cruza la medianoche (ej. 22:00–02:00).
  return minutes >= start || minutes < end;
}

export interface CommissionBreakdown {
  orderAmount: number;
  peakFeeAmount: number;
  totalCharged: number;
  platformFeeAmount: number;
  storePayoutAmount: number;
  isPeakHour: boolean;
}

/**
 * Calcula el desglose de montos de una orden. Todos en centavos COP. Los porcentajes se
 * aplican sobre el valor del pedido y se redondean al centavo entero más cercano.
 */
export function computeCommissions(params: {
  orderAmount: number;
  platformFeePercent: number;
  peakFeePercent: number;
  isPeak: boolean;
}): CommissionBreakdown {
  const { orderAmount, platformFeePercent, peakFeePercent, isPeak } = params;

  const peakFeeAmount = isPeak
    ? Math.round((orderAmount * peakFeePercent) / 100)
    : 0;
  const platformFeeAmount = Math.round(
    (orderAmount * platformFeePercent) / 100,
  );

  return {
    orderAmount,
    peakFeeAmount,
    totalCharged: orderAmount + peakFeeAmount,
    platformFeeAmount,
    storePayoutAmount: orderAmount - platformFeeAmount,
    isPeakHour: isPeak,
  };
}
