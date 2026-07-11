import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentityClient } from '../clients/identity.client';

/**
 * Autoriza operaciones sobre la configuración de una tienda (ej. la hora pico) a: los usuarios
 * que pertenecen a esa tienda (staff activo o dueño, según identity) O a un ADMIN de ECIExpress.
 * El `storeId` se toma del parámetro de ruta y el `x-user-id` del header que inyecta el gateway.
 */
@Injectable()
export class StoreStaffGuard implements CanActivate {
  constructor(private readonly identity: IdentityClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      params: Record<string, string | undefined>;
    }>();

    const userId = request.headers['x-user-id'];
    if (!userId) {
      throw new UnauthorizedException(
        'Header x-user-id no encontrado. El API Gateway debe inyectarlo.',
      );
    }

    const storeId = request.params.storeId;
    if (!storeId) {
      throw new ForbiddenException('No se pudo determinar la tienda.');
    }

    // Un ADMIN de la plataforma puede editar cualquier tienda; el staff/dueño solo la suya.
    const [roles, members] = await Promise.all([
      this.identity.getUserRoles(userId),
      this.identity.getStoreMembers(storeId),
    ]);
    if (roles.includes('ADMIN') || members.includes(userId)) {
      return true;
    }
    throw new ForbiddenException(
      'No perteneces al staff de esta tienda; no puedes editar su configuración.',
    );
  }
}
