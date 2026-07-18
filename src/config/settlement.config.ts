import { registerAs } from '@nestjs/config';

/**
 * Configuración de la liquidación mensual automática de saldos a las tiendas.
 * `cronExpression` por defecto: 6:00am el día 1 de cada mes.
 */
export const settlementConfig = registerAs('settlement', () => ({
  cronExpression: process.env.MONTHLY_SETTLEMENT_CRON ?? '0 6 1 * *',
}));
