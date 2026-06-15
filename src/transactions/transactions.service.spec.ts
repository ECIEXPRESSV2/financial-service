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
    };
    const walletsService = {
      findWalletByUserIdNullable: jest.fn().mockResolvedValue(activeWallet),
      debitWallet: jest.fn().mockResolvedValue(overrides.debited ?? false),
    };
    const storesService = {
      findStore: jest.fn().mockResolvedValue(activeStore),
    };
    const payoutService = { disburse: jest.fn() };
    const eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };
    const manager = { insert: jest.fn().mockResolvedValue(undefined) };
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) };

    const service = new TransactionsService(
      txRepository as any,
      walletsService as any,
      storesService as any,
      payoutService as any,
      eventPublisher as any,
      dataSource as any,
      { logEvent: jest.fn(), warnEvent: jest.fn() } as any,
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
