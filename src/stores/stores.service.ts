import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from './entities/store.entity';
import { UpdateCommissionConfigDto } from './dto/update-commission-config.dto';
import { UpdatePeakConfigDto } from './dto/update-peak-config.dto';
import { UpdatePayoutAccountDto } from './dto/update-payout-account.dto';
import { computeCommissions, isPeakHour } from '../transactions/pricing.util';
import {
  StoreUpsertedPayload,
  StoreStatusChangedPayload,
} from '../events/payloads/identity.payloads';

/**
 * Info de comisiones de un negocio para mostrar en la factura del comprador y en el panel
 * del vendedor. Si se cotiza un `amount` (centavos COP) se incluyen los montos calculados.
 */
export interface StoreCommissionInfo {
  storeId: string;
  platformFeePercent: number;
  peakFeePercent: number;
  isPeakHour: boolean;
  peakHoursStart: string | null;
  peakHoursEnd: string | null;
  peakDays: string[] | null;
  orderAmount: number;
  /** Recargo de hora pico que paga el comprador (0 si no es hora pico o no se cotizó monto). */
  peakFeeAmount: number;
  /** Comisión de plataforma que se descuenta al negocio (informativa; no la paga el comprador). */
  platformFeeAmount: number;
  /** Total que se debita del comprador = orderAmount + peakFeeAmount. */
  totalCharged: number;
}

@Injectable()
export class StoresService {
  private readonly logger = new Logger(StoresService.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly configService: ConfigService,
  ) {}

  /** Busca un store por id o lanza 404. */
  async findStoreOrThrow(storeId: string): Promise<Store> {
    const store = await this.storeRepository.findOne({
      where: { id: storeId },
    });
    if (!store) {
      throw new NotFoundException(`Negocio ${storeId} no encontrado.`);
    }
    return store;
  }

  async findStore(storeId: string): Promise<Store | null> {
    return this.storeRepository.findOne({ where: { id: storeId } });
  }

  // --- Endpoints de negocio (header x-store-id) ---

  /** Actualiza la cuenta de desembolso del negocio. */
  async updatePayoutAccount(
    storeId: string,
    dto: UpdatePayoutAccountDto,
  ): Promise<Store> {
    const store = await this.findStoreOrThrow(storeId);
    store.payoutType = dto.type;
    store.payoutAccountNumber = dto.accountNumber;
    store.payoutBankCode = dto.bankCode ?? null;
    store.payoutHolderName = dto.holderName;
    return this.storeRepository.save(store);
  }

  /**
   * Actualiza SOLO la hora pico (franja + recargo) del propio negocio. Lo usa el vendedor
   * desde su panel, igual que mueve su horario. No toca la comisión de plataforma.
   */
  async updatePeakConfig(
    storeId: string,
    dto: UpdatePeakConfigDto,
  ): Promise<Store> {
    const store = await this.findStoreOrThrow(storeId);

    if (dto.peakFeePercent !== undefined) {
      store.peakFeePercent = dto.peakFeePercent;
    }
    if (dto.peakHoursStart !== undefined) {
      store.peakHoursStart = dto.peakHoursStart;
    }
    if (dto.peakHoursEnd !== undefined) {
      store.peakHoursEnd = dto.peakHoursEnd;
    }
    if (dto.peakDays !== undefined) {
      store.peakDays = dto.peakDays;
    }

    return this.storeRepository.save(store);
  }

  /**
   * Devuelve la configuración de comisiones del negocio, si es hora pico AHORA
   * (America/Bogota) y —cuando se pasa `amount` (centavos COP)— los montos calculados.
   * La consume orders-service para cotizar la factura y el panel del vendedor para
   * mostrar su hora pico.
   */
  async getCommissionInfo(
    storeId: string,
    amount = 0,
  ): Promise<StoreCommissionInfo> {
    const store = await this.findStoreOrThrow(storeId);
    const peak = isPeakHour(new Date(), {
      peakDays: store.peakDays,
      peakHoursStart: store.peakHoursStart,
      peakHoursEnd: store.peakHoursEnd,
    });
    const orderAmount = Math.max(0, Math.round(amount));
    const breakdown = computeCommissions({
      orderAmount,
      platformFeePercent: store.platformFeePercent,
      peakFeePercent: store.peakFeePercent,
      isPeak: peak,
    });

    return {
      storeId: store.id,
      platformFeePercent: store.platformFeePercent,
      peakFeePercent: store.peakFeePercent,
      isPeakHour: peak,
      peakHoursStart: store.peakHoursStart ?? null,
      peakHoursEnd: store.peakHoursEnd ?? null,
      peakDays: store.peakDays ?? null,
      orderAmount: breakdown.orderAmount,
      peakFeeAmount: breakdown.peakFeeAmount,
      platformFeeAmount: breakdown.platformFeeAmount,
      totalCharged: breakdown.totalCharged,
    };
  }

  // --- Endpoints de administración ---

  /** Actualiza la configuración de comisiones y franja de hora pico. */
  async updateCommissionConfig(
    storeId: string,
    dto: UpdateCommissionConfigDto,
  ): Promise<Store> {
    const store = await this.findStoreOrThrow(storeId);

    if (dto.platformFeePercent !== undefined) {
      store.platformFeePercent = dto.platformFeePercent;
    }
    if (dto.peakFeePercent !== undefined) {
      store.peakFeePercent = dto.peakFeePercent;
    }
    if (dto.peakHoursStart !== undefined) {
      store.peakHoursStart = dto.peakHoursStart;
    }
    if (dto.peakHoursEnd !== undefined) {
      store.peakHoursEnd = dto.peakHoursEnd;
    }
    if (dto.peakDays !== undefined) {
      store.peakDays = dto.peakDays;
    }

    return this.storeRepository.save(store);
  }

  // --- Handlers de eventos del bus (idempotentes) ---

  /**
   * `identity.store.created`: crea la proyección local del negocio con las comisiones
   * por defecto tomadas del entorno. Idempotente: si ya existe, no lo recrea.
   */
  async handleStoreCreated(payload: StoreUpsertedPayload): Promise<void> {
    const existing = await this.storeRepository.findOne({
      where: { id: payload.storeId },
    });
    if (existing) {
      this.logger.log(`Negocio ${payload.storeId} ya existe; evento ignorado.`);
      return;
    }

    const defaultPlatformFee = parseFloat(
      this.configService.get<string>('DEFAULT_PLATFORM_FEE_PERCENT') ?? '5',
    );
    const defaultPeakFee = parseFloat(
      this.configService.get<string>('DEFAULT_PEAK_FEE_PERCENT') ?? '3',
    );

    await this.storeRepository.insert({
      id: payload.storeId,
      status: 'OPEN',
      isActive: true,
      platformFeePercent: defaultPlatformFee,
      peakFeePercent: defaultPeakFee,
    });
    this.logger.log(
      `Negocio ${payload.storeId} creado con comisiones por defecto ` +
        `(plataforma ${defaultPlatformFee}%, pico ${defaultPeakFee}%).`,
    );
  }

  /**
   * `identity.store.updated`: financial no espeja el nombre del negocio ni otros datos
   * generales (las comisiones las administra un admin de ECIExpress). Solo se asegura de
   * que la proyección exista, por si el evento llega antes que `store.created`.
   */
  async handleStoreUpdated(payload: StoreUpsertedPayload): Promise<void> {
    const exists = await this.storeRepository.findOne({
      where: { id: payload.storeId },
    });
    if (!exists) {
      // Evento fuera de orden: creamos la proyección para no perderla.
      await this.handleStoreCreated(payload);
      return;
    }
    this.logger.log(
      `Negocio ${payload.storeId}: evento updated recibido (sin cambios financieros).`,
    );
  }

  /**
   * `identity.store.status_changed`: guarda el nuevo estado en la proyección y, según él,
   * activa o congela los desembolsos. Si el negocio vuelve a `OPEN` se reactiva y NO se
   * congelan transacciones; cualquier otro estado (CLOSED, TEMPORARILY_CLOSED, ...) lo
   * desactiva y congela los desembolsos pendientes. Idempotente.
   */
  async handleStoreStatusChanged(
    payload: StoreStatusChangedPayload,
  ): Promise<void> {
    const isOpen = payload.newStatus === 'OPEN';

    await this.storeRepository.update(
      { id: payload.storeId },
      { status: payload.newStatus, isActive: isOpen },
    );

    if (isOpen) {
      this.logger.log(
        `Negocio ${payload.storeId} reactivado (status=${payload.newStatus}); ` +
          `desembolsos habilitados.`,
      );
    } else {
      // Las transacciones HELD de este negocio no se liberarán mientras esté inactivo
      // (la liberación valida el estado del store).
      this.logger.warn(
        `Negocio ${payload.storeId} inactivo (status=${payload.newStatus}); ` +
          `desembolsos pendientes congelados.`,
      );
    }
  }
}
