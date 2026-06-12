import { ApiProperty } from '@nestjs/swagger';

/**
 * Forma del evento que envía Wompi al webhook. Se valida la firma con el secreto de
 * eventos antes de procesar. No se usan validadores estrictos de class-validator para
 * no rechazar campos extra que Wompi pueda añadir; la firma es la garantía de origen.
 */
export class WompiWebhookDto {
  @ApiProperty({ example: 'transaction.updated' })
  event: string;

  @ApiProperty({
    description:
      'Contiene transaction con id, status, reference, amount_in_cents...',
  })
  data: {
    transaction: {
      id: string;
      status: 'APPROVED' | 'DECLINED' | 'ERROR' | 'VOIDED' | 'PENDING';
      reference: string;
      amount_in_cents: number;
      [key: string]: unknown;
    };
  };

  @ApiProperty({ description: 'checksum SHA256 y propiedades firmadas.' })
  signature: { checksum: string; properties: string[] };

  @ApiProperty({ example: 1700000000 })
  timestamp: number;

  @ApiProperty({ required: false })
  sent_at?: string;
}
