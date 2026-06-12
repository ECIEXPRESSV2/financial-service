import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Extrae el id del negocio del header `x-store-id` que inyecta el API Gateway.
 * Usado por los endpoints que opera el negocio sobre su propia configuración.
 */
export const CurrentStore = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const storeId = request.headers['x-store-id'];
    if (!storeId) {
      throw new UnauthorizedException(
        'Header x-store-id no encontrado. El API Gateway debe inyectarlo.',
      );
    }
    return storeId;
  },
);
