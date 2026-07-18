import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Store } from '../stores/entities/store.entity';
import { StoresService } from '../stores/stores.service';
import {
  OrderTransaction,
  OrderTransactionStatus,
} from '../transactions/entities/order-transaction.entity';
import { FinancialLogger } from '../common/logger/financial.logger';
import { StorePayout, StorePayoutType } from './entities/store-payout.entity';
import { SETTLEMENT_EXECUTOR, SettlementExecutor } from './settlement-executor';

const BOGOTA_TIMEZONE = 'America/Bogota';

/** 'YYYY-MM-DD' de `date` en America/Bogota, para comparar si dos instantes caen el mismo día. */
const bogotaDateKey = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TIMEZONE }).format(date);

/**
 * Orquesta los giros (liquidaciones) hacia los negocios: el retiro on-demand que pide
 * el vendedor y la liquidación automática de fin de mes comparten la misma lógica de
 * `settleStore`, que solo cambia el `type` que queda registrado.
 */
@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    @InjectRepository(StorePayout)
    private readonly payoutRepository: Repository<StorePayout>,
    private readonly storesService: StoresService,
    private readonly dataSource: DataSource,
    private readonly financialLogger: FinancialLogger,
    @Inject(SETTLEMENT_EXECUTOR)
    private readonly executor: SettlementExecutor,
  ) {}

  /** Saldo disponible (centavos COP) de un negocio: RELEASED aún no incluido en ningún giro. */
  async getAvailableBalance(storeId: string): Promise<number> {
    const row = await this.dataSource
      .createQueryBuilder(OrderTransaction, 'tx')
      .select('COALESCE(SUM(tx.store_payout_amount), 0)', 'amount')
      .where('tx.store_id = :storeId', { storeId })
      .andWhere('tx.status = :status', {
        status: OrderTransactionStatus.RELEASED,
      })
      .andWhere('tx.payout_id IS NULL')
      .getRawOne<{ amount: string }>();
    return parseInt(row?.amount ?? '0', 10);
  }

  /** Historial de giros (automáticos + on-demand) del negocio, más reciente primero. */
  getHistory(storeId: string): Promise<StorePayout[]> {
    return this.payoutRepository.find({
      where: { storeId },
      order: { executedAt: 'DESC' },
    });
  }

  /**
   * Retiro anticipado pedido por el negocio: liquida el 100% del saldo disponible.
   * Máximo un retiro on-demand por día calendario (America/Bogota); la liquidación
   * automática de fin de mes no cuenta para este límite.
   */
  async withdrawOnDemand(storeId: string): Promise<StorePayout> {
    const store = await this.storesService.findStoreOrThrow(storeId);
    if (!store.payoutType) {
      throw new BadRequestException(
        'Configura primero tu cuenta de desembolso antes de retirar.',
      );
    }

    const lastWithdrawal = await this.payoutRepository.findOne({
      where: { storeId, type: StorePayoutType.ON_DEMAND },
      order: { executedAt: 'DESC' },
    });
    if (
      lastWithdrawal &&
      bogotaDateKey(lastWithdrawal.executedAt) === bogotaDateKey(new Date())
    ) {
      throw new BadRequestException(
        'Ya hiciste un retiro hoy. Puedes volver a retirar mañana.',
      );
    }

    const payout = await this.settleStore(store, StorePayoutType.ON_DEMAND);
    if (!payout) {
      throw new BadRequestException('No tienes saldo disponible para retirar.');
    }
    return payout;
  }

  /**
   * Liquidación automática de fin de mes: recorre los negocios activos con cuenta de
   * desembolso configurada y liquida el saldo disponible de cada uno. Una tienda que
   * falla no aborta el resto del lote.
   */
  async runMonthlySettlement(): Promise<void> {
    const stores = await this.storesService.findActiveWithPayoutAccount();
    this.logger.log(
      `Liquidación mensual: evaluando ${stores.length} negocio(s) con cuenta de desembolso.`,
    );
    for (const store of stores) {
      try {
        await this.settleStore(store, StorePayoutType.AUTOMATIC);
      } catch (error) {
        this.logger.error(
          `Error liquidando el negocio ${store.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * Núcleo compartido: bajo lock pesimista, toma todas las `OrderTransaction` RELEASED
   * sin `payoutId` del negocio, las suma, ejecuta el giro (simulado) y marca cada
   * transacción con el id del nuevo `StorePayout` — todo en una sola transacción de BD
   * para que un retiro on-demand y el cron mensual nunca liquiden el mismo pedido dos veces.
   */
  private async settleStore(
    store: Store,
    type: StorePayoutType,
  ): Promise<StorePayout | null> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager
        .createQueryBuilder(OrderTransaction, 'tx')
        .setLock('pessimistic_write')
        .where('tx.store_id = :storeId', { storeId: store.id })
        .andWhere('tx.status = :status', {
          status: OrderTransactionStatus.RELEASED,
        })
        .andWhere('tx.payout_id IS NULL')
        .getMany();

      const amount = rows.reduce((sum, row) => sum + row.storePayoutAmount, 0);
      if (amount <= 0) {
        return null;
      }

      const result = await this.executor.execute({
        storeId: store.id,
        amount,
        destination: {
          type: store.payoutType!,
          accountNumber: store.payoutAccountNumber!,
          bankCode: store.payoutBankCode,
          holderName: store.payoutHolderName!,
        },
      });

      const payout = await manager.save(
        StorePayout,
        manager.create(StorePayout, {
          storeId: store.id,
          type,
          status: result.status,
          amount,
          destinationType: store.payoutType!,
          destinationAccountNumber: store.payoutAccountNumber!,
          destinationBankCode: store.payoutBankCode,
          destinationHolderName: store.payoutHolderName!,
          reference: result.reference,
          executedAt: result.executedAt,
        }),
      );

      await manager.update(
        OrderTransaction,
        rows.map((row) => row.id),
        { payoutId: payout.id },
      );

      this.financialLogger.logEvent(
        'store.payout.settled',
        'Giro liquidado al negocio',
        {
          storeId: store.id,
          payoutId: payout.id,
          type,
          amount,
          reference: payout.reference,
        },
      );

      return payout;
    });
  }
}
