import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { WalletUser } from './entities/wallet-user.entity';
import { Wallet } from './entities/wallet.entity';
import {
  UserRegisteredPayload,
  UserDeletedPayload,
} from '../events/payloads/identity.payloads';
import { FinancialLogger } from '../common/logger/financial.logger';

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    @InjectRepository(WalletUser)
    private readonly walletUserRepository: Repository<WalletUser>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly dataSource: DataSource,
    private readonly financialLogger: FinancialLogger,
  ) {}

  // --- Lectura para el controlador (header x-user-id) ---

  /** Devuelve la billetera del comprador o lanza 404 si no existe. */
  async findWalletByUserId(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException(
        'El usuario no tiene una billetera registrada.',
      );
    }
    return wallet;
  }

  /** Igual que el anterior pero devuelve null en lugar de lanzar (uso en handlers). */
  async findWalletByUserIdNullable(userId: string): Promise<Wallet | null> {
    return this.walletRepository.findOne({ where: { userId } });
  }

  /**
   * Resuelve la billetera por su id. Útil para obtener el `userId` (dueño) a partir del
   * `walletId` cuando se va a publicar un evento que debe llevar el destinatario.
   */
  async findWalletById(walletId: string): Promise<Wallet | null> {
    return this.walletRepository.findOne({ where: { id: walletId } });
  }

  /** Devuelve la proyección del usuario o null si no existe. */
  async findUserById(userId: string): Promise<WalletUser | null> {
    return this.walletUserRepository.findOne({ where: { id: userId } });
  }

  // --- Operaciones atómicas sobre el saldo ---

  /**
   * Debita `amount` centavos del wallet de forma atómica y a prueba de concurrencia.
   * Usa un UPDATE condicional: solo descuenta si hay saldo suficiente y la billetera
   * está activa. Devuelve true si se debitó (1 fila afectada), false si no alcanzó.
   *
   * Acepta un EntityManager para participar en la transacción del cobro de una orden.
   */
  async debitWallet(
    walletId: string,
    amount: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    const mgr = manager ?? this.walletRepository.manager;
    const result = await mgr
      .createQueryBuilder()
      .update(Wallet)
      .set({ balance: () => 'balance - :amt', updatedAt: () => 'now()' })
      .where('id = :id', { id: walletId })
      .andWhere('balance >= :amt')
      .andWhere('is_active = true')
      .setParameter('amt', amount)
      .execute();
    return result.affected === 1;
  }

  /**
   * Acredita `amount` centavos al wallet de forma atómica. Devuelve true si se acreditó.
   * Se usa tanto desde el webhook de recargas como en los reembolsos por cancelación.
   */
  async creditWallet(
    walletId: string,
    amount: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    const mgr = manager ?? this.walletRepository.manager;
    const result = await mgr
      .createQueryBuilder()
      .update(Wallet)
      .set({ balance: () => 'balance + :amt', updatedAt: () => 'now()' })
      .where('id = :id', { id: walletId })
      .andWhere('is_active = true')
      .setParameter('amt', amount)
      .execute();
    return result.affected === 1;
  }

  // --- Handlers de eventos del bus (idempotentes) ---

  /**
   * `identity.user.registered`: crea la proyección del comprador y su billetera con
   * saldo 0. Idempotente: si el usuario ya existe no hace nada.
   */
  async handleUserRegistered(payload: UserRegisteredPayload): Promise<void> {
    const existing = await this.walletUserRepository.findOne({
      where: { id: payload.userId },
    });
    if (existing) {
      this.logger.log(`Usuario ${payload.userId} ya existe; evento ignorado.`);
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      // Doble verificación dentro de la transacción por si llegan eventos concurrentes.
      const user = await manager.findOne(WalletUser, {
        where: { id: payload.userId },
      });
      if (user) {
        return;
      }
      await manager.insert(WalletUser, {
        id: payload.userId,
        email: payload.email,
        isActive: true,
      });
      await manager.insert(Wallet, {
        userId: payload.userId,
        balance: 0,
        isActive: true,
      });
    });

    this.financialLogger.logEvent('wallet.created', 'Billetera creada', {
      userId: payload.userId,
      email: payload.email,
    });
  }

  /**
   * `identity.user.deleted`: desactiva el comprador y su billetera. Idempotente.
   */
  async handleUserDeleted(payload: UserDeletedPayload): Promise<void> {
    await this.walletUserRepository.update(
      { id: payload.userId },
      { isActive: false },
    );
    await this.walletRepository.update(
      { userId: payload.userId },
      { isActive: false },
    );
    this.logger.log(`Usuario ${payload.userId} desactivado.`);
  }
}
