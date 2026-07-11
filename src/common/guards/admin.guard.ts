import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentityClient } from '../clients/identity.client';

/**
 * Autoriza los endpoints de administración de ECIExpress: solo usuarios con rol global
 * `ADMIN`. El rol NO viaja en headers hacia financial, así que se consulta a identity con el
 * `x-user-id` que inyecta el gateway. Fail-closed: si no se puede verificar el rol, se niega.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly identity: IdentityClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const userId = request.headers['x-user-id'];

    if (!userId) {
      throw new UnauthorizedException(
        'Header x-user-id no encontrado. El API Gateway debe inyectarlo.',
      );
    }

    const roles = await this.identity.getUserRoles(userId);
    if (!roles.includes('ADMIN')) {
      throw new ForbiddenException(
        'Se requiere rol de administrador de ECIExpress.',
      );
    }
    return true;
  }
}
