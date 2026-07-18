import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { wompiConfig } from './config/wompi.config';
import { serviceBusConfig } from './config/service-bus.config';
import { blobStorageConfig } from './config/blob-storage.config';
import { settlementConfig } from './config/settlement.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerModule } from './common/logger/logger.module';
import { LoggingMiddleware } from './common/logger/logging.middleware';
import { MessagingModule } from './events/messaging.module';
import { EventsModule } from './events/events.module';
import { WalletsModule } from './wallets/wallets.module';
import { TopupsModule } from './topups/topups.module';
import { StoresModule } from './stores/stores.module';
import { TransactionsModule } from './transactions/transactions.module';
import { SettlementsModule } from './settlements/settlements.module';
import { WompiModule } from './wompi/wompi.module';
import { ReceiptsModule } from './receipts/receipts.module';

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfig,
        wompiConfig,
        serviceBusConfig,
        blobStorageConfig,
        settlementConfig,
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      // Las entidades ya están declaradas explícitamente en database.config (sin
      // autoLoadEntities). synchronize permanece en false: solo migraciones.
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow('database'),
    }),
    MessagingModule,
    ReceiptsModule,
    WalletsModule,
    TopupsModule,
    StoresModule,
    TransactionsModule,
    SettlementsModule,
    WompiModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggingMiddleware).forRoutes('*');
  }
}
