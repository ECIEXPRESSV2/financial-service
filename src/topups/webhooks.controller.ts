import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { TopupsService } from './topups.service';
import { WompiService } from '../wompi/wompi.service';
import { WompiWebhookDto } from './dto/wompi-webhook.dto';

/**
 * Webhook público de Wompi (sin auth del gateway). Valida la firma del evento y procesa
 * la recarga. Responde 200 siempre que la firma sea válida, para que Wompi no reintente
 * innecesariamente; el procesamiento (idempotente) ocurre en el servicio.
 */
@Controller('webhooks/wompi')
export class WebhooksController {
  constructor(
    private readonly topupsService: TopupsService,
    private readonly wompiService: WompiService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint() // endpoint de integración, no se documenta en Swagger público
  async handleWompiWebhook(
    @Body() event: WompiWebhookDto,
  ): Promise<{ received: boolean }> {
    if (!this.wompiService.verifyWebhookSignature(event)) {
      throw new UnauthorizedException('Firma de webhook inválida.');
    }

    await this.topupsService.handleWebhookEvent(event);
    return { received: true };
  }
}
