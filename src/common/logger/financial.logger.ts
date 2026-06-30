import { Injectable } from '@nestjs/common';
import { loggingStorage } from './logging.context';
import { getTelemetryClient } from '../telemetry/app-insights';
import { SERVICE_NAME } from '../telemetry/service-name';

export type FinancialEvent =
  | 'wallet.topup.created'
  | 'wallet.topup.approved'
  | 'wallet.topup.failed'
  | 'wallet.created'
  | 'wallet.deactivated'
  | 'order.payment.processed'
  | 'order.payment.failed'
  | 'order.payment.released'
  | 'order.payment.refunded';

export interface FinancialEventData {
  [key: string]: unknown;
}

/**
 * Logger inyectable para eventos financieros estructurados.
 * Incluye automáticamente el userId del contexto HTTP (vía AsyncLocalStorage).
 *
 * Emite JSON a stdout y, si Application Insights está configurado, envía el evento
 * como customEvent (trackEvent) con serviceName + userId, de modo que en AI se pueda
 * filtrar por servicio (customDimensions.serviceName) y trazar por usuario
 * (customDimensions.userId) vía KQL sobre la tabla `customEvents`.
 */
@Injectable()
export class FinancialLogger {
  private userId(): string | undefined {
    return loggingStorage.getStore()?.userId;
  }

  private emit(level: 'info' | 'warn', event: FinancialEvent, message: string, data?: FinancialEventData): void {
    const userId = this.userId();
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: SERVICE_NAME,
      event,
      userId,
      message,
      ...data,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
    this.toAppInsights(level, event, message, userId, data);
  }

  private toAppInsights(
    level: 'info' | 'warn',
    event: FinancialEvent,
    message: string,
    userId: string | undefined,
    data?: FinancialEventData,
  ): void {
    const client = getTelemetryClient();
    if (!client) return;

    const properties: Record<string, string> = {
      serviceName: SERVICE_NAME,
      level,
      message,
    };
    if (userId) properties.userId = userId;
    for (const [key, value] of Object.entries(data ?? {})) {
      if (value === undefined || value === null) continue;
      properties[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    }

    client.trackEvent({ name: event, properties });
  }

  logEvent(event: FinancialEvent, message: string, data?: FinancialEventData): void {
    this.emit('info', event, message, data);
  }

  warnEvent(event: FinancialEvent, message: string, data?: FinancialEventData): void {
    this.emit('warn', event, message, data);
  }
}
