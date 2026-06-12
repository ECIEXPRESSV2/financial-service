import { Module } from '@nestjs/common';
import { WompiService } from './wompi.service';

/** Integración con la pasarela de pagos Wompi (sandbox). */
@Module({
  providers: [WompiService],
  exports: [WompiService],
})
export class WompiModule {}
