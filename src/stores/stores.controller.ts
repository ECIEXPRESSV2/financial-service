import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { StoresService, StoreCommissionInfo } from './stores.service';
import { UpdatePayoutAccountDto } from './dto/update-payout-account.dto';
import { Store } from './entities/store.entity';

@ApiTags('Stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get('payout-account')
  @ApiOperation({
    summary: 'Cuenta de desembolso configurada del negocio (header x-store-id).',
  })
  async getPayoutAccount(@CurrentStore() storeId: string): Promise<Store> {
    return this.storesService.findStoreOrThrow(storeId);
  }

  @Patch('payout-account')
  @ApiOperation({
    summary:
      'Registrar o actualizar la cuenta de desembolso del negocio (header x-store-id).',
  })
  async updatePayoutAccount(
    @CurrentStore() storeId: string,
    @Body() dto: UpdatePayoutAccountDto,
  ): Promise<Store> {
    return this.storesService.updatePayoutAccount(storeId, dto);
  }

  @Get(':storeId/commission')
  @ApiOperation({
    summary:
      'Comisiones del negocio + si es hora pico ahora. Con ?amount= (centavos COP) ' +
      'devuelve los montos calculados. La consume orders-service para la factura.',
  })
  @ApiQuery({ name: 'amount', required: false, description: 'Monto del pedido en centavos COP.' })
  async getCommission(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Query('amount') amount?: string,
  ): Promise<StoreCommissionInfo> {
    const parsed = amount !== undefined ? Number(amount) : 0;
    return this.storesService.getCommissionInfo(
      storeId,
      Number.isFinite(parsed) ? parsed : 0,
    );
  }
}
