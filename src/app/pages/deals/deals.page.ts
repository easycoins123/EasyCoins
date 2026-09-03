import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { combineLatest, map, switchMap } from 'rxjs';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { LocalizePipe } from '../../core/i18n';
import { Promotion, PromotionKind } from '../../domain';
import { PromotionApiService } from '../../data/api';
import { CatalogFacade } from '../../state';
import { EmptyStateComponent, ProductCardComponent } from '../../ui';

/**
 * Active promotions and the discounted products behind them. Nothing here is a
 * banner without a destination — every promotion links into the catalog.
 */
@Component({
  selector: 'tt-deals-page',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, ProductCardComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <header class="tt-head tt-head--tight">
        <span class="tt-eyebrow">מבצעים</span>
        <h1>דילים פעילים</h1>
      </header>

      <ng-container *ngIf="vm$ | async as vm">
        <tt-empty-state *ngIf="vm.promotions.length === 0"
                        icon="tag"
                        title="אין מבצעים פעילים כרגע"
                        message="שווה לחזור לבדוק, המבצעים מתחלפים.">
        </tt-empty-state>

        <div class="tt-grid promos" *ngIf="vm.promotions.length > 0">
          <article class="tt-card tt-card--pad" *ngFor="let promotion of vm.promotions">
            <span class="tt-badge tt-badge--accent">{{ kindLabel(promotion) }}</span>
            <h2>{{ promotion.title | t }}</h2>
            <p class="tt-muted">{{ promotion.description | t }}</p>
            <a class="tt-btn tt-btn--ghost tt-btn--sm" routerLink="/store">לצפייה במוצרים</a>
          </article>
        </div>

        <section class="tt-section">
          <div class="tt-section__head"><h2>מוצרים במחיר מיוחד</h2></div>

          <tt-empty-state *ngIf="vm.discounted.length === 0"
                          icon="tag"
                          title="אין כרגע מוצרים מוזלים"
                          message="אפשר לעיין בכל הקטלוג בינתיים.">
          </tt-empty-state>

          <div class="tt-grid" *ngIf="vm.discounted.length > 0">
            <tt-product-card *ngFor="let product of vm.discounted" [product]="product" [lookups]="vm.lookups">
            </tt-product-card>
          </div>
        </section>
      </ng-container>
    </div>
  `,
  styles: [`
    h1 { margin-block: var(--tt-space-1) var(--tt-space-4); }
    .promos h2 { font-size: var(--tt-text-lg); margin-block: var(--tt-space-2) var(--tt-space-1); }
    .tt-section__head h2 { font-size: var(--tt-text-xl); }
    .promos p { font-size: var(--tt-text-sm); }
  `],
})
export class DealsPage {
  private readonly promotionApi = inject(PromotionApiService);
  private readonly catalog = inject(CatalogFacade);
  private readonly analytics = inject(AnalyticsService);

  /**
   * Deals for the game this storefront sells.
   *
   * Both halves are scoped. The page previously ran an unfiltered catalog search
   * and listed every active promotion, which put a PlayStation Plus subscription
   * on a storefront that sells nothing but FC coins. A promotion with no
   * `gameIds` is treated as store-wide and kept; one that names other games and
   * not ours is not ours to advertise.
   */
  readonly vm$ = combineLatest([
    this.promotionApi.getActivePromotions(),
    this.catalog.gameBySlug(STOREFRONT.focusGameSlug),
    this.catalog.lookups$,
  ]).pipe(
    switchMap(([promotions, game, lookups]) => this.catalog
      .search({ gameIds: [game.id], sort: 'price-asc', page: { page: 1, pageSize: 24 } })
      .pipe(map((page) => ({
        promotions: promotions.filter((promotion) => {
          // Named another game and not ours.
          if (promotion.gameIds?.length && !promotion.gameIds.includes(game.id)) {
            return false;
          }
          // Named specific products, none of which are in this storefront. A
          // promotion can arrive with no game attribution at all, so matching
          // on products as well is what actually keeps other games off the
          // page rather than relying on the data being tagged correctly.
          if (promotion.productIds?.length) {
            const ours = new Set(page.items.map((product) => product.id));
            return promotion.productIds.some((id) => ours.has(id));
          }
          return true;
        }),
        lookups,
        // A product is "on deal" when its cheapest offer has a compare-at price.
        discounted: page.items.filter((product) => product.fromPrice?.compareAt !== undefined),
      })))),
  );

  constructor() {
    this.analytics.pageView('/deals', 'Deals');
  }

  kindLabel(promotion: Promotion): string {
    return promotion.kind === PromotionKind.PercentOff ? 'הנחה באחוזים' : 'הנחה בסכום';
  }
}
