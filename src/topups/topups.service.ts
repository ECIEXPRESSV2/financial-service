import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TopupStatus, WalletTopup } from './entities/wallet-topup.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { CreateTopupDto } from './dto/create-topup.dto';
import { WalletsService } from '../wallets/wallets.service';
import { WompiService, WompiWebhookEvent } from '../wompi/wompi.service';
import { EventPublisherService } from '../events/event-publisher.service';
import { PublishedEvents } from '../events/event-patterns';
import { FinancialLogger } from '../common/logger/financial.logger';

@Injectable()
export class TopupsService {
  private readonly logger = new Logger(TopupsService.name);

  constructor(
    @InjectRepository(WalletTopup)
    private readonly topupRepository: Repository<WalletTopup>,
    private readonly walletsService: WalletsService,
    private readonly wompiService: WompiService,
    private readonly eventPublisher: EventPublisherService,
    private readonly dataSource: DataSource,
    private readonly financialLogger: FinancialLogger,
  ) {}

  /**
   * Inicia una recarga: crea el topup PENDING y la transacción en Wompi. NO acredita
   * saldo (eso solo ocurre desde el webhook validado). Devuelve los datos que el front
   * necesita para completar el pago.
   */
  async createTopup(userId: string, dto: CreateTopupDto) {
    const wallet = await this.walletsService.findWalletByUserId(userId);
    if (!wallet.isActive) {
      throw new ForbiddenException('La billetera está inactiva.');
    }

    const walletUser = await this.walletsService.findUserById(userId);
    const customerEmail = walletUser?.email ?? `${userId}@eciexpress.local`;
    this.logger.log(
      `Topup para usuario ${userId}: usando email "${customerEmail}".`,
    );

    // 1. Crear el topup en estado PENDING (su id se usa como referencia única en Wompi).
    const topup = await this.topupRepository.save(
      this.topupRepository.create({
        walletId: wallet.id,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod,
        status: TopupStatus.PENDING,
      }),
    );

    // 2. Crear la transacción en Wompi sandbox.
    let wompiData: Record<string, unknown>;
    try {
      wompiData = await this.wompiService.createTopupTransaction({
        topupId: topup.id,
        amountInCents: dto.amount,
        customerEmail,
        paymentMethod: dto.paymentMethod,
        paymentData: dto.paymentData as Record<string, unknown>,
      });
    } catch {
      // Si Wompi rechaza la creación, el topup queda FAILED para trazabilidad.
      await this.topupRepository.update(
        { id: topup.id },
        { status: TopupStatus.FAILED },
      );
      throw new BadRequestException(
        'No se pudo crear la transacción de pago en la pasarela.',
      );
    }

    // 3. Guardar el id de la transacción de Wompi (si vino) y su respuesta.
    const wompiTransactionId =
      typeof wompiData?.id === 'string' ? wompiData.id : null;
    await this.topupRepository.update(
      { id: topup.id },
      { wompiTransactionId, wompiResponse: wompiData as Record<string, any> },
    );

    this.financialLogger.logEvent('wallet.topup.created', 'Recarga iniciada', {
      topupId: topup.id,
      userId,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      wompiTransactionId,
    });

    const extra = (wompiData?.payment_method as Record<string, unknown>)
      ?.extra as Record<string, unknown> | undefined;

    return {
      topupId: topup.id,
      status: topup.status,
      amount: topup.amount,
      paymentMethod: topup.paymentMethod,
      // URL donde el usuario debe completar el pago (DAVIPLATA, PSE, BANCOLOMBIA_TRANSFER).
      // El frontend debe abrirla en una nueva pestaña: window.open(redirectUrl, '_blank').
      redirectUrl: (extra?.url ?? extra?.async_payment_url ?? null) as string | null,
      wompi: wompiData,
    };
  }

  /** Historial de recargas del comprador. */
  async getTopupsByUserId(userId: string): Promise<WalletTopup[]> {
    const wallet = await this.walletsService.findWalletByUserId(userId);
    return this.topupRepository.find({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Estado en vivo de una recarga consultando a Wompi. Devuelve la URL o el QR
   * donde el usuario completa/aprueba el pago (en sandbox), sin exponer la llave
   * privada al frontend. NO acredita saldo (eso solo ocurre desde el webhook).
   */
  async getTopupDetails(userId: string, topupId: string) {
    const wallet = await this.walletsService.findWalletByUserId(userId);
    const topup = await this.topupRepository.findOne({
      where: { id: topupId, walletId: wallet.id },
    });
    if (!topup) {
      throw new NotFoundException('Recarga no encontrada.');
    }

    let wompi: Record<string, any> | null = null;
    if (topup.wompiTransactionId) {
      wompi = await this.wompiService
        .getTransaction(topup.wompiTransactionId)
        .catch(() => null);
    }

    // Reconciliación: si Wompi ya aprobó pero el webhook no llegó (común en
    // sandbox / desarrollo local sin URL pública), acreditamos aquí mismo. Es
    // idempotente: si ya estaba acreditado, no hace nada.
    if (
      wompi?.status === 'APPROVED' &&
      topup.status === TopupStatus.PENDING &&
      topup.wompiTransactionId
    ) {
      const credited = await this.creditApprovedTopup(
        topup.id,
        topup.wompiTransactionId,
        { transaction: wompi },
      );
      if (credited) topup.status = TopupStatus.APPROVED;
    }

    const extra = (wompi?.payment_method as Record<string, any> | undefined)
      ?.extra as Record<string, any> | undefined;

    return {
      topupId: topup.id,
      amount: topup.amount,
      paymentMethod: topup.paymentMethod,
      // Estado local (lo único que mueve el saldo; ya reconciliado arriba).
      status: topup.status,
      // Estado en vivo reportado por Wompi (puede adelantarse al webhook).
      wompiStatus: (wompi?.status as string | undefined) ?? null,
      // URL para aprobar/completar el pago (NEQUI, DAVIPLATA, PSE, BANCOLOMBIA_TRANSFER).
      redirectUrl: (extra?.async_payment_url ?? extra?.url ?? null) as
        | string
        | null,
      // QR en base64 (BANCOLOMBIA_QR).
      qrImage: (extra?.qr_image ?? null) as string | null,
    };
  }

  /**
   * Procesa un evento del webhook de Wompi (la firma ya fue validada en el controlador).
   * Idempotente: el saldo solo se acredita la primera vez que el topup pasa de PENDING
   * a APPROVED, gracias al UPDATE condicional sobre el estado.
   */
  async handleWebhookEvent(event: WompiWebhookEvent): Promise<void> {
    const tx = event.data?.transaction;
    if (!tx?.reference) {
      this.logger.warn('Webhook de Wompi sin reference; ignorado.');
      return;
    }

    const topup = await this.topupRepository.findOne({
      where: { id: tx.reference },
    });
    if (!topup) {
      this.logger.warn(
        `Topup ${tx.reference} no encontrado; webhook ignorado.`,
      );
      return;
    }

    if (tx.status === 'APPROVED') {
      await this.approveTopup(topup.id, tx.id, event);
    } else if (
      tx.status === 'DECLINED' ||
      tx.status === 'ERROR' ||
      tx.status === 'VOIDED'
    ) {
      // Solo marca FAILED si seguía PENDING (no pisa una recarga ya aprobada).
      const failResult = await this.topupRepository.update(
        { id: topup.id, status: TopupStatus.PENDING },
        {
          status: TopupStatus.FAILED,
          wompiTransactionId: tx.id,
          wompiResponse: event.data as unknown as Record<string, any>,
        },
      );
      this.financialLogger.warnEvent('wallet.topup.failed', 'Recarga fallida vía webhook', {
        topupId: topup.id,
        wompiStatus: tx.status,
        wompiTransactionId: tx.id,
        paymentMethod: topup.paymentMethod,
        amount: topup.amount,
      });

      // Publicar solo si esta llamada hizo la transición PENDING → FAILED (idempotencia
      // ante webhooks repetidos). Se resuelve el dueño para que el evento lleve el userId.
      if (failResult.affected === 1) {
        const wallet = await this.walletsService.findWalletById(topup.walletId);
        await this.eventPublisher.publish(PublishedEvents.WALLET_TOPUP_FAILED, {
          topupId: topup.id,
          userId: wallet?.userId,
          amount: topup.amount,
          paymentMethod: topup.paymentMethod,
          reason: tx.status,
        });
      }
    } else {
      this.logger.debug(
        `Topup ${topup.id}: estado ${tx.status} no terminal; ignorado.`,
      );
    }
  }

  private async approveTopup(
    topupId: string,
    wompiTransactionId: string,
    event: WompiWebhookEvent,
  ): Promise<void> {
    await this.creditApprovedTopup(
      topupId,
      wompiTransactionId,
      event.data as unknown as Record<string, any>,
    );
  }

  /**
   * Acredita el saldo de forma atómica e idempotente. El UPDATE condicional
   * `status = PENDING → APPROVED` actúa como cerrojo: si dos llamadas concurren
   * (webhook + reconciliación), solo una afecta la fila y solo esa acredita el
   * saldo y publica el evento.
   */
  private async creditApprovedTopup(
    topupId: string,
    wompiTransactionId: string,
    wompiResponse: Record<string, any>,
  ): Promise<boolean> {
    let credited = false;
    let amount = 0;
    let userId = '';

    await this.dataSource.transaction(async (manager) => {
      const updateResult = await manager.update(
        WalletTopup,
        { id: topupId, status: TopupStatus.PENDING },
        {
          status: TopupStatus.APPROVED,
          wompiTransactionId,
          wompiResponse,
        },
      );

      // Si no afectó ninguna fila, el topup ya estaba APPROVED (o FAILED): no reprocesar.
      if (updateResult.affected !== 1) {
        this.logger.log(
          `Topup ${topupId} ya estaba procesado; no se reacredita.`,
        );
        return;
      }

      const topup = await manager.findOneOrFail(WalletTopup, {
        where: { id: topupId },
      });
      amount = topup.amount;
      // Resolvemos el dueño de la billetera para que notifications-service pueda
      // notificar al comprador (el evento debe llevar el userId, no solo el walletId).
      const wallet = await manager.findOneOrFail(Wallet, {
        where: { id: topup.walletId },
      });
      userId = wallet.userId;
      await this.walletsService.creditWallet(
        topup.walletId,
        topup.amount,
        manager,
      );
      credited = true;
      this.financialLogger.logEvent('wallet.topup.approved', 'Recarga aprobada y saldo acreditado', {
        topupId,
        walletId: topup.walletId,
        amount: topup.amount,
        paymentMethod: topup.paymentMethod,
        wompiTransactionId,
      });
    });

    if (credited) {
      await this.eventPublisher.publish(PublishedEvents.WALLET_TOPUP_APPROVED, {
        topupId,
        userId,
        wompiTransactionId,
        amount,
      });
    }

    return credited;
  }
}
