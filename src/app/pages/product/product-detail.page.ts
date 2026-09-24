import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, ViewChild, computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, combineLatest } from 'rxjs';
import { catchError, map, shareReplay, switchMap, tap } from 'rxjs/operators';

import { AnalyticsEvent, AnalyticsService } from '../../core/analytics';
import { LocalizePipe } from '../../core/i18n';
import { formatQuantity } from '../../core/value';
import { launchBonusOf } from '../../core/commerce';
import {
  AppError, AppErrorKind, FulfillmentMethod, Money, Offer, Platform, Product, ProductDetail, ProductType, ProductVariant, Region,
  isPurchasable, toAppError,
} from '../../domain';
import { ReviewApiService } from '../../data/api';
import { CartFacade, CatalogFacade, CatalogLookups, PlatformPreferenceService, StorefrontFacade } from '../../state';
import {
  ErrorStateComponent, FulfillmentBadgeComponent, MoneyPipe, PlatformBadgeComponent,
  ProductCardComponent, QuantitySelectorComponent, RegionBadgeComponent, ReviewCardComponent,
  StarRatingComponent, StockBadgeComponent, CompactNumberPipe, IconComponent, CoinArtComponent, StadiumComponent,
} from '../../ui';
import { PlatformPickerComponent } from '../../ui/components/commerce/platform-picker.component';
import { TIERS, tierForAmount } from '../../ui/components/cards/tiers';
import type { CoinTier } from '../../domain';

interface ProductViewModel {
  readonly detail: ProductDetail;
  readonly lookups: CatalogLookups;
  readonly related: readonly Product[];
}

/**
 * Product detail.
 *
 * The page is built around the offer, not the product: the customer picks a
 * bundle, a platform and, when the product has more than one, a store region,
 * and those choices resolve to exactly one offer with its own price, stock,
 * delivery method and terms.
 *
 * Every chooser is a real radio group with an unmistakable selected state,
 * and a choice with a single option is stated rather than offered: a control
 * that cannot change anything is not a control.
 */
@Component({
  selector: 'tt-product-detail-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe, MoneyPipe, CompactNumberPipe,
    PlatformBadgeComponent, RegionBadgeComponent, FulfillmentBadgeComponent, StockBadgeComponent,
    QuantitySelectorComponent, StarRatingComponent, ReviewCardComponent, ProductCardComponent,
    ErrorStateComponent, IconComponent, CoinArtComponent, StadiumComponent, PlatformPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <ng-container *ngIf="error() as appError; else content">
        <!-- A product that does not exist is a wrong link, not a failure. -->
        <div class="missing tt-card tt-card--pad" *ngIf="isMissing(appError); else realError">
          <span class="tt-eyebrow">404</span>
          <h1>המוצר הזה לא נמצא</h1>
          <p class="tt-muted">אולי הקישור ישן או שגוי. כל החבילות שאנחנו מוכרים נמצאות בחנות.</p>
          <div class="tt-row">
            <a class="tt-btn tt-btn--buy" routerLink="/store"><tt-icon name="coin" [size]="16"></tt-icon> לכל החבילות</a>
            <a class="tt-btn tt-btn--ghost" routerLink="/support">לתמיכה</a>
          </div>
        </div>
        <ng-template #realError>
          <tt-error-state [error]="appError" (retry)="retry()"></tt-error-state>
        </ng-template>
      </ng-container>

      <ng-template #content>
        <ng-container *ngIf="vm$ | async as vm; else loading">
          <nav class="crumbs tt-faint" aria-label="ניווט">
            <a routerLink="/store">חנות</a> <span aria-hidden="true">/</span> <span>{{ vm.detail.product.name | t }}</span>
          </nav>

          <div class="layout">
            <div class="media tt-card">
              <tt-stadium scene="stage"></tt-stadium>
              <tt-coin-art *ngIf="artTier(vm) as tier; else picture" class="media__art" [tier]="tier" variant="quote"></tt-coin-art>
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
              <p class="tt-muted lede">{{ vm.detail.product.description | t }}</p>

              <!-- Step 1: platform. Shared with the rest of the shop. -->
              <div class="chooser chooser--platform" *ngIf="platformsFor(vm) as options">
                <ng-container *ngIf="options.length > 1; else onePlatform">
                  <tt-platform-picker [platforms]="options"
                                      [selected]="platformId()"
                                      label="1. על מה משחקים?"
                                      [help]="true"
                                      [compact]="true"
                                      (selectedChange)="choosePlatform($event)">
                  </tt-platform-picker>
                </ng-container>
                <ng-template #onePlatform>
                  <p class="fact" *ngIf="options[0] as only"><span class="tt-label">פלטפורמה</span><strong>{{ only.name | t }}</strong></p>
                </ng-template>
              </div>

              <!-- Step 2: the bundle. -->
              <div class="chooser chooser--variant" role="radiogroup" [attr.aria-labelledby]="'variant-label'">
                <span class="tt-label" id="variant-label">2. {{ isCoins(vm) ? 'כמה קוינס?' : 'בחירת חבילה' }}</span>
                <div class="chips">
                  <button type="button"
                          *ngFor="let variant of vm.detail.product.variants"
                          role="radio"
                          [style.--mat]="tierColor(variant)"
                          class="chip"
                          [class.on]="variant.id === variantId()"
                          [attr.aria-checked]="variant.id === variantId()"
                          [attr.tabindex]="variant.id === variantId() ? 0 : -1"
                          (click)="selectVariant(variant)"
                          (keydown)="onVariantKeydown($event, vm)">
                    <span class="chip__main">
                      <span class="chip__dot" aria-hidden="true"></span>
                      <span class="chip__name">{{ variantTitle(variant) }}</span>
                      <span class="chip__check" aria-hidden="true"><tt-icon name="check" [size]="12"></tt-icon></span>
                    </span>
                    <small class="chip__sub" *ngIf="variantSub(variant) as sub">{{ sub }}</small>
                    <small class="chip__price tt-numeric" *ngIf="priceFor(vm, variant) as price">{{ price | money }}</small>
                  </button>
                </div>
              </div>

              <!-- Step 3, only when there is something to choose. -->
              <div class="chooser chooser--region" *ngIf="regionsFor(vm) as options">
                <ng-container *ngIf="options.length > 1">
                  <div role="radiogroup" aria-labelledby="region-label" class="group">
                    <span class="tt-label" id="region-label">3. אזור החנות של החשבון</span>
                    <div class="chips chips--row">
                      <button type="button" *ngFor="let region of options" class="chip chip--row"
                              role="radio"
                              [class.on]="region.id === regionId()"
                              [attr.aria-checked]="region.id === regionId()"
                              (click)="regionId.set(region.id)">
                        <span class="chip__main"><span class="chip__name">{{ region.name | t }}</span><span class="chip__check" aria-hidden="true"><tt-icon name="check" [size]="12"></tt-icon></span></span>
                      </button>
                    </div>
                  </div>
                </ng-container>
              </div>

              <ng-container *ngIf="offerFor(vm) as offer">
                <!-- A region lock is the one mistake this shop cannot undo, so it is
                     spelled out. A region-free product gets one quiet line instead. -->
                <div class="tt-alert tt-alert--warning" *ngIf="lockedRegion(vm, offer) as region">
                  <tt-icon name="globe" [size]="18"></tt-icon>
                  <span>
                    <strong>עובד רק בחשבון שאזור החנות שלו הוא {{ region.name | t }}</strong>
                    <span class="tt-faint" *ngIf="region.restrictionNotice">{{ region.restrictionNotice | t }}</span>
                  </span>
                </div>

                <div class="tt-row badges">
                  <tt-fulfillment-badge [descriptor]="vm.lookups.fulfillment.get(offer.fulfillmentMethod)">
                  </tt-fulfillment-badge>
                  <tt-stock-badge [status]="offer.inventory.status" [remaining]="offer.inventory.remaining">
                  </tt-stock-badge>
                  <tt-region-badge *ngIf="regionOf(vm, offer)?.isRegionFree === false" [region]="regionOf(vm, offer)"></tt-region-badge>
                </div>

                <p class="delivery tt-muted">
                  {{ vm.lookups.fulfillment.get(offer.fulfillmentMethod)?.description | t }}
                </p>

                <p class="kick" *ngIf="isCoins(vm) && storefront.state().launch.live">
                  <tt-icon name="bolt" [size]="14"></tt-icon>
                  הזמנה ראשונה? <strong>+{{ launchPercent() }}% קוינס מתנה</strong> (עד {{ launchCap() }}). נבדק בעגלה, לפי חשבון או אימייל.
                </p>

                <!-- The order, as it will be placed: what, for which platform, how much. -->
                <div class="buy tt-ticket tt-ticket--gold" #buyBlock>
                  <div class="tt-ticket__main">
                    <p class="tt-ticket__eyebrow"><span>ההזמנה שלך</span><span>{{ platformOf(vm, offer)?.name | t }}</span></p>

                    <dl class="recap">
                      <div class="recap__row">
                        <dt>מה</dt>
                        <dd>{{ selectedVariant(vm)?.name | t }}</dd>
                      </div>
                      <div class="recap__row" *ngIf="receivedCoins(vm) as coins">
                        <dt>מקבלים</dt>
                        <dd><strong class="tt-numeric">{{ coins }}</strong> קוינס</dd>
                      </div>
                      <div class="recap__row">
                        <dt>פלטפורמה</dt>
                        <dd>{{ platformOf(vm, offer)?.name | t }}</dd>
                      </div>
                    </dl>

                    <div class="price-row">
                      <span class="tt-price tt-price--xl">{{ offer.price.current | money }}</span>
                      <span class="tt-price-was" *ngIf="offer.price.compareAt">{{ offer.price.compareAt | money }}</span>
                      <span class="tt-badge tt-badge--accent" *ngIf="offer.price.discountPercent">
                        −{{ offer.price.discountPercent }}%
                      </span>
                      <span class="price-row__each tt-faint" *ngIf="quantity() > 1">× {{ quantity() }} = {{ lineTotal(offer) | money }}</span>
                    </div>

                    <div class="tt-row actions">
                      <tt-quantity-selector [value]="quantity()"
                                            [max]="offer.inventory.maxPerOrder ?? 10"
                                            (valueChange)="quantity.set($event)">
                      </tt-quantity-selector>

                      <button type="button" class="tt-btn tt-btn--buy tt-btn--lg grow"
                              [class.tt-btn--loading]="adding()"
                              [class.tt-btn--done]="added()"
                              [attr.aria-busy]="adding() ? 'true' : null"
                              [disabled]="!canBuy(offer) || cart.busy()"
                              (click)="addToCart(offer)">
                        <ng-container *ngIf="!added()"><tt-icon name="cart" [size]="16"></tt-icon> הוספה לעגלה</ng-container>
                        <ng-container *ngIf="added()"><tt-icon name="check" [size]="16"></tt-icon> נוסף לעגלה</ng-container>
                      </button>
                    </div>

                    <!-- The way forward once something is in the cart, in place. -->
                    <div class="next" *ngIf="!cart.isEmpty()" role="status">
                      <span>{{ cartLabel() }} בעגלה · {{ cart.totals().total | money }}</span>
                      <a class="tt-btn tt-btn--ghost tt-btn--sm" routerLink="/checkout">לתשלום <tt-icon name="chevron" [size]="13" dir="auto"></tt-icon></a>
                    </div>
                    <button type="button" class="quick" *ngIf="cart.isEmpty() && canBuy(offer)" [disabled]="cart.busy()" (click)="buyNow(offer)">
                      או ישר לתשלום <tt-icon name="chevron" [size]="13" dir="auto"></tt-icon>
                    </button>

                    <p class="tt-hint" *ngIf="!canBuy(offer)">המוצר אינו זמין לרכישה כרגע.</p>
                    <p class="tt-hint" *ngIf="offer.terms">{{ offer.terms | t }}</p>
                  </div>
                  <div class="tt-ticket__stub">
                    <span class="tt-ticket__tally"></span>
                    <span class="buy__stub">מחיר סופי · הפלטפורמה רשומה על ההזמנה</span>
                  </div>
                </div>
              </ng-container>
            </div>
          </div>

          <!-- On a phone the action never scrolls away, until the ticket itself is on screen. -->
          <div class="buybar tt-glass" *ngIf="offerFor(vm) as offer" [class.buybar--hidden]="ticketVisible()" [attr.aria-hidden]="ticketVisible()">
            <span class="buybar__facts">
              <span class="buybar__price tt-price">{{ offer.price.current | money }}</span>
              <span class="buybar__what tt-faint">{{ variantTitle(selectedVariant(vm)) }} · {{ platformOf(vm, offer)?.shortName | t }}</span>
            </span>
            <a class="buybar__cart" routerLink="/cart" *ngIf="!cart.isEmpty()" [attr.aria-label]="'לעגלה, ' + cartLabel()">
              <tt-icon name="cart" [size]="16"></tt-icon><span>{{ cart.itemCount() }}</span>
            </a>
            <button type="button" class="tt-btn tt-btn--buy"
                    [class.tt-btn--loading]="adding()"
                    [class.tt-btn--done]="added()"
                    [attr.aria-busy]="adding() ? 'true' : null"
                    [disabled]="!canBuy(offer) || cart.busy() || ticketVisible()"
                    [attr.tabindex]="ticketVisible() ? -1 : null"
                    (click)="addToCart(offer)">
              <ng-container *ngIf="!added()"><tt-icon name="cart" [size]="16"></tt-icon> הוספה לעגלה</ng-container>
              <ng-container *ngIf="added()"><tt-icon name="check" [size]="16"></tt-icon> נוסף</ng-container>
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
    .crumbs { display: flex; align-items: center; gap: 6px; margin-block-end: var(--tt-space-3); }
    .crumbs a { display: inline-flex; align-items: center; min-block-size: 32px; color: var(--tt-gold-400); }
    .missing { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tt-space-2); max-inline-size: 560px; }
    .missing h1 { margin: 0; }
    .missing .tt-row { margin-block-start: var(--tt-space-3); }
    .layout { display: grid; gap: var(--tt-space-5); grid-template-columns: 1fr; }
    @media (min-width: 900px) {
      .layout { grid-template-columns: 400px 1fr; align-items: start; }
      .media { position: sticky; inset-block-start: calc(var(--tt-header-height) + var(--tt-space-4)); }
    }
    .media {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      display: grid;
      place-items: center;
      padding: var(--tt-space-5);
      aspect-ratio: 4 / 3;
      min-block-size: 0;
      border-radius: var(--tt-radius-lg);
      border: 1px solid var(--tt-border);
    }
    .info-skeleton { min-block-size: 520px; }
    .media img { max-block-size: 100%; object-fit: contain; }
    .media__art { position: relative; inline-size: 70%; max-inline-size: 320px; filter: drop-shadow(0 24px 30px rgba(0, 0, 0, 0.55)); }
    .info { display: flex; flex-direction: column; gap: var(--tt-space-4); }
    h1 { margin: 0; }
    .lede { margin: 0; }

    .chooser { display: flex; flex-direction: column; gap: var(--tt-space-2); }
    .group { display: flex; flex-direction: column; gap: var(--tt-space-2); }
    .chooser--region:empty { display: none; }
    .fact { display: flex; align-items: center; gap: var(--tt-space-3); margin: 0; }
    .chips { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--tt-space-2); }
    .chips--row { display: flex; flex-wrap: wrap; }
    .chip {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
      min-block-size: 56px;
      padding: var(--tt-space-2) var(--tt-space-3);
      border-radius: var(--tt-radius-md);
      border: 1px solid var(--tt-border-strong);
      background: var(--tt-surface-2);
      color: var(--tt-text);
      font: inherit;
      text-align: start;
      cursor: pointer;
      transition: border-color var(--tt-duration-fast) var(--tt-ease), background-color var(--tt-duration-fast) var(--tt-ease), box-shadow var(--tt-duration-fast) var(--tt-ease);
    }
    .chip:hover { border-color: var(--tt-text-faint); background: var(--tt-surface-3); }
    .chip:active { transform: translateY(1px); }
    .chip:focus-visible { outline: 2px solid var(--tt-gold-400); outline-offset: 2px; }
    .chip.on { border-color: var(--tt-gold-500); background: var(--tt-gold-tint); box-shadow: inset 0 0 0 1px var(--tt-gold-500); }
    .chip--row { min-block-size: 44px; justify-content: center; }
    .chip__main { display: flex; align-items: center; gap: 8px; inline-size: 100%; }
    .chip__name { font-weight: 800; font-size: var(--tt-text-md); line-height: 1.1; }
    .chip__sub { color: var(--tt-text-muted); font-size: var(--tt-caption); font-weight: 700; }
    .chip.on .chip__sub { color: var(--tt-gold-400); }
    .chip__price { color: var(--tt-text); font-weight: 800; font-size: var(--tt-text-sm); }
    .chip.on .chip__price { color: var(--tt-gold-400); }
    .chip__dot { display: none; inline-size: 8px; block-size: 8px; border-radius: 50%; background: var(--mat); box-shadow: 0 0 8px var(--mat); flex: none; }
    .chip[style*="--mat"] .chip__dot { display: inline-block; }
    .chip__check { display: grid; place-items: center; margin-inline-start: auto; inline-size: 18px; block-size: 18px; border-radius: 50%; background: var(--tt-gold-500); color: var(--tt-text-on-gold); opacity: 0; transform: scale(0.6); transition: opacity var(--tt-duration-fast) var(--tt-ease), transform var(--tt-duration-fast) var(--tt-ease-out); flex: none; }
    .chip.on .chip__check { opacity: 1; transform: scale(1); }

    .badges { gap: var(--tt-space-1); }
    .delivery { font-size: var(--tt-text-sm); margin: 0; }
    .kick { display: flex; align-items: center; gap: 6px; margin: 0; padding: var(--tt-space-2) var(--tt-space-3); border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-md); background: var(--tt-gold-tint); font-size: var(--tt-text-sm); }
    .kick tt-icon { color: var(--tt-gold-400); flex: none; }
    .tt-alert span span { display: block; }

    .buy .tt-ticket__main { display: flex; flex-direction: column; gap: var(--tt-space-3); padding: var(--tt-space-5); }
    .recap { display: flex; flex-direction: column; gap: 4px; margin: 0; }
    .recap__row { display: flex; gap: var(--tt-space-3); font-size: var(--tt-text-sm); }
    .recap__row dt { flex: none; inline-size: 5.5rem; color: var(--tt-text-faint); font-weight: 700; }
    .recap__row dd { margin: 0; }
    .price-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--tt-space-2); }
    .price-row__each { font-size: var(--tt-text-sm); font-weight: 700; }
    .actions { flex-wrap: wrap; }
    .grow { flex: 1; min-inline-size: 180px; }
    .next { display: flex; align-items: center; justify-content: space-between; gap: var(--tt-space-3); padding: var(--tt-space-2) var(--tt-space-3); border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-md); background: var(--tt-surface-2); font-size: var(--tt-text-sm); font-weight: 700; }
    .quick { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; min-block-size: 40px; padding: 0 var(--tt-space-2); border: 0; background: none; color: var(--tt-gold-400); font: inherit; font-size: var(--tt-text-sm); font-weight: 700; cursor: pointer; text-decoration: underline; text-underline-offset: 4px; text-decoration-color: rgba(212, 180, 106, 0.4); }
    .quick:hover:not(:disabled) { color: var(--tt-gold-300); }
    .quick:disabled { opacity: 0.5; cursor: not-allowed; }
    .buy__stub { font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text-muted); }

    .buybar { display: none; }
    @media (max-width: 899px) {
      .buybar { position: fixed; inset-inline: var(--tt-space-3); inset-block-end: var(--tt-space-3); z-index: var(--tt-z-sticky); display: flex; align-items: center; justify-content: space-between; gap: var(--tt-space-2); padding: var(--tt-space-2) var(--tt-space-2) var(--tt-space-2) var(--tt-space-4); padding-inline-start: var(--tt-space-4); padding-inline-end: var(--tt-space-2); border-radius: var(--tt-radius-lg); transition: opacity var(--tt-duration-fast) var(--tt-ease), transform var(--tt-duration-fast) var(--tt-ease); }
      .buybar--hidden { opacity: 0; transform: translateY(12px); pointer-events: none; }
      .buybar__facts { display: flex; flex-direction: column; min-inline-size: 0; line-height: 1.1; }
      .buybar__price { font-size: 1.5rem; }
      .buybar__what { font-size: var(--tt-caption); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .buybar__cart { display: inline-flex; align-items: center; gap: 4px; min-block-size: 44px; padding: 0 var(--tt-space-3); border: 1px solid var(--tt-border-strong); border-radius: var(--tt-radius-md); color: var(--tt-text); font-weight: 800; font-size: var(--tt-text-sm); }
      .buybar .tt-btn { min-block-size: 44px; white-space: nowrap; }
      :host { display: block; padding-block-end: 84px; }
      .chips { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 359px) { .chips { grid-template-columns: 1fr; } }
    @media (prefers-reduced-motion: reduce) { .chip, .chip__check, .buybar { transition: none; } }
  `],
})
export class ProductDetailPage implements AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogFacade);
  private readonly reviewApi = inject(ReviewApiService);
  private readonly analytics = inject(AnalyticsService);
  private readonly preference = inject(PlatformPreferenceService);
  readonly storefront = inject(StorefrontFacade);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  readonly cart = inject(CartFacade);

  readonly error = signal<AppError | undefined>(undefined);
  readonly variantId = signal<string>('');
  readonly platformId = signal<string>('');
  readonly regionId = signal<string>('');
  readonly quantity = signal(1);
  /** This page's own add in flight, so a busy cart elsewhere does not spin our button. */
  readonly adding = signal(false);
  /** Confirmed in place for a moment after the server answered. */
  readonly added = signal(false);
  /** True while the buy ticket is on screen, when the fixed bar would only duplicate it. */
  readonly ticketVisible = signal(false);

  readonly cartLabel = computed(() => `${this.cart.itemCount()} ${this.cart.itemCount() === 1 ? 'פריט' : 'פריטים'}`);
  readonly launchPercent = computed(() => Math.round(this.storefront.state().launch.percentBps / 100));
  readonly launchCap = computed(() => formatQuantity(this.storefront.state().launch.capCoins));

  @ViewChild('buyBlock') private set buyBlock(ref: ElementRef<HTMLElement> | undefined) {
    this.observe(ref?.nativeElement);
  }
  private observer?: IntersectionObserver;

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
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly reviews$ = this.vm$.pipe(
    switchMap((vm) => this.reviewApi.getReviews({ page: 1, pageSize: 4 }, vm.detail.product.id)),
    map((page) => page.items),
  );

  ngAfterViewInit(): void {
    this.destroyRef.onDestroy(() => this.observer?.disconnect());
  }

  /** Seeds the selection from the route (deep link to a variant), the remembered platform, or the first offer. */
  private initSelection(detail: ProductDetail): void {
    if (this.variantId() && detail.offers.some((offer) => offer.variantId === this.variantId())) {
      return;
    }
    const routeVariant = this.route.snapshot.paramMap.get('variantId');
    const first = detail.offers[0];
    const variant = routeVariant && detail.offers.some((offer) => offer.variantId === routeVariant)
      ? routeVariant
      : first?.variantId ?? '';
    const candidates = detail.offers.filter((candidate) => candidate.variantId === variant);
    const remembered = this.preference.platformId();
    const offer = candidates.find((candidate) => candidate.platformId === remembered) ?? candidates[0] ?? first;
    this.variantId.set(variant);
    this.platformId.set(offer?.platformId ?? '');
    this.regionId.set(offer?.regionId ?? '');
    this.analytics.track(AnalyticsEvent.ProductView, {
      productId: detail.product.id,
      type: detail.product.type,
    });
  }

  isMissing(error: AppError): boolean {
    return error.kind === AppErrorKind.NotFound;
  }

  isCoins(vm: ProductViewModel): boolean {
    return vm.detail.product.type === ProductType.GameCurrency;
  }

  /** The bundle's headline: its size when it has one, otherwise its name. */
  variantTitle(variant: ProductVariant | undefined): string {
    if (!variant) {
      return '';
    }
    const compact = formatQuantity(variant.quantityValue);
    return compact || variant.name.he;
  }

  /** The second line of a chip: the bonus for a coin bundle, the unit otherwise. */
  variantSub(variant: ProductVariant): string | undefined {
    const bonus = launchBonusOf(variant);
    if (bonus > 0 && variant.quantityValue) {
      return `+${formatQuantity(bonus)} בונוס = ${formatQuantity(variant.quantityValue + bonus)}`;
    }
    if (variant.quantityValue !== undefined) {
      const compact = formatQuantity(variant.quantityValue);
      return compact && !variant.name.he.includes(compact) ? `${compact} ${variant.quantityUnit?.he ?? ''}`.trim() : undefined;
    }
    return undefined;
  }

  selectedVariant(vm: ProductViewModel): ProductVariant | undefined {
    return vm.detail.product.variants.find((variant) => variant.id === this.variantId());
  }

  /** Coins received for the selection, bonus included, times the quantity. */
  receivedCoins(vm: ProductViewModel): string | undefined {
    const variant = this.selectedVariant(vm);
    if (!variant?.quantityValue || !this.isCoins(vm)) {
      return undefined;
    }
    return formatQuantity((variant.quantityValue + launchBonusOf(variant)) * this.quantity());
  }

  lineTotal(offer: Offer): Money {
    return { ...offer.price.current, amountMinor: offer.price.current.amountMinor * this.quantity() };
  }

  priceFor(vm: ProductViewModel, variant: ProductVariant): Money | undefined {
    const candidates = vm.detail.offers.filter((offer) => offer.variantId === variant.id);
    const match = candidates.find(
      (offer) => offer.platformId === this.platformId() && offer.regionId === this.regionId(),
    ) ?? candidates.find((offer) => offer.platformId === this.platformId()) ?? candidates[0];
    return match?.price.current;
  }

  selectVariant(variant: ProductVariant): void {
    this.variantId.set(variant.id);
    this.analytics.track(AnalyticsEvent.ProductSelected, { variantId: variant.id });
    this.quantity.set(1);
    this.added.set(false);
  }

  /** Arrow keys move through the bundles, as in any radio group. */
  onVariantKeydown(event: KeyboardEvent, vm: ProductViewModel): void {
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!keys.includes(event.key)) {
      return;
    }
    event.preventDefault();
    const variants = vm.detail.product.variants;
    const current = Math.max(0, variants.findIndex((variant) => variant.id === this.variantId()));
    const rtl = document.documentElement.dir === 'rtl';
    const forward = event.key === 'ArrowDown' || (rtl ? event.key === 'ArrowLeft' : event.key === 'ArrowRight');
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? variants.length - 1
      : (current + (forward ? 1 : -1) + variants.length) % variants.length;
    this.selectVariant(variants[next]);
    const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[next]?.focus();
  }

  choosePlatform(platform: Platform): void {
    this.platformId.set(platform.id);
    this.preference.set(platform.id);
    this.added.set(false);
  }

  platformsFor(vm: ProductViewModel): readonly Platform[] {
    const ids = [...new Set(this.offersForVariant(vm).map((offer) => offer.platformId))];
    return ids
      .map((id) => vm.lookups.platforms.get(id))
      .filter((value): value is Platform => value !== undefined)
      .sort((a, b) => a.sortOrder - b.sortOrder);
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

  /** The region, only when it locks the product to an account. */
  lockedRegion(vm: ProductViewModel, offer: Offer): Region | undefined {
    const region = this.regionOf(vm, offer);
    return region && !region.isRegionFree ? region : undefined;
  }

  tierColor(variant: { readonly quantityValue?: number }): string {
    return TIERS[tierForAmount(variant.quantityValue)].color;
  }

  artTier(vm: ProductViewModel): CoinTier | null {
    if (vm.detail.product.type !== ProductType.GameCurrency) {
      return null;
    }
    const selected = vm.detail.product.variants.find((variant) => variant.id === this.variantId());
    const largest = Math.max(0, ...vm.detail.product.variants
      .map((variant) => variant.quantityValue)
      .filter((value): value is number => typeof value === 'number' && value > 0));
    return tierForAmount(selected?.quantityValue ?? largest);
  }

  canBuy(offer: Offer): boolean {
    return offer.active
      && isPurchasable(offer.inventory)
      && offer.fulfillmentMethod !== FulfillmentMethod.NotSupported;
  }

  addToCart(offer: Offer): void {
    if (this.adding()) {
      return;
    }
    this.adding.set(true);
    this.cart.add({ offerId: offer.id, quantity: this.quantity() }).subscribe((item) => {
      this.adding.set(false);
      if (item) {
        this.added.set(true);
        setTimeout(() => this.added.set(false), 1800);
      }
    });
  }

  buyNow(offer: Offer): void {
    if (this.adding()) {
      return;
    }
    this.adding.set(true);
    this.cart.add({ offerId: offer.id, quantity: this.quantity() }).subscribe((item) => {
      this.adding.set(false);
      if (item) {
        void this.router.navigate(['/checkout']);
      }
    });
  }

  private offersForVariant(vm: ProductViewModel): readonly Offer[] {
    return vm.detail.offers.filter((offer) => offer.variantId === this.variantId());
  }

  /** Watches the ticket so the fixed bar steps aside while the real action is on screen. */
  private observe(element: HTMLElement | undefined): void {
    this.observer?.disconnect();
    this.observer = undefined;
    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver((entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible !== this.ticketVisible()) {
          this.zone.run(() => this.ticketVisible.set(visible));
        }
      }, { threshold: 0.35 });
      this.observer.observe(element);
    });
  }

  /**
   * Clears the error so the view re-subscribes. The stream ends in
   * catchError -> EMPTY, which completes it, so nothing retries by itself.
   */
  retry(): void {
    this.error.set(undefined);
  }
}
