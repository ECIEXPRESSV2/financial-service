import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soporte de devoluciones parciales/totales en order_transactions:
 *  - nuevo estado PARTIALLY_REFUNDED en el enum de estados;
 *  - columna refunded_amount (centavos COP) que acumula lo ya reembolsado.
 */
export class AddPartialRefundToOrderTransactions1790000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "order_transactions_status_enum"
      ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED'
    `);
    await queryRunner.query(`
      ALTER TABLE "order_transactions"
      ADD COLUMN IF NOT EXISTS "refunded_amount" BIGINT NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "order_transactions" DROP COLUMN IF EXISTS "refunded_amount"
    `);
    // PostgreSQL no permite eliminar valores de un enum directamente; para revertir
    // el valor PARTIALLY_REFUNDED habría que recrear el tipo completo.
  }
}
