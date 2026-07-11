import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import {
  FailureReason,
  OrderTransaction,
  OrderTransactionStatus,
} from './entities/order-transaction.entity';
import { isPeakHour } from './pricing.util';
import { WalletsService } from '../wallets/wallets.service';
import { StoresService } from '../stores/stores.service';
import { PayoutService } from '../payouts/payout.service';
import { EventPublisherService } from '../events/event-publisher.service';
import { PublishedEvents } from '../events/event-patterns';
import {
  OrderCreatedPayload,
  OrderCancelledPayload,
  ReturnConfirmedPayload,
} from '../events/payloads/order.payloads';
import { DeliveryConfirmedPayload } from '../events/payloads/fulfillment.payloads';
import { FinancialLogger } from '../common/logger/financial.logger';
import { ReceiptsService, ReceiptConcept } from '../receipts/receipts.service';

// Código de error de PostgreSQL para violación de unicidad (idempotencia por order_id).
const PG_UNIQUE_VIOLATION = '23505';

/** Agregado de montos (centavos COP) de un conjunto de transacciones. */
export interface EarningsBucket {
  count: number;
  /** Valor bruto de los pedidos (SUM order_amount). */
  grossAmount: number;
  /** Descuento por uso de la app (SUM platform_fee_amount). */
  platformFeeAmount: number;
  /** Neto que recibe el negocio (SUM store_payout_amount). */
  netAmount: number;
}

/** Resumen de ganancias del negocio en el mes en curso. */
export interface StoreEarnings {
  month: string; // 'YYYY-MM'
  currency: 'COP';
  platformFeePercent: number;
  received: EarningsBucket; // RELEASED: ya desembolsado
  pending: EarningsBucket; // HELD: se libera al entregar
  totals: EarningsBucket;
}

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
    private readonly receiptsService: ReceiptsService,
    private readonly config: ConfigService,
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

  /**
   * URL de lectura (SAS de corta vida) del comprobante de un pago de pedido. Verifica
   * que el pedido pertenezca a la billetera del usuario antes de firmar el SAS.
   */
  async getReceiptSasUrl(
    userId: string,
    orderId: string,
  ): Promise<{ url: string; expiresInMinutes: number }> {
    const wallet = await this.walletsService.findWalletByUserId(userId);
    const tx = await this.findByOrderId(orderId);
    if (!tx || tx.walletId !== wallet.id) {
      throw new NotFoundException('Transacción no encontrada.');
    }
    if (!tx.receiptBlobPath) {
      throw new NotFoundException(
        'Este pago no tiene un comprobante archivado.',
      );
    }
    const url = await this.receiptsService.getReceiptSasUrl(tx.receiptBlobPath);
    if (!url) {
      throw new NotFoundException(
        'No se pudo generar el enlace del comprobante.',
      );
    }
    const ttl = this.config.get<number>('blobStorage.sasTtlMinutes') ?? 60;
    return { url, expiresInMinutes: ttl };
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

  /**
   * Resumen de ganancias del negocio en el mes en curso, para el panel del vendedor.
   * Agrega las transacciones por estado: RELEASED = ya recibido, HELD = pendiente de
   * entrega. Devuelve el bruto (valor de los pedidos), lo que ECIExpress descuenta por
   * uso de la app (comisión de plataforma) y lo neto que recibe el negocio.
   */
  async getStoreEarnings(storeId: string): Promise<StoreEarnings> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const sumFor = async (
      status: OrderTransactionStatus,
    ): Promise<EarningsBucket> => {
      const row = await this.txRepository
        .createQueryBuilder('tx')
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(tx.order_amount), 0)', 'gross')
        .addSelect('COALESCE(SUM(tx.platform_fee_amount), 0)', 'fee')
        .addSelect('COALESCE(SUM(tx.store_payout_amount), 0)', 'net')
        .where('tx.store_id = :storeId', { storeId })
        .andWhere('tx.status = :status', { status })
        .andWhere('tx.created_at >= :monthStart', { monthStart })
        .getRawOne<{ count: string; gross: string; fee: string; net: string }>();
      return {
        count: parseInt(row?.count ?? '0', 10),
        grossAmount: parseInt(row?.gross ?? '0', 10),
        platformFeeAmount: parseInt(row?.fee ?? '0', 10),
        netAmount: parseInt(row?.net ?? '0', 10),
      };
    };

    const [received, pending] = await Promise.all([
      sumFor(OrderTransactionStatus.RELEASED),
      sumFor(OrderTransactionStatus.HELD),
    ]);

    const totals: EarningsBucket = {
      count: received.count + pending.count,
      grossAmount: received.grossAmount + pending.grossAmount,
      platformFeeAmount: received.platformFeeAmount + pending.platformFeeAmount,
      netAmount: received.netAmount + pending.netAmount,
    };

    const store = await this.storesService.findStore(storeId);

    return {
      month: monthLabel,
      currency: 'COP',
      platformFeePercent: store?.platformFeePercent ?? 0,
      received,
      pending,
      totals,
    };
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

    // 4. Calcular el desglose de montos. El recargo de hora pico lo FIJA orders-service en el
    //    checkout (el precio que vio el comprador == el que se cobra); financial no lo recalcula.
    //    Solo deriva la comisión de plataforma (su responsabilidad) sobre el valor de los productos.
    //    Retrocompat: si el evento no trae el desglose, `orderAmount` cae a `totalAmount` y se
    //    reevalúa la hora pico como antes.
    let orderAmount: number;
    let peakFeeAmount: number;
    let peak: boolean;
    if (payload.orderAmount !== undefined) {
      orderAmount = payload.orderAmount;
      peakFeeAmount = payload.peakFeeAmount ?? 0;
      peak = payload.isPeakHour ?? peakFeeAmount > 0;
    } else {
      // Evento legado: solo trae totalAmount como base; se recalcula el pico como antes.
      orderAmount = payload.totalAmount;
      peak = isPeakHour(new Date(), {
        peakDays: store.peakDays,
        peakHoursStart: store.peakHoursStart,
        peakHoursEnd: store.peakHoursEnd,
      });
      peakFeeAmount = peak
        ? Math.round((orderAmount * store.peakFeePercent) / 100)
        : 0;
    }
    const platformFeeAmount = Math.round(
      (orderAmount * store.platformFeePercent) / 100,
    );
    const breakdown = {
      orderAmount,
      peakFeeAmount,
      totalCharged: orderAmount + peakFeeAmount,
      platformFeeAmount,
      storePayoutAmount: orderAmount - platformFeeAmount,
      isPeakHour: peak,
    };

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
          refundedAmount: 0,
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

    // 6. Generar el comprobante de pago (archivado en blob + adjunto para el correo).
    const receipt = await this.buildOrderReceipt(
      payload.orderId,
      payload.buyerId,
      breakdown.totalCharged,
    );

    // 7. Publicar el cobro exitoso.
    await this.eventPublisher.publish(PublishedEvents.PAYMENT_PROCESSED, {
      orderId: payload.orderId,
      userId: payload.buyerId, // destinatario para notifications-service
      walletId: wallet.id,
      storeId: store.id,
      orderAmount: breakdown.orderAmount,
      peakFeeAmount: breakdown.peakFeeAmount,
      totalCharged: breakdown.totalCharged,
      isPeakHour: breakdown.isPeakHour,
      // Adjunto (HTML del comprobante en base64) para el correo de notifications.
      receipt: receipt?.attachment,
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
   * Genera el comprobante del pago del pedido, lo archiva en el Blob Storage privado y
   * persiste su ruta en la transacción (para regenerar el SAS bajo demanda). Nunca
   * lanza: si algo falla, el cobro ya está hecho y solo se pierde el archivado/adjunto.
   */
  private async buildOrderReceipt(
    orderId: string,
    buyerId: string,
    totalCharged: number,
  ) {
    try {
      const walletUser = await this.walletsService.findUserById(buyerId);
      const receipt = await this.receiptsService.generate(
        'order_payment',
        orderId,
        {
          concept: ReceiptConcept.ORDER_PAYMENT,
          amountCents: totalCharged,
          paymentMethodLabel: 'Billetera ECIExpress',
          buyer: walletUser?.email ?? buyerId,
          referenceLabel: 'ID pedido',
          reference: orderId,
          date: new Date(),
        },
      );
      if (receipt.blobPath) {
        await this.txRepository.update(
          { orderId },
          { receiptBlobPath: receipt.blobPath },
        );
      }
      return receipt;
    } catch (error) {
      this.logger.error(
        `No se pudo generar el comprobante del pedido ${orderId}: ${(error as Error).message}`,
      );
      return null;
    }
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
        orderAmount: payload.orderAmount ?? payload.totalAmount,
        peakFeeAmount: 0,
        totalCharged: 0,
        platformFeeAmount: 0,
        storePayoutAmount: 0,
        status: OrderTransactionStatus.FAILED,
        refundedAmount: 0,
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
      userId: payload.buyerId, // destinatario para notifications-service
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

  // --- Handler de reembolso parcial/total: order.return.confirmed ---

  /**
   * Reembolsa a la billetera del comprador el monto de una devolución cotizada por
   * products y autorizada por orders. Soporta devoluciones parciales acumulativas:
   * nunca reembolsa más que `total_charged`. Atómico y a prueba de concurrencia.
   */
  async handleReturnConfirmed(payload: ReturnConfirmedPayload): Promise<void> {
    const tx = await this.findByOrderId(payload.orderId);
    if (!tx) {
      this.logger.warn(
        `return.confirmed sin transacción para orden ${payload.orderId}; ignorado.`,
      );
      return;
    }
    if (
      tx.status === OrderTransactionStatus.FAILED ||
      tx.status === OrderTransactionStatus.REFUNDED
    ) {
      this.logger.warn(
        `Orden ${payload.orderId} en estado ${tx.status}; no admite más reembolsos.`,
      );
      return;
    }

    const remaining = tx.totalCharged - tx.refundedAmount;
    if (remaining <= 0) {
      this.logger.warn(`Orden ${payload.orderId} ya reembolsada por completo; ignorado.`);
      return;
    }
    // El monto reembolsado nunca excede lo cobrado.
    const amount = Math.min(Math.max(payload.refundAmount, 0), remaining);
    if (amount <= 0) {
      this.logger.warn(`Monto de devolución no válido para ${payload.orderId}; ignorado.`);
      return;
    }

    const newRefunded = tx.refundedAmount + amount;
    const fullyRefunded = payload.full || newRefunded >= tx.totalCharged;

    // Crédito al wallet + actualización de la transacción en una sola transacción atómica.
    // El WHERE sobre refunded_amount evita condiciones de carrera ante eventos concurrentes.
    const applied = await this.dataSource.transaction(async (manager) => {
      const result = await manager.update(
        OrderTransaction,
        { orderId: payload.orderId, refundedAmount: tx.refundedAmount },
        {
          refundedAmount: newRefunded,
          status: fullyRefunded
            ? OrderTransactionStatus.REFUNDED
            : OrderTransactionStatus.PARTIALLY_REFUNDED,
          refundedAt: new Date(),
        },
      );
      if (result.affected !== 1) {
        return false; // otro evento concurrente ya actualizó el acumulado.
      }
      await this.walletsService.creditWallet(tx.walletId, amount, manager);
      return true;
    });

    if (!applied) {
      this.logger.warn(`Devolución de ${payload.orderId} ya aplicada concurrentemente; ignorado.`);
      return;
    }

    await this.eventPublisher.publish(PublishedEvents.REFUND_ISSUED, {
      orderId: payload.orderId,
      userId: payload.buyerId,
      walletId: tx.walletId,
      refundedAmount: amount,
      totalRefunded: newRefunded,
      full: fullyRefunded,
    });
    this.financialLogger.logEvent('order.payment.refunded', 'Devolución reembolsada al comprador', {
      orderId: payload.orderId,
      walletId: tx.walletId,
      refundedAmount: amount,
      totalRefunded: newRefunded,
      full: fullyRefunded,
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

    // Resolvemos el dueño de la billetera para que el evento lleve el destinatario.
    const refundWallet = await this.walletsService.findWalletById(tx.walletId);
    await this.eventPublisher.publish(PublishedEvents.REFUND_ISSUED, {
      orderId: payload.orderId,
      userId: refundWallet?.userId,
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
