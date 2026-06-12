import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Extrae el id del comprador del header `x-user-id` que inyecta el API Gateway.
 * Este servicio no valida JWT; confía en que el gateway ya autenticó al usuario.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const userId = request.headers['x-user-id'];
    if (!userId) {
      throw new UnauthorizedException(
        'Header x-user-id no encontrado. El API Gateway debe inyectarlo.',
      );
    }
    return userId;
  },
);
