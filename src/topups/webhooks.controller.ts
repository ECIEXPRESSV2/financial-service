import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { TopupsService } from './topups.service';
import { WompiService } from '../wompi/wompi.service';
import { WompiWebhookEvent } from '../wompi/wompi.service';

/**
 * Webhook público de Wompi (sin auth del gateway).
 *
 * Recibe el body como Record<string, unknown> a propósito: si se usara un DTO tipado
 * con class-validator, la ValidationPipe global (whitelist: true) eliminaría campos
 * desconocidos antes de que se calcule la firma, haciendo que el hash no coincida.
 * La firma SHA256 es la única garantía de origen; no se necesita validación adicional.
 */
@Controller('webhooks/wompi')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly topupsService: TopupsService,
    private readonly wompiService: WompiService,
  ) {}

  @Post()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async handleWompiWebhook(
    @Body() body: Record<string, unknown>,
  ): Promise<{ received: boolean }> {
    this.logger.debug(`Webhook body recibido: ${JSON.stringify(body)}`);
    this.logger.debug(
      `signature recibida: ${JSON.stringify(body?.['signature'])}`,
    );

    if (!this.wompiService.verifyWebhookSignature(body)) {
      throw new UnauthorizedException('Firma de webhook inválida.');
    }

    await this.topupsService.handleWebhookEvent(body as unknown as WompiWebhookEvent);
    return { received: true };
  }
}
