import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { StoreStaffGuard } from '../common/guards/store-staff.guard';
import { TransactionsService } from './transactions.service';

@ApiTags('Stores')
@Controller('stores/payouts')
export class PayoutsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Desembolsos recibidos (RELEASED) y pendientes (HELD) del negocio (header x-store-id).',
  })
  async getMyPayouts(@CurrentStore() storeId: string) {
    return this.transactionsService.findPayoutsByStoreId(storeId);
  }

  @Get('earnings/:storeId')
  @UseGuards(StoreStaffGuard)
  @ApiOperation({
    summary:
      'Resumen de ganancias del mes: bruto, descuento por uso de la app y neto ' +
      '(recibido + pendiente) de un negocio. Solo su staff, dueño o un ADMIN.',
  })
  async getEarnings(@Param('storeId', ParseUUIDPipe) storeId: string) {
    return this.transactionsService.getStoreEarnings(storeId);
  }
}
