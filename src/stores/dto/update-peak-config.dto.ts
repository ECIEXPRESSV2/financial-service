import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
// HH:mm o HH:mm:ss en 24h.
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * Configuración de hora pico que el PROPIO negocio administra (header x-store-id),
 * igual que mueve su horario de atención. A diferencia de `UpdateCommissionConfigDto`
 * (solo admin), aquí NO se expone `platformFeePercent`: la comisión de plataforma la
 * fija un admin de ECIExpress.
 */
export class UpdatePeakConfigDto {
  @ApiPropertyOptional({
    example: 3,
    description:
      'Recargo porcentual que paga el comprador en hora pico (0–100).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  peakFeePercent?: number;

  @ApiPropertyOptional({
    example: '11:30',
    description: 'Inicio de hora pico (HH:mm).',
  })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'peakHoursStart debe tener formato HH:mm.' })
  peakHoursStart?: string;

  @ApiPropertyOptional({
    example: '14:00',
    description: 'Fin de hora pico (HH:mm).',
  })
  @IsOptional()
  @Matches(TIME_REGEX, { message: 'peakHoursEnd debe tener formato HH:mm.' })
  peakHoursEnd?: string;

  @ApiPropertyOptional({
    example: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    description: 'Días en que aplica la hora pico.',
    enum: DAY_CODES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(DAY_CODES, { each: true })
  peakDays?: string[];
}
