import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TransactionsService } from './transactions.service';
import { OrderTransaction } from './entities/order-transaction.entity';

@ApiTags('Wallet')
@Controller('wallet/transactions')
export class WalletTransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Historial de pagos de órdenes de mi billetera (header x-user-id).',
  })
  async getMyTransactions(
    @CurrentUser() userId: string,
  ): Promise<OrderTransaction[]> {
    return this.transactionsService.findByUserId(userId);
  }
}
