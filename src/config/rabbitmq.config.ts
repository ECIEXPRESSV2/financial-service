import { registerAs } from '@nestjs/config';

/**
 * Configuración del bus de eventos (RabbitMQ en CloudAMQP).
 *
 * - Exchange compartido de toda la plataforma ECIExpress: `eciexpress_events` (topic, durable).
 * - Cola propia de este servicio: `financial_service_queue` (durable).
 *
 * La URL de conexión llega SIEMPRE por la variable de entorno RABBITMQ_URL; nunca se
 * escribe en el código fuente.
 */
export const EXCHANGE_NAME = 'eciexpress_events';
export const QUEUE_NAME = 'financial_service_queue';

export const rabbitmqConfig = registerAs('rabbitmq', () => ({
  url: process.env.RABBITMQ_URL,
  exchange: EXCHANGE_NAME,
  queue: QUEUE_NAME,
}));
