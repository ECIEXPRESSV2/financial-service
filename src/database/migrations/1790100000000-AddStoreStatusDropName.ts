import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Proyección de negocios (`stores`): financial deja de espejar el nombre del negocio
 * (dato no usado) y pasa a guardar su estado, replicado desde
 * `identity.store.status_changed`.
 *  - nueva columna `status` (default 'OPEN');
 *  - se elimina la columna `name`.
 */
export class AddStoreStatusDropName1790100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "stores"
      ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'OPEN'
    `);
    await queryRunner.query(`
      ALTER TABLE "stores" DROP COLUMN IF EXISTS "name"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Al revertir, se recrea `name`. No se conserva el valor previo (era dato no usado);
    // se rellena con cadena vacía para satisfacer el NOT NULL original.
    await queryRunner.query(`
      ALTER TABLE "stores"
      ADD COLUMN IF NOT EXISTS "name" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "stores" ALTER COLUMN "name" DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE "stores" DROP COLUMN IF EXISTS "status"
    `);
  }
}
