import { Injectable } from '@nestjs/common';
import { BlobStorageService } from './blob-storage.service';
import {
  ReceiptConcept,
  ReceiptData,
  buildReceiptFilename,
} from './receipt-templates';
import { renderReceiptPdf } from './receipt-pdf';

const PDF_CONTENT_TYPE = 'application/pdf';

/** Tipo de comprobante: determina el prefijo de la ruta en el contenedor. */
export type ReceiptKind = 'wallet_topup' | 'order_payment';

const KIND_PREFIX: Record<ReceiptKind, string> = {
  wallet_topup: 'recargas_billeteras',
  order_payment: 'pagos_pedidos',
};

/** Adjunto listo para enviarse por correo (lo consume notifications-service). */
export interface ReceiptAttachment {
  filename: string;
  contentType: string;
  /** PDF del comprobante en base64. */
  contentBase64: string;
}

export interface GeneratedReceipt {
  /** Ruta del blob si se archivó (para regenerar el SAS luego); null si no se subió. */
  blobPath: string | null;
  /** Adjunto para el correo. Siempre presente, aunque Storage falle. */
  attachment: ReceiptAttachment;
}

/**
 * Genera el comprobante de una operación (recarga o pago), lo archiva en el Blob
 * Storage privado y devuelve el adjunto para el correo.
 *
 * Rutas en el contenedor `payment-receipts`:
 *  - recargas: `recargas_billeteras/{walletUserId}/{comprobante-<segundos>.html}`
 *  - pagos:    `pagos_pedidos/{orderId}/{comprobante-<segundos>.html}`
 */
@Injectable()
export class ReceiptsService {
  constructor(private readonly blob: BlobStorageService) {}

  async generate(
    kind: ReceiptKind,
    ownerSegment: string,
    data: ReceiptData,
  ): Promise<GeneratedReceipt> {
    const pdf = await renderReceiptPdf(data);
    const filename = buildReceiptFilename(data.date);
    const blobPath = `${KIND_PREFIX[kind]}/${ownerSegment}/${filename}`;

    const archivedPath = await this.blob.uploadReceipt(
      blobPath,
      pdf,
      PDF_CONTENT_TYPE,
    );

    return {
      blobPath: archivedPath,
      attachment: {
        filename,
        contentType: PDF_CONTENT_TYPE,
        contentBase64: pdf.toString('base64'),
      },
    };
  }

  /** SAS de lectura de corta vida para un comprobante ya archivado. */
  getReceiptSasUrl(blobPath: string): Promise<string | null> {
    return this.blob.generateReadSasUrl(blobPath);
  }
}

export { ReceiptConcept };
export type { ReceiptData };
