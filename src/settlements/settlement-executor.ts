import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PayoutType } from '../stores/entities/store.entity';
import { StorePayoutStatus } from './entities/store-payout.entity';

export interface SettlementRequest {
  storeId: string;
  amount: number;
  destination: {
    type: PayoutType;
    accountNumber: string;
    bankCode?: string | null;
    holderName: string;
  };
}

export interface SettlementResult {
  status: StorePayoutStatus;
  reference: string;
  executedAt: Date;
}

export interface SettlementExecutor {
  execute(request: SettlementRequest): Promise<SettlementResult>;
}

export const SETTLEMENT_EXECUTOR = Symbol('SETTLEMENT_EXECUTOR');

/**
 * Ejecutor simulado del giro: NUNCA llama a Wompi. El ambiente solo tiene credenciales
 * de sandbox y no hay aprobación de producción para la API de Payouts/Transfers de
 * Wompi (dispersión de dinero saliente es un producto regulado, distinto de la API de
 * Transactions que ya se usa para cobrar recargas). Este ejecutor solo genera una
 * referencia falsa y responde como si el giro se hubiera hecho.
 *
 * TODO PRODUCCION: reemplazar el binding de SETTLEMENT_EXECUTOR (en settlements.module.ts)
 * por un WompiSettlementExecutor real que llame a la API de Payouts de Wompi cuando haya
 * aprobación de producción para dispersión.
 */
@Injectable()
export class SimulatedSettlementExecutor implements SettlementExecutor {
  execute(request: SettlementRequest): Promise<SettlementResult> {
    return Promise.resolve({
      status: StorePayoutStatus.COMPLETED,
      reference: `SIM-${request.storeId}-${randomUUID()}`,
      executedAt: new Date(),
    });
  }
}
