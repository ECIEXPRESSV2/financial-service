/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
import { TopupsService } from './topups.service';
import { TopupStatus, WalletTopup } from './entities/wallet-topup.entity';
import { WompiWebhookEvent } from '../wompi/wompi.service';
import { PublishedEvents } from '../events/event-patterns';

describe('TopupsService.handleWebhookEvent (idempotencia)', () => {
  const topup: Partial<WalletTopup> = {
    id: 'topup-1',
    walletId: 'wallet-1',
    amount: 50000,
    status: TopupStatus.PENDING,
  };

  function buildEvent(
    status: WompiWebhookEvent['data']['transaction']['status'],
  ) {
    return {
      event: 'transaction.updated',
      data: {
        transaction: {
          id: 'wompi-tx-1',
          status,
          reference: 'topup-1',
          amount_in_cents: 50000,
        },
      },
      signature: { checksum: 'x', properties: [] },
      timestamp: 1700000000,
    } as WompiWebhookEvent;
  }

  function buildService() {
    const topupRepository = {
      findOne: jest.fn().mockResolvedValue(topup),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const walletsService = { creditWallet: jest.fn().mockResolvedValue(true) };
    const eventPublisher = { publish: jest.fn().mockResolvedValue(undefined) };

    // El primer UPDATE condicional (PENDING -> APPROVED) afecta 1 fila; el segundo 0.
    const managerUpdate = jest
      .fn()
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });
    const manager = {
      update: managerUpdate,
      findOneOrFail: jest.fn().mockResolvedValue(topup),
    };
    const dataSource = {
      transaction: jest.fn((cb: any) => cb(manager)),
    };

    const service = new TopupsService(
      topupRepository as any,
      walletsService as any,
      {} as any, // wompiService (no se usa en este flujo)
      eventPublisher as any,
      dataSource as any,
    );
    return { service, walletsService, eventPublisher };
  }

  it('acredita el saldo una sola vez aunque el webhook APPROVED llegue dos veces', async () => {
    const { service, walletsService, eventPublisher } = buildService();
    const event = buildEvent('APPROVED');

    await service.handleWebhookEvent(event); // primera entrega
    await service.handleWebhookEvent(event); // entrega duplicada

    expect(walletsService.creditWallet).toHaveBeenCalledTimes(1);
    expect(walletsService.creditWallet).toHaveBeenCalledWith(
      'wallet-1',
      50000,
      expect.anything(),
    );
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      PublishedEvents.WALLET_TOPUP_APPROVED,
      expect.objectContaining({ topupId: 'topup-1', amount: 50000 }),
    );
  });

  it('marca FAILED sin acreditar cuando la transacción es DECLINED', async () => {
    const { service, walletsService } = buildService();
    await service.handleWebhookEvent(buildEvent('DECLINED'));
    expect(walletsService.creditWallet).not.toHaveBeenCalled();
  });
});
