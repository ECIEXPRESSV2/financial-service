import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TopupPaymentMethod } from '../entities/wallet-topup.entity';

const METHODS_WITHOUT_PAYMENT_DATA = [
  TopupPaymentMethod.BANCOLOMBIA_TRANSFER,
  TopupPaymentMethod.BANCOLOMBIA_QR,
];

export class PaymentDataDto {
  /** NEQUI / DAVIPLATA: número de celular registrado (10 dígitos). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'phone_number debe tener exactamente 10 dígitos.' })
  phone_number?: string;

  /** DAVIPLATA / PSE: tipo de documento del titular (CC, CE, TI, NIT). */
  @IsOptional()
  @IsString()
  user_legal_id_type?: string;

  /** DAVIPLATA / PSE: número de documento del titular. */
  @IsOptional()
  @IsString()
  user_legal_id?: string;

  /** PSE: 0 = persona natural, 1 = persona jurídica. */
  @IsOptional()
  @IsInt()
  user_type?: number;

  /** PSE: código del banco (obtenible en GET /wallet/topups/pse-institutions). */
  @IsOptional()
  @IsString()
  financial_institution_code?: string;

  /** PSE: teléfono del pagador (va en customer_data al nivel raíz). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'customer_phone debe tener exactamente 10 dígitos.' })
  customer_phone?: string;

  /** PSE: nombre completo del pagador (va en customer_data al nivel raíz). */
  @IsOptional()
  @IsString()
  customer_full_name?: string;

  /** CARD: token generado por el widget de Wompi en el frontend. */
  @IsOptional()
  @IsString()
  token?: string;

  /** CARD: número de cuotas (por defecto 1). */
  @IsOptional()
  @IsInt()
  @Min(1)
  installments?: number;
}

export class CreateTopupDto {
  @ApiProperty({
    example: 50000,
    description: 'Monto a recargar en centavos COP (mínimo 1000 = $10 COP).',
  })
  @IsInt()
  @Min(1000, { message: 'El monto mínimo de recarga es 1000 centavos (10 COP).' })
  amount: number;

  @ApiProperty({
    enum: TopupPaymentMethod,
    example: TopupPaymentMethod.NEQUI,
    description: 'Método de pago.',
  })
  @IsEnum(TopupPaymentMethod)
  paymentMethod: TopupPaymentMethod;

  @ApiProperty({
    description:
      'Datos del método de pago. No requerido para BANCOLOMBIA_TRANSFER ni BANCOLOMBIA_QR.',
    required: false,
    examples: {
      NEQUI: {
        summary: 'Nequi — solo teléfono',
        value: { phone_number: '3001234567' },
      },
      DAVIPLATA: {
        summary: 'Daviplata — teléfono + documento',
        value: {
          phone_number: '3001234567',
          user_legal_id_type: 'CC',
          user_legal_id: '123456789',
        },
      },
      PSE: {
        summary: 'PSE — datos bancarios + datos del cliente',
        value: {
          user_type: 0,
          user_legal_id_type: 'CC',
          user_legal_id: '123456789',
          financial_institution_code: '1007',
          customer_phone: '3001234567',
          customer_full_name: 'Juan Pérez',
        },
      },
      CARD: {
        summary: 'Tarjeta — token generado por Wompi en el frontend',
        value: { token: 'tok_test_...', installments: 1 },
      },
      BANCOLOMBIA_TRANSFER: {
        summary: 'Bancolombia Transfer — no requiere paymentData',
        value: {},
      },
      BANCOLOMBIA_QR: {
        summary: 'Bancolombia QR — no requiere paymentData',
        value: {},
      },
    },
  })
  // BANCOLOMBIA_TRANSFER y BANCOLOMBIA_QR construyen el payload completos en el backend.
  @ValidateIf(o => !METHODS_WITHOUT_PAYMENT_DATA.includes(o.paymentMethod as TopupPaymentMethod))
  @IsNotEmpty({ message: 'paymentData es requerido para este método de pago.' })
  @IsObject()
  @ValidateNested()
  @Type(() => PaymentDataDto)
  paymentData?: PaymentDataDto;
}
