import { registerAs } from '@nestjs/config';

/**
 * Configuración de la pasarela de pagos Wompi (sandbox).
 * Las llaves nunca se escriben en el código: llegan por variables de entorno.
 */
export const wompiConfig = registerAs('wompi', () => {
  // Modo sandbox: usar las llaves de prueba (pub_test_/prv_test_) contra el API sandbox.
  // Se controla con WOMPI_SANDBOX, NO con NODE_ENV (que es "production" en el Container App
  // aunque estemos en sandbox de Wompi). WOMPI_BASE_URL permite override explícito.
  const sandbox = process.env.WOMPI_SANDBOX === 'true';
  return {
    publicKey: process.env.WOMPI_PUBLIC_KEY,
    privateKey: process.env.WOMPI_PRIVATE_KEY,
    eventsSecret: process.env.WOMPI_EVENTS_SECRET,
    integritySecret: process.env.WOMPI_INTEGRITY_SECRET,
    baseUrl:
      process.env.WOMPI_BASE_URL ??
      (sandbox
        ? 'https://sandbox.wompi.co/v1'
        : 'https://production.wompi.co/v1'),
    sandbox,
    currency: 'COP',
  };
});
