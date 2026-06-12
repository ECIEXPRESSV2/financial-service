import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../common/guards/admin.guard';
import { TransactionsService } from './transactions.service';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { OrderTransaction } from './entities/order-transaction.entity';

@ApiTags('Admin')
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminTransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('stores/:storeId/transactions')
  @ApiOperation({
    summary: 'Trazabilidad de transacciones de un negocio (solo admin).',
  })
  async getStoreTransactions(
    @Param('storeId', ParseUUIDPipe) storeId: string,
  ): Promise<OrderTransaction[]> {
    return this.transactionsService.findByStoreId(storeId);
  }

  @Get('transactions')
  @ApiOperation({
    summary:
      'Todas las transacciones con filtros por estado y fechas (solo admin).',
  })
  async getAllTransactions(
    @Query() query: QueryTransactionsDto,
  ): Promise<OrderTransaction[]> {
    return this.transactionsService.findAll({
      status: query.status,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }
}
