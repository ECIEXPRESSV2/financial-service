/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { WalletsService } from './wallets.service';

/**
 * Mock encadenable del QueryBuilder de TypeORM. `execute` resuelve con el número de
 * filas afectadas que se le pase, para simular el UPDATE condicional atómico.
 */
function mockQueryBuilder(affected: number) {
  const execute = jest.fn().mockResolvedValue({ affected });
  const qb: any = {
    update: () => qb,
    set: () => qb,
    where: () => qb,
    andWhere: () => qb,
    setParameter: () => qb,
    execute,
  };
  return { qb, execute };
}

describe('WalletsService.debitWallet', () => {
  function buildService(affected: number) {
    const { qb, execute } = mockQueryBuilder(affected);
    const manager = { createQueryBuilder: jest.fn(() => qb) };
    const walletRepository: any = { manager };
    const service = new WalletsService(
      {} as any, // walletUserRepository (no se usa aquí)
      walletRepository,
      {} as any, // dataSource (no se usa aquí)
      { logEvent: jest.fn(), warnEvent: jest.fn() } as any,
    );
    return { service, execute };
  }

  it('debita y devuelve true cuando hay saldo suficiente (1 fila afectada)', async () => {
    const { service, execute } = buildService(1);
    await expect(service.debitWallet('wallet-1', 5000)).resolves.toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('NO debita y devuelve false con saldo insuficiente (0 filas afectadas)', async () => {
    const { service } = buildService(0);
    await expect(service.debitWallet('wallet-1', 5000)).resolves.toBe(false);
  });
});
