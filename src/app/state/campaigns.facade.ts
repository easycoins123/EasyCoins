import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

import { STOREFRONT } from '../core/brand';
import { CampaignView, hasLaunchBonus, resolveCampaigns } from '../core/commerce';
import { PromotionApiService } from '../data/api';
import { CatalogFacade } from './catalog.facade';
import { GrowthFacade } from './growth.facade';

/**
 * The offers ecosystem, resolved against what is real right now.
 *
 * The launch bonus is active while the catalog carries bonus coins on the
 * coin bundles; the launch code is active while the server lists its
 * promotion; EasyDrop, EASYCLUB, the founders, referral and custom coins are
 * active while the server says the programme is on; the Drop Zone shows a
 * real drop or says the next one is cooking. One read per source per visit:
 * every source is cached, and the result is shared by the home page, the
 * offers page, the cart and the order page.
 */
@Injectable({ providedIn: 'root' })
export class CampaignsFacade {
  private readonly catalog = inject(CatalogFacade);
  private readonly promotions = inject(PromotionApiService);
  private readonly growth = inject(GrowthFacade);

  readonly launchBonusActive$: Observable<boolean> = this.catalog.productBySlug(STOREFRONT.focusProductSlug).pipe(
    map((detail) => hasLaunchBonus(detail.product.variants)),
    catchError(() => of(false)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly campaigns$: Observable<readonly CampaignView[]> = combineLatest([
    this.launchBonusActive$,
    this.promotions.getActivePromotions().pipe(
      map((list) => new Set(list.filter((promotion) => promotion.active).map((promotion) => promotion.slug))),
      catchError(() => of(new Set<string>())),
    ),
    this.growth.programmes$,
    this.growth.drops$,
  ]).pipe(
    map(([launchBonusActive, activePromotionSlugs, programmes, drops]) => resolveCampaigns({
      now: new Date(),
      launchBonusActive,
      activePromotionSlugs,
      programmes,
      drops,
    })),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly active$: Observable<readonly CampaignView[]> = this.campaigns$.pipe(
    map((campaigns) => campaigns.filter((campaign) => campaign.status === 'active')),
  );

  /** One campaign by kind, with its resolved state. */
  byKind(kind: CampaignView['kind']): Observable<CampaignView | undefined> {
    return this.campaigns$.pipe(map((campaigns) => campaigns.find((campaign) => campaign.kind === kind)));
  }
}
