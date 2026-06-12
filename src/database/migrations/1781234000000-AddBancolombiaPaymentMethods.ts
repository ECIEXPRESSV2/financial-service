import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBancolombiaPaymentMethods1781234000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE wallet_topups_payment_method_enum
      ADD VALUE IF NOT EXISTS 'BANCOLOMBIA_TRANSFER'
    `);
    await queryRunner.query(`
      ALTER TYPE wallet_topups_payment_method_enum
      ADD VALUE IF NOT EXISTS 'BANCOLOMBIA_QR'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL no soporta eliminar valores de un enum directamente.
    // Para revertir habría que recrear el tipo completo sin los valores nuevos.
  }
}
