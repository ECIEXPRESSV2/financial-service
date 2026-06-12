import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { TopupPaymentMethod } from '../entities/wallet-topup.entity';

export class CreateTopupDto {
  @ApiProperty({
    example: 50000,
    description: 'Monto a recargar en centavos COP (entero positivo).',
  })
  @IsInt()
  @Min(1000, {
    message: 'El monto mínimo de recarga es 1000 centavos (10 COP).',
  })
  amount: number;

  @ApiProperty({
    enum: TopupPaymentMethod,
    example: TopupPaymentMethod.NEQUI,
    description: 'Método de pago de la recarga.',
  })
  @IsEnum(TopupPaymentMethod)
  paymentMethod: TopupPaymentMethod;

  @ApiPropertyOptional({
    description:
      'Datos específicos del método recogidos/tokenizados por el front (p. ej. ' +
      'phone_number para Nequi, token e installments para tarjeta, datos PSE). ' +
      'NUNCA datos crudos de tarjeta: solo tokens de Wompi.',
    example: { phone_number: '3001234567' },
  })
  @IsOptional()
  @IsObject()
  paymentData?: Record<string, unknown>;
}
