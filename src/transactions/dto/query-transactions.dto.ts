import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { OrderTransactionStatus } from '../entities/order-transaction.entity';

/** Filtros para el listado de transacciones de administración. */
export class QueryTransactionsDto {
  @ApiPropertyOptional({ enum: OrderTransactionStatus })
  @IsOptional()
  @IsEnum(OrderTransactionStatus)
  status?: OrderTransactionStatus;

  @ApiPropertyOptional({
    example: '2026-01-01T00:00:00Z',
    description: 'Fecha de creación desde (ISO 8601).',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31T23:59:59Z',
    description: 'Fecha de creación hasta (ISO 8601).',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
