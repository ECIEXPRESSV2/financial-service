import { registerAs } from '@nestjs/config';

/**
 * Configuración del bus de eventos (Azure Service Bus).
 *
 * - Topic compartido de toda la plataforma ECIExpress: `eciexpress_events`.
 * - Subscription propia de este servicio: `financial-service`.
 *
 * Autenticación PASSWORDLESS (Managed Identity vía DefaultAzureCredential): solo se
 * necesita el FQDN del namespace, nunca una connection string en el código. Los valores
 * llegan por entorno (inyectados por Terraform en el Container App):
 *   SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE = <namespace>.servicebus.windows.net
 *   SERVICE_BUS_TOPIC                      = eciexpress_events
 *   SERVICE_BUS_SUBSCRIPTION               = financial-service
 */
export const serviceBusConfig = registerAs('serviceBus', () => ({
  fullyQualifiedNamespace: process.env.SERVICE_BUS_FULLY_QUALIFIED_NAMESPACE,
  topic: process.env.SERVICE_BUS_TOPIC ?? 'eciexpress_events',
  subscription: process.env.SERVICE_BUS_SUBSCRIPTION ?? 'financial-service',
}));
