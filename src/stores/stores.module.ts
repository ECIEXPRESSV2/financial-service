import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './entities/store.entity';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';
import { AdminStoresController } from './admin-stores.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Store])],
  controllers: [StoresController, AdminStoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
