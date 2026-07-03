import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
} from '@azure/storage-blob';

/**
 * Acceso a Azure Blob Storage para los comprobantes de pago.
 *
 * El contenedor es PRIVADO. Este servicio:
 *  - sube el HTML del comprobante a una ruta determinística por operación;
 *  - genera SAS tokens de lectura de corta vida para que el dueño de la transacción
 *    pueda ver su comprobante bajo demanda (nunca se expone la AccountKey al cliente).
 *
 * Si no hay cadena de conexión configurada, opera en modo "no-op": loguea y no sube.
 * El flujo de negocio (recargas/pagos) nunca depende de que Storage esté disponible.
 */
@Injectable()
export class BlobStorageService implements OnModuleInit {
  private readonly logger = new Logger(BlobStorageService.name);
  private container: ContainerClient | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const connectionString = this.config.get<string>(
      'blobStorage.connectionString',
    );
    const containerName =
      this.config.get<string>('blobStorage.container') ?? 'payment-receipts';

    if (!connectionString) {
      this.logger.warn(
        'AZURE_STORAGE_CONNECTION_STRING no configurada: los comprobantes NO se archivarán en Blob Storage (seguirán adjuntándose al correo).',
      );
      return;
    }

    try {
      const client = BlobServiceClient.fromConnectionString(connectionString);
      this.container = client.getContainerClient(containerName);
    } catch (error) {
      this.logger.error(
        `No se pudo inicializar el cliente de Blob Storage: ${(error as Error).message}`,
      );
    }
  }

  /** True si Storage está configurado y disponible para subir/firmar. */
  get isEnabled(): boolean {
    return this.container !== null;
  }

  /**
   * Sube el comprobante (Buffer) a `blobPath` (relativo al contenedor). Devuelve la
   * ruta del blob si se subió, o null si Storage no está configurado / falló. Nunca
   * lanza: una falla de Storage no debe tumbar el cobro o la recarga.
   */
  async uploadReceipt(
    blobPath: string,
    content: Buffer,
    contentType: string,
  ): Promise<string | null> {
    if (!this.container) return null;
    try {
      const blockBlob = this.container.getBlockBlobClient(blobPath);
      await blockBlob.uploadData(content, {
        blobHTTPHeaders: {
          blobContentType: contentType,
          blobContentDisposition: `inline; filename="${blobPath.split('/').pop()}"`,
        },
      });
      this.logger.log(`Comprobante archivado en blob: ${blobPath}`);
      return blobPath;
    } catch (error) {
      this.logger.error(
        `Error subiendo comprobante ${blobPath}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Genera una URL de lectura con SAS token de corta vida para `blobPath`. Requiere
   * que el cliente se haya creado con StorageSharedKeyCredential (cadena con AccountKey).
   * Devuelve null si Storage no está configurado o el blob no existe.
   */
  async generateReadSasUrl(blobPath: string): Promise<string | null> {
    if (!this.container) return null;
    const blockBlob = this.container.getBlockBlobClient(blobPath);

    if (!(await blockBlob.exists())) {
      this.logger.warn(`No existe el blob ${blobPath}; no se genera SAS.`);
      return null;
    }

    const ttlMinutes = this.config.get<number>('blobStorage.sasTtlMinutes') ?? 60;
    // Margen de 5 min hacia atrás para tolerar desfases de reloj entre servidores.
    const startsOn = new Date(Date.now() - 5 * 60 * 1000);
    const expiresOn = new Date(Date.now() + ttlMinutes * 60 * 1000);

    try {
      return await blockBlob.generateSasUrl({
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn,
        // Fuerza que el navegador reciba el PDF con el tipo correcto al abrir el SAS.
        contentType: 'application/pdf',
      });
    } catch (error) {
      this.logger.error(
        `No se pudo firmar el SAS para ${blobPath} (¿la cadena de conexión usa AccountKey?): ${(error as Error).message}`,
      );
      return null;
    }
  }
}
