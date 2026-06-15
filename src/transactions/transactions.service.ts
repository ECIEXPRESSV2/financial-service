import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import {
  FailureReason,
  OrderTransaction,
  OrderTransactionStatus,
} from './entities/order-transaction.entity';
import { computeCommissions, isPeakHour } from './pricing.util';
import { WalletsService } from '../wallets/wallets.service';
import { StoresService } from '../stores/stores.service';
import { PayoutService } from '../payouts/payout.service';
import { EventPublisherService } from '../events/event-publisher.service';
import { PublishedEvents } from '../events/event-patterns';
import {
  OrderCreatedPayload,
  OrderCancelledPayload,
} from '../events/payloads/order.payloads';
import { DeliveryConfirmedPayload } from '../events/payloads/fulfillment.payloads';
import { FinancialLogger } from '../common/logger/financial.logger';

// Código de error de PostgreSQL para violación de unicidad (idempotencia por order_id).
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(OrderTransaction)
    private readonly txRepository: Repository<OrderTransaction>,
    private readonly walletsService: WalletsService,
    private readonly storesService: StoresService,
    private readonly payoutService: PayoutService,
    private readonly eventPublisher: EventPublisherService,
    private readonly dataSource: DataSource,
    private readonly financialLogger: FinancialLogger,
  ) {}

  // --- Lecturas para los controladores ---

  findByOrderId(orderId: string): Promise<OrderTransaction | null> {
    return this.txRepository.findOne({ where: { orderId } });
  }

  findByWalletId(walletId: string): Promise<OrderTransaction[]> {
    return this.txRepository.find({
      where: { walletId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByUserId(userId: string): Promise<OrderTransaction[]> {
    const wallet = await this.walletsService.findWalletByUserId(userId);
    return this.findByWalletId(wallet.id);
  }

  findByStoreId(storeId: string): Promise<OrderTransaction[]> {
    return this.txRepository.find({
      where: { storeId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Desembolsos del negocio: transacciones liberadas (recibidas) y retenidas (pendientes). */
  async findPayoutsByStoreId(storeId: string): Promise<{
    released: OrderTransaction[];
    pending: OrderTransaction[];
  }> {
    const [released, pending] = await Promise.all([
      this.txRepository.find({
        where: { storeId, status: OrderTransactionStatus.RELEASED },
        order: { releasedAt: 'DESC' },
      }),
      this.txRepository.find({
        where: { storeId, status: OrderTransactionStatus.HELD },
        order: { heldAt: 'DESC' },
      }),
    ]);
    return { released, pending };
  }

  /** Listado admin con filtros opcionales por estado y rango de fechas de creación. */
  async findAll(filters: {
    status?: OrderTransactionStatus;
    from?: Date;
    to?: Date;
  }): Promise<OrderTransaction[]> {
    const qb = this.txRepository.createQueryBuilder('tx');
    if (filters.status) {
      qb.andWhere('tx.status = :status', { status: filters.status });
    }
    if (filters.from) {
      qb.andWhere('tx.created_at >= :from', { from: filters.from });
    }
    if (filters.to) {
      qb.andWhere('tx.created_at <= :to', { to: filters.to });
    }
    return qb.orderBy('tx.created_at', 'DESC').getMany();
  }

  // --- Handler de cobro: order.order.created ---

  /**
   * Cobra una orden desde la billetera del comprador. Idempotente por `order_id`,
   * atómico y a prueba de concurrencia en el débito.
   */
  async handleOrderCreated(payload: OrderCreatedPayload): Promise<void> {
    // 1. Idempotencia: si ya procesamos esta orden, no hacemos nada.
    const existing = await this.findByOrderId(payload.orderId);
    if (existing) {
      this.logger.log(
        `Orden ${payload.orderId} ya procesada (${existing.status}).`,
      );
      return;
    }

    // 2. Cargar el store. Si no existe o está inactivo → FAILED.
    const store = await this.storesService.findStore(payload.storeId);
    if (!store) {
      await this.persistFailed(payload, FailureReason.STORE_NOT_FOUND, null);
      return;
    }
    if (!store.isActive) {
      await this.persistFailed(payload, FailureReason.STORE_INACTIVE, null);
      return;
    }

    // 3. Resolver la billetera del comprador.
    const wallet = await this.walletsService.findWalletByUserIdNullable(
      payload.buyerId,
    );
    if (!wallet || !wallet.isActive) {
      await this.persistFailed(payload, FailureReason.WALLET_NOT_FOUND, null);
      return;
    }

    // 4. Evaluar hora pico (en America/Bogota) y calcular el desglose de montos.
    const peak = isPeakHour(new Date(), {
      peakDays: store.peakDays,
      peakHoursStart: store.peakHoursStart,
      peakHoursEnd: store.peakHoursEnd,
    });
    const breakdown = computeCommissions({
      orderAmount: payload.totalAmount,
      platformFeePercent: store.platformFeePercent,
      peakFeePercent: store.peakFeePercent,
      isPeak: peak,
    });

    // 5. Debitar y crear la transacción HELD de forma atómica.
    try {
      const debited = await this.dataSource.transaction(async (manager) => {
        const ok = await this.walletsService.debitWallet(
          wallet.id,
          breakdown.totalCharged,
          manager,
        );
        if (!ok) {
          return false; // saldo insuficiente: la transacción se revierte sin insertar.
        }
        const now = new Date();
        await manager.insert(OrderTransaction, {
          orderId: payload.orderId,
          walletId: wallet.id,
          storeId: store.id,
          orderAmount: breakdown.orderAmount,
          peakFeeAmount: breakdown.peakFeeAmount,
          totalCharged: breakdown.totalCharged,
          platformFeeAmount: breakdown.platformFeeAmount,
          storePayoutAmount: breakdown.storePayoutAmount,
          status: OrderTransactionStatus.HELD,
          isPeakHour: breakdown.isPeakHour,
          heldAt: now,
        });
        return true;
      });

      if (!debited) {
        await this.persistFailed(
          payload,
          FailureReason.INSUFFICIENT_FUNDS,
          wallet.id,
        );
        return;
      }
    } catch (error) {
      // Evento duplicado que ganó la carrera por el order_id: tratar como idempotente.
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
      ) {
        this.logger.warn(
          `Orden ${payload.orderId} insertada por un evento concurrente; ignorado.`,
        );
        return;
      }
      throw error;
    }

    // 6. Publicar el cobro exitoso.
    await this.eventPublisher.publish(PublishedEvents.PAYMENT_PROCESSED, {
      orderId: payload.orderId,
      walletId: wallet.id,
      storeId: store.id,
      orderAmount: breakdown.orderAmount,
      peakFeeAmount: breakdown.peakFeeAmount,
      totalCharged: breakdown.totalCharged,
      isPeakHour: breakdown.isPeakHour,
    });
    this.financialLogger.logEvent('order.payment.processed', 'Pago de orden procesado', {
      orderId: payload.orderId,
      buyerId: payload.buyerId,
      storeId: payload.storeId,
      orderAmount: breakdown.orderAmount,
      totalCharged: breakdown.totalCharged,
      platformFeeAmount: breakdown.platformFeeAmount,
      peakFeeAmount: breakdown.peakFeeAmount,
      isPeakHour: breakdown.isPeakHour,
      walletId: wallet.id,
    });
  }

  /**
   * Persiste una transacción FAILED (idempotente por order_id) y publica payment.failed.
   */
  private async persistFailed(
    payload: OrderCreatedPayload,
    reason: FailureReason,
    walletId: string | null,
  ): Promise<void> {
    try {
      await this.txRepository.insert({
        orderId: payload.orderId,
        walletId: walletId ?? payload.buyerId,
        storeId: payload.storeId,
        orderAmount: payload.totalAmount,
        peakFeeAmount: 0,
        totalCharged: 0,
        platformFeeAmount: 0,
        storePayoutAmount: 0,
        status: OrderTransactionStatus.FAILED,
        isPeakHour: false,
        failureReason: reason,
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
      ) {
        this.logger.warn(
          `Orden ${payload.orderId} ya registrada; FAILED ignorado.`,
        );
        return;
      }
      throw error;
    }

    await this.eventPublisher.publish(PublishedEvents.PAYMENT_FAILED, {
      orderId: payload.orderId,
      storeId: payload.storeId,
      reason,
    });
    this.financialLogger.warnEvent('order.payment.failed', 'Pago de orden fallido', {
      orderId: payload.orderId,
      storeId: payload.storeId,
      buyerId: payload.buyerId,
      reason,
    });
  }

  // --- Handler de liberación: fulfillment.delivery.confirmed ---

  async handleDeliveryConfirmed(
    payload: DeliveryConfirmedPayload,
  ): Promise<void> {
    const tx = await this.findByOrderId(payload.orderId);
    if (!tx) {
      this.logger.warn(
        `delivery.confirmed sin transacción para orden ${payload.orderId}; ignorado.`,
      );
      return;
    }
    if (tx.status !== OrderTransactionStatus.HELD) {
      this.logger.warn(
        `Orden ${payload.orderId} no está HELD (${tx.status}); no se libera.`,
      );
      return;
    }

    // Transición atómica HELD → RELEASED (idempotente bajo concurrencia).
    const result = await this.txRepository.update(
      { orderId: payload.orderId, status: OrderTransactionStatus.HELD },
      { status: OrderTransactionStatus.RELEASED, releasedAt: new Date() },
    );
    if (result.affected !== 1) {
      this.logger.warn(`Orden ${payload.orderId} ya liberada; ignorado.`);
      return;
    }

    // Registrar el desembolso al negocio (en sandbox solo se loguea).
    const store = await this.storesService.findStore(tx.storeId);
    this.payoutService.disburse(store, tx.storeId, tx.storePayoutAmount);

    await this.eventPublisher.publish(PublishedEvents.PAYMENT_RELEASED, {
      orderId: payload.orderId,
      storeId: tx.storeId,
      storePayoutAmount: tx.storePayoutAmount,
      platformFeeAmount: tx.platformFeeAmount,
    });
    this.financialLogger.logEvent('order.payment.released', 'Pago liberado al negocio', {
      orderId: payload.orderId,
      storeId: tx.storeId,
      storePayoutAmount: tx.storePayoutAmount,
      platformFeeAmount: tx.platformFeeAmount,
    });
  }

  // --- Handler de reembolso: order.order.cancelled ---

  async handleOrderCancelled(payload: OrderCancelledPayload): Promise<void> {
    const tx = await this.findByOrderId(payload.orderId);
    if (!tx) {
      this.logger.warn(
        `order.cancelled sin transacción para orden ${payload.orderId}; ignorado.`,
      );
      return;
    }
    if (tx.status === OrderTransactionStatus.RELEASED) {
      // La entrega ya ocurrió: no se reembolsa.
      this.logger.warn(
        `Orden ${payload.orderId} ya RELEASED; no se reembolsa.`,
      );
      return;
    }
    if (tx.status !== OrderTransactionStatus.HELD) {
      this.logger.warn(
        `Orden ${payload.orderId} en estado ${tx.status}; no se reembolsa.`,
      );
      return;
    }

    // Transición atómica HELD → REFUNDED + acreditación del total cobrado.
    const refunded = await this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        OrderTransaction,
        { orderId: payload.orderId, status: OrderTransactionStatus.HELD },
        { status: OrderTransactionStatus.REFUNDED, refundedAt: new Date() },
      );
      if (result.affected !== 1) {
        return false; // ya procesada por otro evento concurrente.
      }
      await this.walletsService.creditWallet(
        tx.walletId,
        tx.totalCharged,
        manager,
      );
      return true;
    });

    if (!refunded) {
      this.logger.warn(`Orden ${payload.orderId} ya reembolsada; ignorado.`);
      return;
    }

    await this.eventPublisher.publish(PublishedEvents.REFUND_ISSUED, {
      orderId: payload.orderId,
      walletId: tx.walletId,
      refundedAmount: tx.totalCharged,
    });
    this.financialLogger.logEvent('order.payment.refunded', 'Pago reembolsado al comprador', {
      orderId: payload.orderId,
      walletId: tx.walletId,
      refundedAmount: tx.totalCharged,
    });
  }
}
