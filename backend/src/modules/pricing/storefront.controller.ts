import { Controller, Get } from '@nestjs/common';

import { FirstOrderService } from './first-order.service';
import { LadderService } from './ladder.service';
import { PricingConfigService } from './pricing-config.service';

/**
 * What the storefront needs to know before it draws a hero: which edition is
 * on sale and whether a launch offer is live. Public and read-only; nothing
 * here carries a price, those come from the catalog.
 */
@Controller('storefront')
export class StorefrontController {
  constructor(
    private readonly ladder: LadderService,
    private readonly config: PricingConfigService,
    private readonly firstOrder: FirstOrderService,
  ) {}

  @Get()
  async storefront() {
    const [state, config] = await Promise.all([this.ladder.storefront(), this.config.get()]);
    const { launch } = config;
    const live = this.firstOrder.isLive(launch);
    return {
      activeEdition: state.activeEdition,
      editions: state.editions,
      launch: {
        id: launch.id,
        live,
        name: launch.name,
        percentBps: launch.benefit.percentBps,
        capCoins: launch.benefit.capCoins,
        minOrderMinor: launch.benefit.minOrderMinor,
        eligibility: launch.eligibility,
        startsAt: launch.startsAt,
        endsAt: launch.endsAt,
        terms: launch.terms,
      },
    };
  }
}
