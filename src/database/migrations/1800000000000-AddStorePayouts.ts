import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giros hacia los negocios (`store_payouts`): retiro on-demand pedido por el vendedor o
 * liquidación automática de fin de mes. Cada giro agrupa las `order_transactions`
 * RELEASED que estaban disponibles al momento de ejecutarlo; `order_transactions.payout_id`
 * marca cuáles ya fueron incluidas en un giro, para no liquidarlas dos veces.
 *
 * `destination_type` reusa el enum `stores_payout_type_enum` ya creado por `stores.payout_type`.
 */
export class AddStorePayouts1800000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "store_payouts_type_enum" AS ENUM ('AUTOMATIC','ON_DEMAND')`,
    );
    await queryRunner.query(
      `CREATE TYPE "store_payouts_status_enum" AS ENUM ('COMPLETED','FAILED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "store_payouts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "store_id" uuid NOT NULL,
        "type" "store_payouts_type_enum" NOT NULL,
        "status" "store_payouts_status_enum" NOT NULL DEFAULT 'COMPLETED',
        "amount" bigint NOT NULL,
        "destination_type" "stores_payout_type_enum" NOT NULL,
        "destination_account_number" character varying NOT NULL,
        "destination_bank_code" character varying,
        "destination_holder_name" character varying NOT NULL,
        "reference" character varying NOT NULL,
        "executed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_store_payouts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_store_payouts_store_id" ON "store_payouts" ("store_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "order_transactions"
      ADD COLUMN IF NOT EXISTS "payout_id" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_order_transactions_payout_id"
      ON "order_transactions" ("payout_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_order_transactions_payout_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "order_transactions" DROP COLUMN IF EXISTS "payout_id"
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "store_payouts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "store_payouts_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "store_payouts_type_enum"`);
  }
}
