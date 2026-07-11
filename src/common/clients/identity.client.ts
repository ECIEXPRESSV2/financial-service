import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import axios from 'axios';

/** Miembro de una tienda devuelto por identity (`GET /internal/stores/:storeId/staff`). */
interface StoreMember {
  userId: string;
  role: string; // 'VENDOR' (staff) | 'OWNER'
}

/** Validación de usuario de identity (`GET /internal/users/:userId/validate`). */
interface UserValidation {
  exists: boolean;
  isActive: boolean;
  roles: string[];
}

/**
 * Cliente hacia identity-service para resolver quién puede operar una tienda. Es una llamada
 * servicio-a-servicio DIRECTA (IDENTITY_SERVICE_URL apunta al servicio, no al gateway); el
 * gateway bloquea las rutas `/internal` desde afuera. Se identifica con el header `x-internal`.
 */
@Injectable()
export class IdentityClient {
  private readonly logger = new Logger(IdentityClient.name);

  private get baseUrl(): string {
    return (process.env.IDENTITY_SERVICE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
  }

  /**
   * userIds que pueden operar la tienda: staff activo MÁS el dueño. Si identity no responde,
   * lanza 503 (fail-closed): mejor negar la edición que autorizar sin poder verificar.
   */
  async getStoreMembers(storeId: string): Promise<string[]> {
    try {
      const { data } = await axios.get<StoreMember[]>(
        `${this.baseUrl}/internal/stores/${storeId}/staff`,
        { timeout: 6000, headers: { 'x-internal': '1' } },
      );
      return data.map((m) => m.userId);
    } catch (error) {
      this.logger.error(
        `No se pudo verificar el staff de la tienda ${storeId} contra identity: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'No se pudo verificar la pertenencia a la tienda. Intenta de nuevo.',
      );
    }
  }

  /**
   * Roles ACTIVOS de un usuario (ej. 'ADMIN', 'VENDOR', 'BUYER'). Si identity no responde,
   * lanza 503 (fail-closed): mejor negar que autorizar sin poder verificar el rol.
   */
  async getUserRoles(userId: string): Promise<string[]> {
    try {
      const { data } = await axios.get<UserValidation>(
        `${this.baseUrl}/internal/users/${userId}/validate`,
        { timeout: 6000, headers: { 'x-internal': '1' } },
      );
      return data.roles ?? [];
    } catch (error) {
      this.logger.error(
        `No se pudieron obtener los roles del usuario ${userId} desde identity: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'No se pudo verificar tu rol. Intenta de nuevo.',
      );
    }
  }
}
