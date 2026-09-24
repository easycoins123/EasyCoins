import { Module } from '@nestjs/common';

import { CustomersModule } from '../customers/customers.module';
import { GrowthModule } from '../growth/growth.module';
import { PricingModule } from '../pricing/pricing.module';
import { CartController } from './cart.controller';
import { PricingService } from './pricing.service';

/**
 * Customers for the session (which rewards the caller owns), growth for the
 * ledger the pricing consults. Neither imports this module back.
 */
@Module({
  imports: [CustomersModule, GrowthModule, PricingModule],
  controllers: [CartController],
  providers: [PricingService],
  exports: [PricingService],
})
export class CartModule {}
