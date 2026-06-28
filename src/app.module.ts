import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { wompiConfig } from './config/wompi.config';
import { serviceBusConfig } from './config/service-bus.config';
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
import { PayoutsModule } from './payouts/payouts.module';
import { WompiModule } from './wompi/wompi.module';

@Module({
  imports: [
    LoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, wompiConfig, serviceBusConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      // Las entidades ya están declaradas explícitamente en database.config (sin
      // autoLoadEntities). synchronize permanece en false: solo migraciones.
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow('database'),
    }),
    MessagingModule,
    WalletsModule,
    TopupsModule,
    StoresModule,
    TransactionsModule,
    PayoutsModule,
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
