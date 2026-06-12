import { Injectable, Logger } from '@nestjs/common';
import { Store } from '../stores/entities/store.entity';

export interface DisbursementResult {
  storeId: string;
  amount: number;
  status: 'LOGGED';
  disbursedAt: string;
  destination: {
    type: string | null;
    accountNumber: string | null;
    holderName: string | null;
  };
}

/**
 * Servicio de desembolso a los negocios. En sandbox solo registra y loguea el
 * desembolso; no mueve dinero real.
 */
@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  /**
   * Registra el desembolso de `amount` centavos al negocio.
   *
   * // TODO PRODUCCION: ejecutar la transferencia real desde la cuenta de ECIExpress
   * // mediante Wompi. Requiere operacion regulada.
   */
  disburse(
    store: Store | null,
    storeId: string,
    amount: number,
  ): DisbursementResult {
    const result: DisbursementResult = {
      storeId,
      amount,
      status: 'LOGGED',
      disbursedAt: new Date().toISOString(),
      destination: {
        type: store?.payoutType ?? null,
        accountNumber: store?.payoutAccountNumber ?? null,
        holderName: store?.payoutHolderName ?? null,
      },
    };

    this.logger.log(
      `Desembolso registrado (sandbox): ${amount} centavos COP al negocio ${storeId} ` +
        `→ ${result.destination.type ?? 'cuenta no configurada'} ` +
        `${result.destination.accountNumber ?? ''}`.trim(),
    );

    return result;
  }
}
