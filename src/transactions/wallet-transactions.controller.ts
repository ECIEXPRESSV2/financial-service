import { Controller, Get, Param } from '@nestjs/common';
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

  @Get(':orderId/receipt-url')
  @ApiOperation({
    summary: 'Enlace temporal (SAS) al comprobante de pago de un pedido.',
    description:
      'Devuelve una URL de lectura de corta vida al comprobante archivado en el ' +
      'Blob Storage privado. Solo el dueño del pedido puede obtenerla.',
  })
  async getReceiptUrl(
    @CurrentUser() userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.transactionsService.getReceiptSasUrl(userId, orderId);
  }
}
