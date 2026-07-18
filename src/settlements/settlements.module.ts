import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { StorePayout } from './entities/store-payout.entity';
import { OrderTransaction } from '../transactions/entities/order-transaction.entity';
import { StoresModule } from '../stores/stores.module';
import { SettlementsService } from './settlements.service';
import { SettlementsController } from './settlements.controller';
import { MonthlySettlementScheduler } from './monthly-settlement.scheduler';
import {
  SETTLEMENT_EXECUTOR,
  SimulatedSettlementExecutor,
} from './settlement-executor';

/**
 * Giros hacia los negocios: retiro on-demand + liquidación automática de fin de mes.
 * `EventPublisherService`/`FinancialLogger` no se importan: viven en módulos `@Global`
 * (`MessagingModule`/`LoggerModule`).
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([StorePayout, OrderTransaction]),
    StoresModule,
  ],
  controllers: [SettlementsController],
  providers: [
    SettlementsService,
    MonthlySettlementScheduler,
    { provide: SETTLEMENT_EXECUTOR, useClass: SimulatedSettlementExecutor },
  ],
  exports: [SettlementsService],
})
export class SettlementsModule {}
