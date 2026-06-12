import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { StoresService } from './stores.service';
import { UpdateCommissionConfigDto } from './dto/update-commission-config.dto';
import { Store } from './entities/store.entity';

@ApiTags('Admin')
@UseGuards(AdminGuard)
@Controller('admin/stores')
export class AdminStoresController {
  constructor(private readonly storesService: StoresService) {}

  @Patch(':storeId/commission-config')
  @ApiOperation({
    summary:
      'Configurar comisiones y franja de hora pico de un negocio (solo admin).',
  })
  async updateCommissionConfig(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: UpdateCommissionConfigDto,
  ): Promise<Store> {
    return this.storesService.updateCommissionConfig(storeId, dto);
  }
}
