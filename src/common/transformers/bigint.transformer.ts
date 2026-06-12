import { ValueTransformer } from 'typeorm';

/**
 * Transforma columnas bigint de PostgreSQL (que el driver devuelve como string para
 * no perder precisión) a number en la capa de aplicación y viceversa.
 *
 * Todos los montos de dinero se almacenan en centavos COP como bigint, por lo que
 * caben holgadamente en el rango seguro de number (Number.MAX_SAFE_INTEGER ~ 9e15).
 */
export class BigIntTransformer implements ValueTransformer {
  // De la aplicación hacia la base de datos.
  to(value: number | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return value.toString();
  }

  // De la base de datos hacia la aplicación.
  from(value: string | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return parseInt(value, 10);
  }
}

export const bigIntTransformer = new BigIntTransformer();
