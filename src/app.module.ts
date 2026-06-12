import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { wompiConfig } from './config/wompi.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, wompiConfig, rabbitmqConfig],
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
export class AppModule {}
