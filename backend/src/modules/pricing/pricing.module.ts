import { Module } from '@nestjs/common';

import { CreatorCodesService } from './creator-codes.service';
import { FirstOrderService } from './first-order.service';
import { LadderService } from './ladder.service';
import { PricingAdminController } from './pricing-admin.controller';
import { PricingConfigService } from './pricing-config.service';
import { SitemapController } from './sitemap.controller';
import { StorefrontController } from './storefront.controller';

/**
 * Pricing: the owner's economics and ladder, the launch offer, creator codes.
 *
 * Imports nothing from the commerce modules. The cart and orders modules
 * import this one, so it must never import them back.
 */
@Module({
  controllers: [PricingAdminController, StorefrontController, SitemapController],
  providers: [PricingConfigService, LadderService, FirstOrderService, CreatorCodesService],
  exports: [PricingConfigService, LadderService, FirstOrderService, CreatorCodesService],
})
export class PricingModule {}
