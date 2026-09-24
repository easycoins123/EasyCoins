import { Module } from '@nestjs/common';

import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { GrowthModule } from '../growth/growth.module';
import { InventoryService } from '../orders/inventory.service';
import { PaymentsModule } from '../payments/payments.module';
import { HousekeepingController } from './housekeeping.controller';
import { HousekeepingService } from './housekeeping.service';

@Module({
  imports: [PaymentsModule, GrowthModule],
  controllers: [HousekeepingController],
  providers: [HousekeepingService, InventoryService, IdempotencyService, RateLimitService],
  exports: [HousekeepingService],
})
export class HousekeepingModule {}
