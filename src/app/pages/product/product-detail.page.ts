import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, combineLatest } from 'rxjs';
import { catchError, map, shareReplay, switchMap, tap } from 'rxjs/operators';

import { AnalyticsEvent, AnalyticsService } from '../../core/analytics';
import { LocalizePipe } from '../../core/i18n';
import { formatQuantity } from '../../core/value';
import {
  AppError, FulfillmentMethod, Money, Offer, Platform, Product, ProductDetail, ProductType, ProductVariant, Region,
  isPurchasable, toAppError,
} from '../../domain';
import { ReviewApiService } from '../../data/api';
import { CartFacade, CatalogFacade, CatalogLookups } from '../../state';
import {
  ErrorStateComponent, FulfillmentBadgeComponent, MoneyPipe, PlatformBadgeComponent,
  ProductCardComponent, QuantitySelectorComponent, RegionBadgeComponent, ReviewCardComponent,
  StarRatingComponent, StockBadgeComponent, CompactNumberPipe, IconComponent, CoinPackComponent
} from '../../ui';
import { materialForStep } from '../../ui/materials';

interface ProductViewModel {
  readonly detail: ProductDetail;
  readonly lookups: CatalogLookups;
  readonly related: readonly Product[];
}

/**
 * Product detail.
 *
 * The page is built around the offer, not the product: the customer picks a
 * variant, a platform and a region, and those three choices resolve to exactly
 * one offer with its own price, stock, delivery method and terms. Region is shown
 * prominently, with its restriction spelled out, because a mismatched region is
 * the one mistake this store cannot undo for a customer.
 */
@Component({
  selector: 'tt-product-detail-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe, MoneyPipe, CompactNumberPipe,
    PlatformBadgeComponent, RegionBadgeComponent, FulfillmentBadgeComponent, StockBadgeComponent,
    QuantitySelectorComponent, StarRatingComponent, ReviewCardComponent, ProductCardComponent,
    ErrorStateComponent, IconComponent, CoinPackComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <tt-error-state *ngIf="error() as appError; else content"
                      [error]="appError" (retry)="retry()"></tt-error-state>

      <ng-template #content>
        <ng-container *ngIf="vm$ | async as vm; else loading">
          <nav class="crumbs tt-faint">
            <a routerLink="/store">חנות</a> / <span>{{ vm.detail.product.name | t }}</span>
          </nav>

          <div class="layout">
            <div class="media tt-card">
              <tt-coin-pack *ngIf="packSteps(vm) as steps; else picture" class="media__art" [steps]="steps"></tt-coin-pack>
              <ng-template #picture>
                <img *ngIf="vm.detail.product.images[0] as image" [src]="image.url" [alt]="image.alt" />
              </ng-template>
            </div>

            <div class="info">
              <h1>{{ vm.detail.product.name | t }}</h1>
              <tt-star-rating *ngIf="vm.detail.product.ratingAverage !== undefined"
                              [rating]="vm.detail.product.ratingAverage"
                              [count]="vm.detail.product.ratingCount">
              </tt-star-rating>
              <p class="tt-muted">{{ vm.detail.product.description | t }}</p>

              <!-- Variant -->
              <div class="chooser">
                <span class="tt-label">בחירת חבילה</span>
                <div class="chips">
                  <button type="button"
                          *ngFor="let variant of vm.detail.product.variants; let i = index"
                          [style.--mat]="materialColor(i)"
                          class="chip"
                          [class.on]="variant.id === variantId()"
                          (click)="selectVariant(variant)">
                    <span class="chip__dot" aria-hidden="true"></span><span>{{ variant.name | t }}</span>
                    <small *ngIf="showsQuantity(variant)" class="tt-faint">
                      {{ variant.quantityValue | compactNumber }} {{ variant.quantityUnit | t }}
                    </small>
                    <small class="chip__price tt-numeric" *ngIf="priceFor(vm, variant) as price">{{ price | money }}</small>
                  </button>
                </div>
              </div>

              <!-- Platform -->
              <div class="chooser" *ngIf="platformsFor(vm) as options">
                <span class="tt-label">פלטפורמה</span>
                <div class="chips">
                  <button type="button" *ngFor="let platform of options" class="chip"
                          [class.on]="platform.id === platformId()"
                          (click)="platformId.set(platform.id)">
                    {{ platform.name | t }}
                  </button>
                </div>
              </div>

              <!-- Region -->
              <div class="chooser" *ngIf="regionsFor(vm) as options">
                <span class="tt-label">אזור החנות</span>
                <div class="chips">
                  <button type="button" *ngFor="let region of options" class="chip"
                          [class.on]="region.id === regionId()"
                          (click)="regionId.set(region.id)">
                    {{ region.flagEmoji }} {{ region.name | t }}
                  </button>
                </div>
              </div>

              <ng-container *ngIf="offerFor(vm) as offer">
                <div class="tt-alert tt-alert--warning"
                     *ngIf="regionOf(vm, offer) as region"
                     [class.tt-alert--warning]="!region.isRegionFree">
                  <tt-icon name="globe" [size]="18"></tt-icon>
                  <span>
                    <strong>אזור: {{ region.name | t }}</strong>
                    <span class="tt-faint" *ngIf="region.restrictionNotice">{{ region.restrictionNotice | t }}</span>
                    <span class="tt-faint" *ngIf="region.isRegionFree">מוצר ללא נעילת אזור.</span>
                  </span>
                </div>

                <div class="tt-row badges">
                  <tt-platform-badge [platform]="platformOf(vm, offer)"></tt-platform-badge>
                  <tt-region-badge [region]="regionOf(vm, offer)"></tt-region-badge>
                  <tt-fulfillment-badge [descriptor]="vm.lookups.fulfillment.get(offer.fulfillmentMethod)">
                  </tt-fulfillment-badge>
                  <tt-stock-badge [status]="offer.inventory.status" [remaining]="offer.inventory.remaining">
                  </tt-stock-badge>
                </div>

                <p class="delivery tt-muted">
                  {{ vm.lookups.fulfillment.get(offer.fulfillmentMethod)?.description | t }}
                </p>

                <div class="buy tt-card tt-card--pad">
                  <div class="price-row">
                    <span class="tt-price tt-price--xl">{{ offer.price.current | money }}</span>
                    <span class="tt-price-was" *ngIf="offer.price.compareAt">{{ offer.price.compareAt | money }}</span>
                    <span class="tt-badge tt-badge--accent" *ngIf="offer.price.discountPercent">
                      −{{ offer.price.discountPercent }}%
                    </span>
                  </div>

                  <div class="tt-row">
                    <tt-quantity-selector [value]="quantity()"
                                          [max]="offer.inventory.maxPerOrder ?? 10"
                                          (valueChange)="quantity.set($event)">
                    </tt-quantity-selector>

                    <button type="button" class="tt-btn tt-btn--buy grow"
                            [disabled]="!canBuy(offer) || cart.busy()"
                            (click)="addToCart(offer)">
                      הוספה לעגלה
                    </button>
                    <button type="button" class="tt-btn tt-btn--ghost"
                            [disabled]="!canBuy(offer) || cart.busy()"
                            (click)="buyNow(offer)">
                      קנייה מיידית
                    </button>
                  </div>

                  <p class="tt-hint" *ngIf="!canBuy(offer)">המוצר אינו זמין לרכישה כרגע.</p>
                  <p class="tt-hint" *ngIf="offer.terms">{{ offer.terms | t }}</p>
                </div>
              </ng-container>
            </div>
          </div>

          <!-- On a phone the action never scrolls away. -->

          <div class="buybar tt-glass" *ngIf="offerFor(vm) as offer">

            <span class="buybar__price tt-price">{{ offer.price.current | money }}</span>

            <button type="button" class="tt-btn tt-btn--buy" [disabled]="!canBuy(offer) || cart.busy()" (click)="addToCart(offer)">

              <tt-icon name="cart" [size]="16"></tt-icon> הוספה לעגלה

            </button>

          </div>


          <section class="tt-section" *ngIf="(reviews$ | async) as reviews">
            <div class="tt-section__head" *ngIf="reviews.length > 0"><h2>ביקורות</h2></div>
            <div class="tt-grid tt-grid--fit" *ngIf="reviews.length > 0">
              <tt-review-card *ngFor="let review of reviews" [review]="review"></tt-review-card>
            </div>
          </section>

          <section class="tt-section" *ngIf="vm.related.length > 0">
            <div class="tt-section__head"><h2>מוצרים נוספים</h2></div>
            <div class="tt-grid tt-grid--fit">
              <tt-product-card *ngFor="let product of vm.related" [product]="product" [lookups]="vm.lookups">
              </tt-product-card>
            </div>
          </section>
        </ng-container>
      </ng-template>

      <ng-template #loading>
        <div class="layout">
          <div class="tt-skeleton media"></div>
          <div class="tt-stack info-skeleton">
            <div class="tt-skeleton" style="height:38px;width:60%"></div>
            <div class="tt-skeleton" style="height:14px"></div>
            <div class="tt-skeleton" style="height:14px;width:80%"></div>
            <div class="tt-skeleton" style="height:76px"></div>
            <div class="tt-skeleton" style="height:76px"></div>
            <div class="tt-skeleton" style="height:150px"></div>
          </div>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .crumbs { margin-block-end: var(--tt-space-3); }
    .layout { display: grid; gap: var(--tt-space-5); grid-template-columns: 1fr; }
    @media (min-width: 900px) {
      .layout { grid-template-columns: 400px 1fr; align-items: start; }
      /* The media column is far shorter than the details beside it, which left
         a tall empty void down the side of the page. Sticking it keeps the
         product in view while the options are read. */
      .media { position: sticky; inset-block-start: calc(var(--tt-header-height) + var(--tt-space-4)); }
    }
    .media {
      display: grid;
      place-items: center;
      padding: var(--tt-space-5);
      /* A ratio rather than a fixed floor. At 320px the artwork box took most
         of a phone screen before the name of the product appeared. */
      aspect-ratio: 4 / 3;
      min-block-size: 0;
      border-radius: var(--tt-radius-lg);
      background:
        radial-gradient(circle at 50% 115%, var(--tt-brand-tint), transparent 62%),
        var(--tt-surface);
      border: 1px solid var(--tt-border);
    }
    .info-skeleton { min-block-size: 520px; }
    .media img { max-block-size: 100%; object-fit: contain; }
    .media__art { inline-size: 56%; max-inline-size: 260px; }
    .chip__price { color: var(--tt-gold-400); font-weight: 700; }
    .info { display: flex; flex-direction: column; gap: var(--tt-space-3); }
    h1 { margin: 0; }
    .chooser { display: flex; flex-direction: column; gap: var(--tt-space-2); }
    .chips { display: flex; flex-wrap: wrap; gap: var(--tt-space-2); }
    .chip {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      padding: var(--tt-space-2) var(--tt-space-4);
      border-radius: var(--tt-radius-md);
      border: 1px solid var(--tt-border-strong);
      background: var(--tt-surface-2);
      color: var(--tt-text);
      font: inherit;
      cursor: pointer;
      transition: border-color var(--tt-duration) var(--tt-ease), background-color var(--tt-duration) var(--tt-ease);
    }
    .chip.on { border-color: var(--tt-brand-500); background: var(--tt-brand-tint); }
    .badges { gap: var(--tt-space-1); }
    .delivery { font-size: var(--tt-text-sm); margin: 0; }
    .price-row { display: flex; align-items: baseline; gap: var(--tt-space-2); margin-block-end: var(--tt-space-3); }
    .media { background: radial-gradient(70% 60% at 50% 60%, var(--tt-brand-tint), transparent 72%), repeating-linear-gradient(99deg, rgba(255, 248, 235, 0.03) 0 1px, transparent 1px 22px), var(--tt-bg-elevated); }
    .media__art { filter: drop-shadow(0 24px 30px rgba(0, 0, 0, 0.55)); }
    .chip__dot { display: none; inline-size: 8px; block-size: 8px; border-radius: 50%; background: var(--mat); box-shadow: 0 0 8px var(--mat); }
    .chip[style*="--mat"] .chip__dot { display: inline-block; }
    .chip.on[style*="--mat"] { border-color: var(--mat); box-shadow: 0 0 0 1px var(--mat), 0 8px 24px rgba(0, 0, 0, 0.35); }
    .buybar { display: none; }
    @media (max-width: 899px) {
      .buybar { position: fixed; inset-inline: var(--tt-space-3); inset-block-end: var(--tt-space-3); z-index: var(--tt-z-sticky); display: flex; align-items: center; justify-content: space-between; gap: var(--tt-space-3); padding: var(--tt-space-2) var(--tt-space-2) var(--tt-space-2) var(--tt-space-4); border-radius: var(--tt-radius-pill); }
      .buybar__price { font-size: 1.6rem; }
      .buybar .tt-btn { min-block-size: 44px; border-radius: var(--tt-radius-pill); }
      :host { display: block; padding-block-end: 84px; }
    }
    
    
    .grow { flex: 1; }
    .tt-alert span span { display: block; }
  `],
})
export class ProductDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogFacade);
  private readonly reviewApi = inject(ReviewApiService);
  private readonly analytics = inject(AnalyticsService);
  readonly cart = inject(CartFacade);

  readonly error = signal<AppError | undefined>(undefined);
  readonly variantId = signal<string>('');
  readonly platformId = signal<string>('');
  readonly regionId = signal<string>('');
  readonly quantity = signal(1);

  private readonly slug$ = this.route.paramMap.pipe(map((params) => params.get('productSlug') ?? ''));

  readonly vm$ = this.slug$.pipe(
    switchMap((slug) => combineLatest([
      this.catalog.productBySlug(slug),
      this.catalog.lookups$,
      this.catalog.relatedProducts(slug, 4),
    ])),
    tap(([detail]) => this.initSelection(detail)),
    map(([detail, lookups, related]): ProductViewModel => ({ detail, lookups, related })),
    catchError((error: unknown) => {
      this.error.set(toAppError(error));
      return EMPTY;
    }),
    // The template and the reviews stream both consume this; share the request.
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly reviews$ = this.vm$.pipe(
    switchMap((vm) => this.reviewApi.getReviews({ page: 1, pageSize: 4 }, vm.detail.product.id)),
    map((page) => page.items),
  );

  /** Seeds the selection from the route (deep link to a variant) or the first offer. */
  private initSelection(detail: ProductDetail): void {
    if (this.variantId() && detail.offers.some((offer) => offer.variantId === this.variantId())) {
      return;
    }
    const routeVariant = this.route.snapshot.paramMap.get('variantId');
    const first = detail.offers[0];
    const variant = routeVariant && detail.offers.some((offer) => offer.variantId === routeVariant)
      ? routeVariant
      : first?.variantId ?? '';
    const offer = detail.offers.find((candidate) => candidate.variantId === variant) ?? first;
    this.variantId.set(variant);
    this.platformId.set(offer?.platformId ?? '');
    this.regionId.set(offer?.regionId ?? '');
    this.analytics.track(AnalyticsEvent.ProductView, {
      productId: detail.product.id,
      type: detail.product.type,
    });
  }

  /**
   * Whether the quantity line adds anything to the chip.
   *
   * Variants are named after their size, so "250K מטבעות" was printing its own
   * quantity underneath itself in smaller grey type. The line is shown only
   * when the name does not already state the amount.
   */
  showsQuantity(variant: ProductVariant): boolean {
    if (variant.quantityValue === undefined) {
      return false;
    }
    const compact = formatQuantity(variant.quantityValue);
    return compact.length > 0 && !variant.name.he.includes(compact);
  }

  /**
   * The price a variant chip shows: the offer for the current platform and
   * region when there is one, otherwise the variant's first offer.
   */
  priceFor(vm: ProductViewModel, variant: ProductVariant): Money | undefined {
    const candidates = vm.detail.offers.filter((offer) => offer.variantId === variant.id);
    const match = candidates.find(
      (offer) => offer.platformId === this.platformId() && offer.regionId === this.regionId(),
    ) ?? candidates[0];
    return match?.price.current;
  }

  selectVariant(variant: ProductVariant): void {
    this.variantId.set(variant.id);
    this.analytics.track(AnalyticsEvent.ProductSelected, { variantId: variant.id });
    // Keep the platform/region choice when the new variant still offers it.
    this.quantity.set(1);
  }

  platformsFor(vm: ProductViewModel): readonly Platform[] {
    const ids = [...new Set(this.offersForVariant(vm).map((offer) => offer.platformId))];
    return ids.map((id) => vm.lookups.platforms.get(id)).filter((value): value is Platform => value !== undefined);
  }

  regionsFor(vm: ProductViewModel): readonly Region[] {
    const ids = [...new Set(this.offersForVariant(vm)
      .filter((offer) => !this.platformId() || offer.platformId === this.platformId())
      .map((offer) => offer.regionId))];
    return ids.map((id) => vm.lookups.regions.get(id)).filter((value): value is Region => value !== undefined);
  }

  /** The single offer the three selections resolve to, with sensible fallbacks. */
  offerFor(vm: ProductViewModel): Offer | undefined {
    const candidates = this.offersForVariant(vm);
    return candidates.find((offer) => offer.platformId === this.platformId() && offer.regionId === this.regionId())
      ?? candidates.find((offer) => offer.platformId === this.platformId())
      ?? candidates[0];
  }

  platformOf(vm: ProductViewModel, offer: Offer): Platform | undefined {
    return vm.lookups.platforms.get(offer.platformId);
  }

  regionOf(vm: ProductViewModel, offer: Offer): Region | undefined {
    return vm.lookups.regions.get(offer.regionId);
  }

  /**
   * Which pack composition to draw for the selected bundle.
   *
   * Coin bundles are drawn rather than photographed, at the tier the chosen
   * variant sits in, so the picture changes with the choice. Anything else
   * keeps its illustration. Zero means "use the picture".
   */
  /** The tier material for a variant, by its position in the range. */
  materialColor(index: number): string {
    return materialForStep(index + 1).color;
  }

  packSteps(vm: ProductViewModel): number {
    if (vm.detail.product.type !== ProductType.GameCurrency) {
      return 0;
    }
    const quantities = vm.detail.product.variants
      .map((variant) => variant.quantityValue)
      .filter((value): value is number => typeof value === 'number' && value > 0)
      .sort((a, b) => a - b);
    const selected = vm.detail.product.variants.find((variant) => variant.id === this.variantId());
    const index = quantities.indexOf(selected?.quantityValue ?? -1);
    return index < 0 ? Math.min(5, quantities.length) : Math.min(5, index + 1);
  }

  canBuy(offer: Offer): boolean {
    return offer.active
      && isPurchasable(offer.inventory)
      && offer.fulfillmentMethod !== FulfillmentMethod.NotSupported;
  }

  addToCart(offer: Offer): void {
    this.cart.add({ offerId: offer.id, quantity: this.quantity() }).subscribe();
  }

  buyNow(offer: Offer): void {
    this.cart.add({ offerId: offer.id, quantity: this.quantity() }).subscribe((item) => {
      if (item) {
        void this.router.navigate(['/checkout']);
      }
    });
  }

  private offersForVariant(vm: ProductViewModel): readonly Offer[] {
    return vm.detail.offers.filter((offer) => offer.variantId === this.variantId());
  }

  /**
   * Clears the error so the view re-subscribes.
   *
   * The stream ends in catchError -> EMPTY, which completes it, so nothing
   * retries by itself. Dropping the error swaps the template back to the
   * content branch, and because the stream is shared with refCount the last
   * unsubscribe tears it down and the next subscribe runs it again. Without
   * this the error component still drew a "try again" button that did nothing
   * when pressed.
   */
  retry(): void {
    this.error.set(undefined);
  }

}
