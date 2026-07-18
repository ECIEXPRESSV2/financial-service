/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { TransactionsService } from './transactions.service';
import {
  FailureReason,
  OrderTransactionStatus,
} from './entities/order-transaction.entity';
import { PublishedEvents } from '../events/event-patterns';
import { OrderCreatedPayload } from '../events/payloads/order.payloads';

describe('TransactionsService.handleOrderCreated', () => {
  const payload: OrderCreatedPayload = {
    orderId: 'order-1',
    buyerId: 'buyer-1',
    storeId: 'store-1',
    totalAmount: 100000,
  };

  const activeStore = {
    id: 'store-1',
    isActive: true,
    platformFeePercent: 5,
    peakFeePercent: 3,
    peakDays: null,
    peakHoursStart: null,
    peakHoursEnd: null,
  };
  const activeWallet = { id: 'wallet-1', isActive: true };

  function buildService(overrides: { existing?: unknown; debited?: boolean }) {
    const txRepository = {
      findOne: jest.fn().mockResolvedValue(overrides.existing ?? null),
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const walletsService = {
      findWalletByUserIdNullable: jest.fn().mockResolvedValue(activeWallet),
      debitWallet: jest.fn().mockResolvedValue(overrides.debited ?? false),
      // Al generar el comprobante se resuelve el correo del comprador.
      findUserById: jest.fn().mockResolvedValue({ id: 'buyer-1', email: 'buyer-1@eci.edu.co' }),
    };
    const storesService = {
      findStore: jest.fn().mockResolvedValue(activeStore),
    };
    const eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const manager = { insert: jest.fn().mockResolvedValue(undefined) };
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };
    const receiptsService = {
      generate: jest.fn().mockResolvedValue({
        blobPath: 'pagos_pedidos/order-1/comprobante-1700000000.html',
        attachment: {
          filename: 'comprobante-1700000000.html',
          contentType: 'text/html; charset=utf-8',
          contentBase64: 'PGh0bWw+',
        },
      }),
    };
    const config = { get: jest.fn().mockReturnValue(60) };

    const service = new TransactionsService(
      txRepository as any,
      walletsService as any,
      storesService as any,
      eventPublisher as any,
      dataSource as any,
      { logEvent: jest.fn(), warnEvent: jest.fn() } as any,
      receiptsService as any,
      config as any,
    );
    return { service, txRepository, walletsService, eventPublisher, manager };
  }

  it('es idempotente: si la orden ya existe no debita ni publica', async () => {
    const { service, walletsService, eventPublisher } = buildService({
      existing: { orderId: 'order-1', status: OrderTransactionStatus.HELD },
    });

    await service.handleOrderCreated(payload);

    expect(walletsService.debitWallet).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('con saldo insuficiente crea FAILED y publica payment.failed sin afectar el saldo', async () => {
    const { service, txRepository, eventPublisher } = buildService({
      debited: false,
    });

    await service.handleOrderCreated(payload);

    expect(txRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        status: OrderTransactionStatus.FAILED,
        failureReason: FailureReason.INSUFFICIENT_FUNDS,
      }),
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      PublishedEvents.PAYMENT_FAILED,
      expect.objectContaining({
        orderId: 'order-1',
        reason: FailureReason.INSUFFICIENT_FUNDS,
      }),
    );
  });

  it('con saldo suficiente debita, crea HELD y publica payment.processed', async () => {
    const { service, walletsService, eventPublisher, manager } = buildService({
      debited: true,
    });

    await service.handleOrderCreated(payload);

    expect(walletsService.debitWallet).toHaveBeenCalledWith(
      'wallet-1',
      100000, // sin hora pico: total = order amount
      expect.anything(),
    );
    expect(manager.insert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: OrderTransactionStatus.HELD }),
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      PublishedEvents.PAYMENT_PROCESSED,
      expect.objectContaining({ orderId: 'order-1', totalCharged: 100000 }),
    );
  });
});

describe('TransactionsService.handleOrderCancelled', () => {
  // orderAmount 100000, peakFeeAmount 10000 (hora pico), totalCharged 110000,
  // platformFeeAmount 5000, storePayoutAmount 95000 (= orderAmount - platformFeeAmount).
  const heldTx = {
    orderId: 'order-1',
    walletId: 'wallet-1',
    storeId: 'store-1',
    orderAmount: 100000,
    peakFeeAmount: 10000,
    totalCharged: 110000,
    platformFeeAmount: 5000,
    storePayoutAmount: 95000,
    refundedAmount: 0,
    status: OrderTransactionStatus.HELD,
  };

  function buildService(tx: Partial<typeof heldTx> = {}) {
    const merged = { ...heldTx, ...tx };
    const txRepository = { findOne: jest.fn().mockResolvedValue(merged) };
    const walletsService = {
      creditWallet: jest.fn().mockResolvedValue(undefined),
      findWalletById: jest.fn().mockResolvedValue({ id: 'wallet-1', userId: 'buyer-1' }),
    };
    const storesService = { findStore: jest.fn().mockResolvedValue({ id: 'store-1' }) };
    const eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const manager = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

    const service = new TransactionsService(
      txRepository as any,
      walletsService as any,
      storesService as any,
      eventPublisher as any,
      dataSource as any,
      { logEvent: jest.fn(), warnEvent: jest.fn() } as any,
      {} as any,
      {} as any,
    );
    return { service, walletsService, storesService, eventPublisher, manager };
  }

  it('sin refundPolicy: reembolsa el 100% al comprador y no libera nada al negocio (comportamiento histórico)', async () => {
    const { service, walletsService, manager, eventPublisher } = buildService();

    await service.handleOrderCancelled({ orderId: 'order-1' });

    expect(walletsService.creditWallet).toHaveBeenCalledWith('wallet-1', 110000, expect.anything());
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: OrderTransactionStatus.HELD }),
      expect.objectContaining({ status: OrderTransactionStatus.REFUNDED, refundedAmount: 110000 }),
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      PublishedEvents.REFUND_ISSUED,
      expect.objectContaining({ refundedAmount: 110000 }),
    );
  });

  it('HALF_PRODUCTS_ONLY: reembolsa la mitad de productos y libera la mitad del payout al negocio', async () => {
    const { service, walletsService, manager, eventPublisher } = buildService();

    await service.handleOrderCancelled({ orderId: 'order-1', refundPolicy: 'HALF_PRODUCTS_ONLY' });

    // Mitad de orderAmount (100000) al comprador; la hora pico (10000) se pierde por completo.
    expect(walletsService.creditWallet).toHaveBeenCalledWith('wallet-1', 50000, expect.anything());
    // Mitad de storePayoutAmount (95000) queda disponible para un giro futuro (RELEASED).
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        status: OrderTransactionStatus.RELEASED,
        refundedAmount: 50000,
        storePayoutAmount: 47500,
      }),
    );
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      PublishedEvents.REFUND_ISSUED,
      expect.objectContaining({ refundedAmount: 50000 }),
    );
  });

  it('NO_REFUND: el comprador no recibe nada y el negocio recibe el payout completo', async () => {
    const { service, walletsService, manager, eventPublisher } = buildService();

    await service.handleOrderCancelled({ orderId: 'order-1', refundPolicy: 'NO_REFUND' });

    expect(walletsService.creditWallet).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        status: OrderTransactionStatus.RELEASED,
        refundedAmount: 0,
        storePayoutAmount: 95000,
      }),
    );
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('no hace nada si la transacción ya está RELEASED (la entrega ya ocurrió)', async () => {
    const { service, walletsService } = buildService({ status: OrderTransactionStatus.RELEASED });

    await service.handleOrderCancelled({ orderId: 'order-1', refundPolicy: 'HALF_PRODUCTS_ONLY' });

    expect(walletsService.creditWallet).not.toHaveBeenCalled();
  });
});

describe('TransactionsService.handleReturnConfirmed', () => {
  const heldTx = {
    orderId: 'order-1',
    walletId: 'wallet-1',
    storeId: 'store-1',
    orderAmount: 100000,
    peakFeeAmount: 10000,
    totalCharged: 110000,
    refundedAmount: 0,
    status: OrderTransactionStatus.HELD,
  };

  function buildService(tx: Partial<typeof heldTx> = {}) {
    const merged = { ...heldTx, ...tx };
    const txRepository = { findOne: jest.fn().mockResolvedValue(merged) };
    const walletsService = { creditWallet: jest.fn().mockResolvedValue(undefined) };
    const eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const manager = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

    const service = new TransactionsService(
      txRepository as any,
      walletsService as any,
      {} as any,
      eventPublisher as any,
      dataSource as any,
      { logEvent: jest.fn(), warnEvent: jest.fn() } as any,
      {} as any,
      {} as any,
    );
    return { service, walletsService, eventPublisher, manager };
  }

  it('full=true reembolsa TODO lo que queda de total_charged, incluida la hora pico (no solo lo que cotizó products)', async () => {
    const { service, walletsService, manager } = buildService();

    // products solo conoce precios de producto: cotiza 100000 (sin el pico de 10000).
    await service.handleReturnConfirmed({
      orderId: 'order-1', buyerId: 'buyer-1', storeId: 'store-1', full: true, refundAmount: 100000,
    });

    expect(walletsService.creditWallet).toHaveBeenCalledWith('wallet-1', 110000, expect.anything());
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ refundedAmount: 110000, status: OrderTransactionStatus.REFUNDED }),
    );
  });

  it('full=false respeta el monto cotizado por products, acotado a lo que quede', async () => {
    const { service, walletsService } = buildService();

    await service.handleReturnConfirmed({
      orderId: 'order-1', buyerId: 'buyer-1', storeId: 'store-1', full: false, refundAmount: 30000,
    });

    expect(walletsService.creditWallet).toHaveBeenCalledWith('wallet-1', 30000, expect.anything());
  });
});
