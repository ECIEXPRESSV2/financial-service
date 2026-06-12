import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TopupsService } from './topups.service';
import { CreateTopupDto } from './dto/create-topup.dto';
import { WalletTopup } from './entities/wallet-topup.entity';

@ApiTags('Wallet')
@Controller('wallet/topups')
export class TopupsController {
  constructor(private readonly topupsService: TopupsService) {}

  @Get()
  @ApiOperation({
    summary: 'Historial de recargas de mi billetera (header x-user-id).',
  })
  async getMyTopups(@CurrentUser() userId: string): Promise<WalletTopup[]> {
    return this.topupsService.getTopupsByUserId(userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Iniciar una recarga de la billetera (header x-user-id).',
    description:
      'Crea el topup PENDING y la transacción en Wompi. El saldo NO se acredita aquí, ' +
      'solo cuando el webhook de Wompi confirma el pago.',
  })
  async createTopup(
    @CurrentUser() userId: string,
    @Body() dto: CreateTopupDto,
  ) {
    // IMPORTANTE FRONTEND: antes de recargar, mostrar un modal de confirmación que
    // advierta que las recargas no tienen reembolso y preguntar si está seguro de
    // realizar la acción.
    return this.topupsService.createTopup(userId, dto);
  }
}
