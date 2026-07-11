import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { StoreStaffGuard } from '../common/guards/store-staff.guard';
import { StoresService, StoreCommissionInfo } from './stores.service';
import { UpdatePayoutAccountDto } from './dto/update-payout-account.dto';
import { UpdatePeakConfigDto } from './dto/update-peak-config.dto';
import { Store } from './entities/store.entity';

@ApiTags('Stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

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

  @Patch(':storeId/peak-config')
  @UseGuards(StoreStaffGuard)
  @ApiOperation({
    summary:
      'Actualizar la hora pico (franja + recargo) de un negocio. Solo su staff o dueño.',
  })
  async updatePeakConfig(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: UpdatePeakConfigDto,
  ): Promise<Store> {
    return this.storesService.updatePeakConfig(storeId, dto);
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
