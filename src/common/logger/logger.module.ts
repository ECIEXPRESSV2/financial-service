import { Global, Module } from '@nestjs/common';
import { FinancialLogger } from './financial.logger';

@Global()
@Module({
  providers: [FinancialLogger],
  exports: [FinancialLogger],
})
export class LoggerModule {}
