import { Injectable } from '@nestjs/common';
import { loggingStorage } from './logging.context';

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
 * Salida JSON compatible con Application Insights. Para activar AI en el futuro:
 *   import * as ai from 'applicationinsights';
 *   ai.defaultClient.trackEvent({ name: event, properties: { ...entry } });
 */
@Injectable()
export class FinancialLogger {
  private userId(): string | undefined {
    return loggingStorage.getStore()?.userId;
  }

  private emit(level: 'info' | 'warn', event: FinancialEvent, message: string, data?: FinancialEventData): void {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: 'financial-service',
      event,
      userId: this.userId(),
      message,
      ...data,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  logEvent(event: FinancialEvent, message: string, data?: FinancialEventData): void {
    this.emit('info', event, message, data);
  }

  warnEvent(event: FinancialEvent, message: string, data?: FinancialEventData): void {
    this.emit('warn', event, message, data);
  }
}
