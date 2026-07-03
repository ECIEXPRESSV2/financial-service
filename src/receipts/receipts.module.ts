import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlobStorageService } from './blob-storage.service';
import { ReceiptsService } from './receipts.service';

/**
 * Módulo (global) de comprobantes: genera el HTML, lo archiva en el Blob Storage
 * privado y firma SAS tokens de lectura. Es @Global para que topups y transactions
 * puedan inyectar `ReceiptsService` sin reimportarlo.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [BlobStorageService, ReceiptsService],
  exports: [ReceiptsService, BlobStorageService],
})
export class ReceiptsModule {}
