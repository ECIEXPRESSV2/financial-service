import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Archivo de comprobantes de pago: cada operación guarda la ruta de su comprobante en
 * el Blob Storage privado (`payment-receipts`), para poder regenerar bajo demanda un
 * SAS token de lectura y mostrárselo al dueño de la transacción.
 *
 *  - order_transactions.receipt_blob_path -> pagos_pedidos/{orderId}/comprobante-<seg>.html
 *  - wallet_topups.receipt_blob_path      -> recargas_billeteras/{userId}/comprobante-<seg>.html
 */
export class AddReceiptBlobPath1790200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_transactions"
      ADD COLUMN IF NOT EXISTS "receipt_blob_path" VARCHAR
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_topups"
      ADD COLUMN IF NOT EXISTS "receipt_blob_path" VARCHAR
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_transactions" DROP COLUMN IF EXISTS "receipt_blob_path"
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_topups" DROP COLUMN IF EXISTS "receipt_blob_path"
    `);
  }
}
