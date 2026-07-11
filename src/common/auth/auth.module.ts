import { Module } from '@nestjs/common';
import { IdentityClient } from '../clients/identity.client';
import { AdminGuard } from '../guards/admin.guard';
import { StoreStaffGuard } from '../guards/store-staff.guard';

/**
 * Agrupa el cliente de identity y los guards de autorización (ADMIN / staff de tienda) para
 * que cualquier módulo que use `@UseGuards(AdminGuard | StoreStaffGuard)` pueda resolver sus
 * dependencias con solo importar este módulo.
 */
@Module({
  providers: [IdentityClient, AdminGuard, StoreStaffGuard],
  exports: [IdentityClient, AdminGuard, StoreStaffGuard],
})
export class AuthModule {}
