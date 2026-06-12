import { Body, Controller, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { StoresService } from './stores.service';
import { UpdatePayoutAccountDto } from './dto/update-payout-account.dto';
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
}
