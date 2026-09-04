import { Module } from '@nestjs/common';

import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { CustomersModule } from '../customers/customers.module';
import { CampaignsService } from './campaigns.service';
import { CustomCoinsService } from './custom-coins.service';
import { EasyClubService } from './easyclub.service';
import { EasyDropService } from './easydrop.service';
import { GrowthAdminController } from './growth-admin.controller';
import { GrowthConfigService } from './growth-config.service';
import { GrowthEventsService } from './growth-events.service';
import { GrowthController } from './growth.controller';
import { ReferralService } from './referral.service';
import { ReviewsService } from './reviews.service';
import { RewardsService } from './rewards.service';
import { TrustService } from './trust.service';

/**
 * Growth: EasyDrop, EASYCLUB, referral, campaigns, custom coins, trust.
 *
 * Imports customers for sessions and nothing else. The cart, orders, payments
 * and housekeeping modules import this one, so it must never import them back;
 * the order-ownership rule it needs is repeated in `growth-shared.ts` for
 * exactly that reason.
 */
@Module({
  imports: [CustomersModule],
  controllers: [GrowthController, GrowthAdminController],
  providers: [
    RateLimitService,
    GrowthConfigService,
    RewardsService,
    EasyDropService,
    EasyClubService,
    ReferralService,
    CampaignsService,
    TrustService,
    CustomCoinsService,
    ReviewsService,
    GrowthEventsService,
  ],
  exports: [GrowthConfigService, RewardsService, GrowthEventsService, CustomCoinsService],
})
export class GrowthModule {}
