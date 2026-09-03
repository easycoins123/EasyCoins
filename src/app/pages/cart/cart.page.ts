import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { LocalizePipe } from '../../core/i18n';
import { CartItem, ProductType } from '../../domain';
import { CartFacade, CatalogFacade } from '../../state';
import {
  BundleLadderComponent,
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
    FulfillmentBadgeComponent, EmptyStateComponent, BundleLadderComponent,
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
              <img *ngIf="item.imageUrl" [src]="item.imageUrl" [alt]="item.displayName | t" />

              <div class="details">
                <strong>{{ item.displayName | t }}</strong>
                <span class="tt-muted">{{ item.displayVariantName | t }}</span>
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
                <input class="tt-input" [(ngModel)]="couponCode" name="coupon" placeholder="LAUNCH10"
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

  couponCode = '';

  constructor() {
    this.analytics.pageView('/cart', 'Cart');
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
