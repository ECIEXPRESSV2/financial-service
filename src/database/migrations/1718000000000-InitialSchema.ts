import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración inicial: crea las 5 tablas del financial-service, sus enums e índices.
 *
 * Montos de dinero en bigint (centavos COP); porcentajes en decimal(5,2).
 * Se usa gen_random_uuid() (núcleo de PostgreSQL 13+) para las PK autogeneradas.
 */
export class InitialSchema1718000000000 implements MigrationInterface {
  name = 'InitialSchema1718000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Enums ---
    await queryRunner.query(
      `CREATE TYPE "wallet_topups_payment_method_enum" AS ENUM ('NEQUI','DAVIPLATA','PSE','BREB','CARD')`,
    );
    await queryRunner.query(
      `CREATE TYPE "wallet_topups_status_enum" AS ENUM ('PENDING','APPROVED','FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "stores_payout_type_enum" AS ENUM ('NEQUI','DAVIPLATA','BANK_ACCOUNT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "order_transactions_status_enum" AS ENUM ('PENDING','HELD','RELEASED','REFUNDED','FAILED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "order_transactions_failure_reason_enum" AS ENUM ('INSUFFICIENT_FUNDS','STORE_NOT_FOUND','STORE_INACTIVE','WALLET_NOT_FOUND')`,
    );

    // --- wallet_users ---
    await queryRunner.query(`
      CREATE TABLE "wallet_users" (
        "id" uuid NOT NULL,
        "email" character varying NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_users" PRIMARY KEY ("id")
      )
    `);

    // --- wallets ---
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "balance" bigint NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_user_id" UNIQUE ("user_id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_wallets_user_id" ON "wallets" ("user_id")`,
    );

    // --- wallet_topups ---
    await queryRunner.query(`
      CREATE TABLE "wallet_topups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "wallet_id" uuid NOT NULL,
        "amount" bigint NOT NULL,
        "payment_method" "wallet_topups_payment_method_enum" NOT NULL,
        "status" "wallet_topups_status_enum" NOT NULL DEFAULT 'PENDING',
        "wompi_transaction_id" character varying,
        "wompi_response" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_topups" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_wallet_topups_wompi_tx_id" ON "wallet_topups" ("wompi_transaction_id") WHERE "wompi_transaction_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_wallet_topups_wallet_id" ON "wallet_topups" ("wallet_id")`,
    );

    // --- stores ---
    await queryRunner.query(`
      CREATE TABLE "stores" (
        "id" uuid NOT NULL,
        "name" character varying NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "platform_fee_percent" numeric(5,2) NOT NULL,
        "peak_fee_percent" numeric(5,2) NOT NULL,
        "peak_hours_start" TIME,
        "peak_hours_end" TIME,
        "peak_days" text array,
        "payout_type" "stores_payout_type_enum",
        "payout_account_number" character varying,
        "payout_bank_code" character varying,
        "payout_holder_name" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stores" PRIMARY KEY ("id")
      )
    `);

    // --- order_transactions ---
    await queryRunner.query(`
      CREATE TABLE "order_transactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" character varying NOT NULL,
        "wallet_id" uuid NOT NULL,
        "store_id" uuid NOT NULL,
        "order_amount" bigint NOT NULL,
        "peak_fee_amount" bigint NOT NULL DEFAULT 0,
        "total_charged" bigint NOT NULL,
        "platform_fee_amount" bigint NOT NULL DEFAULT 0,
        "store_payout_amount" bigint NOT NULL DEFAULT 0,
        "status" "order_transactions_status_enum" NOT NULL DEFAULT 'PENDING',
        "is_peak_hour" boolean NOT NULL DEFAULT false,
        "failure_reason" "order_transactions_failure_reason_enum",
        "held_at" TIMESTAMP WITH TIME ZONE,
        "released_at" TIMESTAMP WITH TIME ZONE,
        "refunded_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_order_transactions_order_id" UNIQUE ("order_id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_order_transactions_order_id" ON "order_transactions" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_order_transactions_store_id" ON "order_transactions" ("store_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order_transactions"`);
    await queryRunner.query(`DROP TABLE "stores"`);
    await queryRunner.query(`DROP TABLE "wallet_topups"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
    await queryRunner.query(`DROP TABLE "wallet_users"`);

    await queryRunner.query(
      `DROP TYPE "order_transactions_failure_reason_enum"`,
    );
    await queryRunner.query(`DROP TYPE "order_transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE "stores_payout_type_enum"`);
    await queryRunner.query(`DROP TYPE "wallet_topups_status_enum"`);
    await queryRunner.query(`DROP TYPE "wallet_topups_payment_method_enum"`);
  }
}
