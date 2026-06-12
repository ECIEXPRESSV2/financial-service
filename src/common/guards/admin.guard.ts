import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Guard placeholder para endpoints de administración.
 *
 * TODO: cuando Identity defina el modelo de roles, validar aquí que el `x-user-id`
 * (o un header/claim de rol que inyecte el API Gateway) corresponda a un
 * administrador de ECIExpress. Por ahora solo exige la presencia del header y deja
 * pasar la petición.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const userId = request.headers['x-user-id'];

    if (!userId) {
      throw new UnauthorizedException(
        'Header x-user-id no encontrado. El API Gateway debe inyectarlo.',
      );
    }

    // TODO: validar rol admin real contra el contrato que defina Identity.
    this.logger.warn(
      `AdminGuard placeholder: acceso admin permitido a x-user-id=${userId} sin validar rol.`,
    );
    return true;
  }
}
