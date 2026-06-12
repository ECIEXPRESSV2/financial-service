import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PayoutType } from '../entities/store.entity';

/** Cuenta donde el negocio recibe sus desembolsos. */
export class UpdatePayoutAccountDto {
  @ApiProperty({ enum: PayoutType, example: PayoutType.NEQUI })
  @IsEnum(PayoutType)
  type: PayoutType;

  @ApiProperty({
    example: '3001234567',
    description: 'Número de cuenta o teléfono.',
  })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiPropertyOptional({
    example: '1007',
    description: 'Código del banco (solo para BANK_ACCOUNT).',
  })
  @IsOptional()
  @IsString()
  bankCode?: string;

  @ApiProperty({ example: 'Cafetería Central SAS' })
  @IsString()
  @IsNotEmpty()
  holderName: string;
}
