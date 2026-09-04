import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { launchBonusOf } from '../../core/commerce';
import { formatQuantity } from '../../core/value';
import { LocalizePipe } from '../../core/i18n';
import { CartItem, ProductType, ProductVariant } from '../../domain';
import { CartFacade, CatalogFacade } from '../../state';
import {
  BundleLadderComponent, CoinArtComponent,
  EmptyStateComponent, FulfillmentBadgeComponent, MoneyPipe, PlatformBadgeComponent,
  QuantitySelectorComponent, RegionBadgeComponent,
} from '../../ui';

/**
 * The cart.
 *
 * Each line repeats the platform, region and delivery method, because the cart is
 * the last screen before checkout where a customer can catch a wrong-region
 * purchase. Totals come from the facade, never from arithmetic in the template.
 */
@Component({
  selector: 'tt-cart-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, LocalizePipe, MoneyPipe,
    QuantitySelectorComponent, PlatformBadgeComponent, RegionBadgeComponent,
    FulfillmentBadgeComponent, EmptyStateComponent, BundleLadderComponent, CoinArtComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <h1>העגלה שלי</h1>

      <!-- An empty cart is the one screen where the customer has already
           decided to buy something and has nothing to look at. Showing the
           tiers turns a dead end back into the shop, instead of leaving four
           hundred pixels of black above the footer. -->
      <ng-container *ngIf="cart.isEmpty()">
        <tt-empty-state icon="cart" pose="walk"
                        title="העגלה ריקה"
                        message="עדיין לא הוספתם כלום. אלה החבילות הזמינות."
                        actionLabel="לכל החבילות"
                        (action)="goToStore()">
        </tt-empty-state>

        <section class="revive" *ngIf="ladder$ | async as ladder">
          <h2>חבילות קוינס</h2>
          <tt-bundle-ladder [detail]="ladder" [productSlug]="ladder.product.slug"></tt-bundle-ladder>
        </section>
      </ng-container>

      <ng-container *ngIf="!cart.isEmpty()">
        <div class="tt-alert tt-alert--warning" *ngFor="let issue of cart.issues()">
          {{ issue.message | t }}
        </div>

        <div class="layout" *ngIf="lookups$ | async as lookups">
          <ul class="lines">
            <li class="line tt-card" *ngFor="let item of cart.items(); trackBy: trackById">
              <tt-coin-art *ngIf="isCoins(item); else picture" class="thumb" variant="quote" artKey="fut-thumb" tier="legend"></tt-coin-art>
              <ng-template #picture>
                <img *ngIf="item.imageUrl" [src]="item.imageUrl" [alt]="item.displayName | t" />
              </ng-template>

              <div class="details">
                <strong>{{ item.displayName | t }}</strong>
                <ng-container *ngIf="receipt(item) as value; else plainVariant">
                  <span class="receipt">
                    <span class="receipt__base tt-numeric">{{ value.base }}</span>
                    <span class="receipt__plus tt-numeric">+ {{ value.bonus }} בונוס השקה</span>
                    <span class="receipt__eq">=</span>
                    <strong class="receipt__total tt-numeric">{{ value.total }} קוינס</strong>
                    <span class="receipt__per" *ngIf="item.quantity > 1">× {{ item.quantity }}</span>
                  </span>
                </ng-container>
                <ng-template #plainVariant><span class="tt-muted">{{ item.displayVariantName | t }}</span></ng-template>
                <div class="tt-row">
                  <tt-platform-badge [platform]="lookups.platforms.get(item.platformId)"></tt-platform-badge>
                  <tt-region-badge [region]="lookups.regions.get(item.regionId)"></tt-region-badge>
                  <tt-fulfillment-badge [descriptor]="lookups.fulfillment.get(item.fulfillmentMethod)">
                  </tt-fulfillment-badge>
                </div>
              </div>

              <div class="controls">
                <tt-quantity-selector [value]="item.quantity"
                                      (valueChange)="cart.updateQuantity(item.id, $event)">
                </tt-quantity-selector>
                <span class="line-total">{{ item.totalPrice | money }}</span>
                <button type="button" class="tt-btn tt-btn--quiet tt-btn--sm" (click)="cart.remove(item.id)">
                  הסרה
                </button>
              </div>
            </li>
          </ul>

          <aside class="summary tt-ticket tt-ticket--gold">
            <div class="tt-ticket__main summary__main">
            <p class="tt-ticket__eyebrow"><span>כרטיס · ההזמנה שלך</span><span>{{ cart.items().length }} פריטים</span></p>
            <h2>סיכום</h2>

            <div class="row row--coins" *ngIf="totalCoins() as coins">
              <span>סה״כ קוינס שתקבלו</span><span class="tt-numeric coins">{{ coins }}</span>
            </div>
            <div class="row"><span>סכום ביניים</span><span>{{ cart.totals().subtotal | money }}</span></div>
            <div class="row" *ngIf="cart.totals().discount.amountMinor > 0">
              <span>הנחה</span><span>−{{ cart.totals().discount | money }}</span>
            </div>
            <div class="row total"><span>לתשלום</span><span>{{ cart.totals().total | money }}</span></div>

            <label class="tt-field coupon">
              <span class="tt-label">קוד קופון</span>
              <div class="tt-row">
                <!-- Enter applies it. Typing a code and pressing return is the
                     obvious thing to do, and it used to do nothing. -->
                <input class="tt-input" [(ngModel)]="couponCode" name="coupon" placeholder="יש לכם קוד?"
                       (keyup.enter)="couponCode && !cart.busy() && applyCoupon()" />
                <button type="button" class="tt-btn tt-btn--ghost tt-btn--sm"
                        [disabled]="!couponCode || cart.busy()" (click)="applyCoupon()">
                  החלה
                </button>
              </div>
            </label>

            <button type="button" class="tt-btn tt-btn--buy tt-btn--lg tt-btn--block"
                    [disabled]="cart.busy()" (click)="goToCheckout()">
              מעבר לתשלום
            </button>

            <p class="tt-hint">
              המחירים והזמינות נבדקים מחדש מול הקטלוג לפני התשלום.
            </p>
            <a class="tt-btn tt-btn--quiet tt-btn--block" routerLink="/store">המשך קנייה</a>
            </div>
            <div class="tt-ticket__stub">
              <span class="tt-ticket__tally"></span>
              <span class="summary__stub">מחיר סופי · נבדק מול הקטלוג</span>
            </div>
          </aside>
        </div>
      </ng-container>
    </div>
  `,
  styles: [`
    h1 { margin-block-end: var(--tt-space-5); }
    .revive { margin-block-start: var(--tt-space-6); }
    .revive h2 { font-size: var(--tt-text-lg); margin-block-end: var(--tt-space-3); }

    .layout { display: grid; gap: var(--tt-space-5); align-items: start; }
    @media (min-width: 900px) { .layout { grid-template-columns: 1fr 320px; } }
    .lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .line { display: flex; gap: var(--tt-space-4); padding: var(--tt-space-4); align-items: center; flex-wrap: wrap; }
    .line img { inline-size: 64px; block-size: 64px; object-fit: contain; }
    .line .thumb { inline-size: 84px; flex: none; }
    .receipt { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; font-size: var(--tt-text-sm); }
    .receipt__base { color: var(--tt-text-muted); }
    .receipt__plus { color: var(--tt-gold-400); font-weight: 700; unicode-bidi: isolate; }
    .receipt__eq { color: var(--tt-text-faint); }
    .receipt__total { color: var(--tt-text); font-size: var(--tt-text-md); }
    .receipt__per { color: var(--tt-text-faint); }
    .row--coins { padding: var(--tt-space-2) var(--tt-space-3); margin-block-end: var(--tt-space-2); border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-md); background: var(--tt-gold-tint); font-weight: 700; }
    .row--coins .coins { color: var(--tt-gold-400); font-size: var(--tt-text-lg); font-weight: 900; }
    .details { display: flex; flex-direction: column; gap: var(--tt-space-1); flex: 1; min-inline-size: 180px; }
    .controls { display: flex; align-items: center; gap: var(--tt-space-3); }
    .line-total { font-weight: 700; min-inline-size: 84px; }
    .summary { position: sticky; inset-block-start: 88px; }
    .summary__main { display: flex; flex-direction: column; gap: var(--tt-space-3); padding: var(--tt-space-5); }
    .summary__stub { font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text-muted); }
    .summary h2 { font-size: var(--tt-text-lg); margin: 0; }
    .row { display: flex; justify-content: space-between; font-size: var(--tt-text-sm); }
    .row.total { font-size: var(--tt-text-lg); font-weight: 700; padding-block-start: var(--tt-space-2); border-block-start: 1px solid var(--tt-border); }
    .coupon { margin-block-start: var(--tt-space-2); }
  `],
})
export class CartPage {
  readonly cart = inject(CartFacade);

  /** A coin line shows the FUT coin; the catalog's own picture is a flat icon. */
  isCoins(item: CartItem): boolean {
    return /\/coins\.svg$/.test(item.imageUrl ?? '');
  }

  private readonly catalog = inject(CatalogFacade);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);

  readonly lookups$ = this.catalog.lookups$;

  /**
   * The coin tiers, shown only when the cart is empty.
   *
   * Resolved from the catalog rather than pinned to a slug, so it disappears on
   * its own if the shop stops selling game currency. A failure here is not an
   * error state: the empty message above it is the page.
   */
  readonly ladder$ = this.catalog.productsForGame(STOREFRONT.focusGameSlug).pipe(
    map((products) => products.find((product) => product.type === ProductType.GameCurrency)),
    switchMap((coins) => (coins
      ? this.catalog.productBySlug(coins.slug).pipe(catchError(() => of(null)))
      : of(null))),
  );

  /** The coin product's variants by id, so a line can say what it delivers. */
  private readonly variants = toSignal(
    this.catalog.productBySlug(STOREFRONT.focusProductSlug).pipe(
      map((detail) => new Map<string, ProductVariant>(detail.product.variants.map((variant) => [variant.id, variant]))),
      catchError(() => of(new Map<string, ProductVariant>())),
    ),
    { initialValue: new Map<string, ProductVariant>() },
  );

  /** Coins across every coin line, bonus included; undefined when no line is coins. */
  readonly totalCoins = computed<string | undefined>(() => {
    let sum = 0;
    let any = false;
    for (const item of this.cart.items()) {
      const variant = this.variants().get(item.variantId);
      if (variant?.quantityValue) {
        any = true;
        sum += (variant.quantityValue + launchBonusOf(variant)) * item.quantity;
      }
    }
    return any ? formatQuantity(sum) : undefined;
  });

  couponCode = '';

  constructor() {
    this.analytics.pageView('/cart', 'Cart');
  }

  /** Base plus bonus equals received, for a coin line with a bonus. */
  receipt(item: CartItem): { base: string; bonus: string; total: string } | undefined {
    const variant = this.variants().get(item.variantId);
    const bonus = launchBonusOf(variant);
    if (!variant?.quantityValue || bonus <= 0) {
      return undefined;
    }
    return { base: formatQuantity(variant.quantityValue), bonus: formatQuantity(bonus), total: formatQuantity(variant.quantityValue + bonus) };
  }

  applyCoupon(): void {
    this.cart.applyCoupon(this.couponCode).subscribe();
  }

  goToCheckout(): void {
    void this.router.navigate(['/checkout']);
  }

  goToStore(): void {
    void this.router.navigate(['/store']);
  }

  trackById(_index: number, item: CartItem): string {
    return item.id;
  }
}
