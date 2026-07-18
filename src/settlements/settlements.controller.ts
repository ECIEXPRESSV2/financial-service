import { Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { SettlementsService } from './settlements.service';
import { StorePayout } from './entities/store-payout.entity';

@ApiTags('Stores')
@Controller('stores/payouts')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get('balance')
  @ApiOperation({
    summary:
      'Saldo disponible para retirar (RELEASED aún no incluido en ningún giro), header x-store-id.',
  })
  async getBalance(
    @CurrentStore() storeId: string,
  ): Promise<{ availableBalance: number }> {
    const availableBalance =
      await this.settlementsService.getAvailableBalance(storeId);
    return { availableBalance };
  }

  @Get('history')
  @ApiOperation({
    summary:
      'Historial de giros (automáticos + a demanda) del negocio, header x-store-id.',
  })
  getHistory(@CurrentStore() storeId: string): Promise<StorePayout[]> {
    return this.settlementsService.getHistory(storeId);
  }

  @Post('withdraw')
  @ApiOperation({
    summary:
      'Retiro anticipado a demanda: liquida el 100% del saldo disponible hacia la cuenta ' +
      'configurada. Simulado (no llama a Wompi). Header x-store-id.',
  })
  withdraw(@CurrentStore() storeId: string): Promise<StorePayout> {
    return this.settlementsService.withdrawOnDemand(storeId);
  }
}
