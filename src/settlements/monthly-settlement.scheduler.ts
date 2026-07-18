import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SettlementsService } from './settlements.service';

const JOB_NAME = 'monthly-store-settlement';

/**
 * Programa la liquidación mensual de saldos a las tiendas con el cron de
 * `settlement.cronExpression`. Se registra de forma dinámica (no con `@Cron`) para leer
 * la expresión desde la config ya cargada al arrancar, igual que
 * `fulfillment-service/src/expiration/expiration.scheduler.ts`.
 */
@Injectable()
export class MonthlySettlementScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MonthlySettlementScheduler.name);
  private readonly cronExpression: string;
  private readonly timeZone?: string;

  constructor(
    private readonly settlementsService: SettlementsService,
    private readonly schedulerRegistry: SchedulerRegistry,
    config: ConfigService,
  ) {
    this.cronExpression = config.get<string>('settlement.cronExpression')!;
    this.timeZone = config.get<string>('TZ');
  }

  onApplicationBootstrap(): void {
    const job = CronJob.from({
      cronTime: this.cronExpression,
      onTick: () => void this.run(),
      timeZone: this.timeZone,
    });
    this.schedulerRegistry.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(
      `Job de liquidación mensual programado (${this.cronExpression})`,
    );
  }

  onModuleDestroy(): void {
    try {
      this.schedulerRegistry.getCronJob(JOB_NAME).stop();
    } catch {
      // el job pudo no haberse registrado; nada que detener
    }
  }

  private async run(): Promise<void> {
    try {
      await this.settlementsService.runMonthlySettlement();
    } catch (error) {
      this.logger.error(
        { err: error },
        'Error ejecutando la liquidación mensual',
      );
    }
  }
}
