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
import { formatQuantity, itemsLabel } from '../../core/value';
import { LocalizePipe } from '../../core/i18n';
import { CartItem, Platform, ProductDetail, ProductType, ProductVariant } from '../../domain';
import { CartFacade, CatalogFacade, CatalogLookups, PlatformPreferenceService, StorefrontFacade } from '../../state';
import {
  BundleLadderComponent, CoinArtComponent,
  EmptyStateComponent, FulfillmentBadgeComponent, IconComponent, MoneyPipe, PlatformBadgeComponent,
  QuantitySelectorComponent, RegionBadgeComponent,
} from '../../ui';
import { PlatformPickerComponent } from '../../ui/components/commerce/platform-picker.component';
import { BenefitsNoteComponent } from '../../ui/components/growth/benefits-note.component';
import { RewardPickerComponent } from '../../ui/components/growth/reward-picker.component';
import { GrowthFacade } from '../../state/growth.facade';

/**
 * The cart.
 *
 * Each line says what it is, for which platform, how many coins arrive and
 * what it costs, in words a parent can read. The platform can be changed on
 * the line itself, because the wrong console is the one mistake a customer
 * makes here that used to need removing the line and finding it again.
 * Totals come from the facade, never from arithmetic in the template.
 */
@Component({
  selector: 'tt-cart-page',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, LocalizePipe, MoneyPipe, IconComponent,
    QuantitySelectorComponent, PlatformBadgeComponent, RegionBadgeComponent,
    FulfillmentBadgeComponent, EmptyStateComponent, BundleLadderComponent, CoinArtComponent, PlatformPickerComponent,
    BenefitsNoteComponent, RewardPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <h1>העגלה שלי</h1>

      <!-- An empty cart is the one screen where the customer has already
           decided to buy something and has nothing to look at. Showing the
           tiers turns a dead end back into the shop. -->
      <ng-container *ngIf="cart.isEmpty()">
        <tt-empty-state icon="cart" pose="walk"
                        title="העגלה ריקה"
                        message="עדיין לא הוספתם כלום. בוחרים חבילה למטה או בחנות."
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
                <strong class="details__name">{{ item.displayName | t }}</strong>
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

                <!-- The platform, as a fact and, for a coin line, as a choice. -->
                <div class="platform">
                  <ng-container *ngIf="platformOptions(item, lookups) as options; else platformFact">
                    <tt-platform-picker [platforms]="options"
                                        [selected]="item.platformId"
                                        label="פלטפורמה"
                                        [compact]="true"
                                        (selectedChange)="switchPlatform(item, $event)">
                    </tt-platform-picker>
                  </ng-container>
                  <ng-template #platformFact>
                    <span class="tt-label">פלטפורמה</span>
                    <tt-platform-badge [platform]="lookups.platforms.get(item.platformId)"></tt-platform-badge>
                  </ng-template>
                </div>

                <div class="tt-row badges">
                  <tt-region-badge *ngIf="lookups.regions.get(item.regionId)?.isRegionFree === false" [region]="lookups.regions.get(item.regionId)"></tt-region-badge>
                  <tt-fulfillment-badge [descriptor]="lookups.fulfillment.get(item.fulfillmentMethod)">
                  </tt-fulfillment-badge>
                </div>
              </div>

              <div class="controls">
                <span class="controls__qty">
                  <span class="tt-label">כמות</span>
                  <tt-quantity-selector [value]="item.quantity"
                                        (valueChange)="cart.updateQuantity(item.id, $event)">
                  </tt-quantity-selector>
                </span>
                <span class="line-total tt-numeric">{{ item.totalPrice | money }}</span>
                <button type="button" class="remove" (click)="cart.remove(item.id)" [attr.aria-label]="'הסרת ' + (item.displayVariantName | t) + ' מהעגלה'">
                  <tt-icon name="close" [size]="14"></tt-icon> הסרה
                </button>
              </div>
            </li>
          </ul>

          <aside class="summary tt-ticket tt-ticket--gold">
            <div class="tt-ticket__main summary__main">
            <p class="tt-ticket__eyebrow"><span>ההזמנה שלך</span><span>{{ countLabel() }}</span></p>
            <h2>סיכום</h2>

            <div class="row row--coins" *ngIf="totalCoins() as coins">
              <span>סה״כ קוינס שתקבלו</span><span class="tt-numeric coins">{{ coins }}</span>
            </div>
            <div class="row"><span>סכום ביניים</span><span>{{ cart.totals().subtotal | money }}</span></div>
            <div class="row" *ngIf="cart.totals().discount.amountMinor > 0">
              <span>{{ discountLabel() }}</span><span>−{{ cart.totals().discount | money }}</span>
            </div>
            <div class="row total"><span>לתשלום</span><span>{{ cart.totals().total | money }}</span></div>
            <!-- Which benefit is on this order and which was set aside, in the server's words. -->
            <tt-benefits-note [benefits]="cart.benefits()"></tt-benefits-note>

            <!-- Earned rewards: one per order, chosen here, priced by the server. -->
            <tt-reward-picker class="rewards"
                              [rewards]="growth.redeemable()"
                              [selectedId]="cart.rewardId()"
                              [busy]="cart.busy()"
                              (select)="useReward($event)"
                              (clear)="cart.clearReward()"></tt-reward-picker>

            <details class="coupon-box">
              <summary><tt-icon name="tag" [size]="14"></tt-icon> יש לכם קוד קופון?</summary>
              <label class="tt-field coupon">
                <span class="tt-label">קוד קופון</span>
                <div class="tt-row">
                  <input class="tt-input" [(ngModel)]="couponCode" name="coupon" placeholder="הקלידו את הקוד"
                         autocomplete="off" autocapitalize="characters" enterkeyhint="done"
                         (keyup.enter)="couponCode && !cart.busy() && applyCoupon()" />
                  <button type="button" class="tt-btn tt-btn--ghost"
                          [disabled]="!couponCode || cart.busy()" (click)="applyCoupon()">
                    החלה
                  </button>
                </div>
              </label>
            </details>

            <button type="button" class="tt-btn tt-btn--buy tt-btn--lg tt-btn--block"
                    [disabled]="cart.busy()" (click)="goToCheckout()">
              מעבר לתשלום <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon>
            </button>

            <p class="tt-hint">
              בשלב הבא ממלאים פרטים לאספקה, ואז משלמים. המחיר נבדק שוב מול הקטלוג לפני התשלום.
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
    .line { display: grid; grid-template-columns: 84px minmax(0, 1fr); grid-template-areas: 'thumb details' 'controls controls'; gap: var(--tt-space-3) var(--tt-space-4); padding: var(--tt-space-4); align-items: start; }
    @media (min-width: 720px) { .line { grid-template-columns: 84px minmax(0, 1fr) auto; grid-template-areas: 'thumb details controls'; align-items: center; } }
    .line img { grid-area: thumb; inline-size: 64px; block-size: 64px; object-fit: contain; }
    .line .thumb { grid-area: thumb; inline-size: 84px; }
    .details { grid-area: details; display: flex; flex-direction: column; gap: var(--tt-space-2); min-inline-size: 0; }
    .details__name { font-size: var(--tt-text-md); }
    .receipt { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; font-size: var(--tt-text-sm); }
    .receipt__base { color: var(--tt-text-muted); }
    .receipt__plus { color: var(--tt-gold-400); font-weight: 700; unicode-bidi: isolate; }
    .receipt__eq { color: var(--tt-text-faint); }
    .receipt__total { color: var(--tt-text); font-size: var(--tt-text-md); }
    .receipt__per { color: var(--tt-text-faint); }
    .platform { display: flex; flex-direction: column; gap: var(--tt-space-1); }
    .platform > .tt-label { font-size: var(--tt-caption); color: var(--tt-text-faint); }
    .badges { gap: var(--tt-space-1); }
    .controls { grid-area: controls; display: flex; align-items: center; flex-wrap: wrap; gap: var(--tt-space-3); padding-block-start: var(--tt-space-2); border-block-start: 1px solid var(--tt-border); }
    @media (min-width: 720px) { .controls { flex-direction: column; align-items: flex-end; padding-block-start: 0; border-block-start: 0; } }
    .controls__qty { display: flex; align-items: center; gap: var(--tt-space-2); }
    .controls__qty .tt-label { font-size: var(--tt-caption); color: var(--tt-text-faint); }
    .line-total { font-weight: 800; font-size: var(--tt-text-lg); margin-inline-start: auto; }
    @media (min-width: 720px) { .line-total { margin-inline-start: 0; } }
    .remove { display: inline-flex; align-items: center; gap: 4px; min-block-size: 44px; padding: 0 var(--tt-space-3); border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); background: transparent; color: var(--tt-text-muted); font: inherit; font-size: var(--tt-text-sm); font-weight: 600; cursor: pointer; }
    .remove:hover { color: var(--tt-danger); border-color: var(--tt-danger); background: var(--tt-danger-tint); }
    .remove:focus-visible { outline: 2px solid var(--tt-gold-400); outline-offset: 2px; }
    .row--coins { padding: var(--tt-space-2) var(--tt-space-3); margin-block-end: var(--tt-space-2); border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-md); background: var(--tt-gold-tint); font-weight: 700; }
    .row--coins .coins { color: var(--tt-gold-400); font-size: var(--tt-text-lg); font-weight: 900; }
    .summary { position: sticky; inset-block-start: 88px; }
    .summary__main { display: flex; flex-direction: column; gap: var(--tt-space-3); padding: var(--tt-space-5); }
    .summary__stub { font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text-muted); }
    .summary h2 { font-size: var(--tt-text-lg); margin: 0; }
    .row { display: flex; justify-content: space-between; font-size: var(--tt-text-sm); }
    .row.total { font-size: var(--tt-text-lg); font-weight: 700; padding-block-start: var(--tt-space-2); border-block-start: 1px solid var(--tt-border); }
    .rewards { margin-block-start: var(--tt-space-1); }
    .coupon-box > summary { display: flex; align-items: center; gap: 6px; min-block-size: 40px; cursor: pointer; list-style: none; color: var(--tt-text-muted); font-size: var(--tt-text-sm); font-weight: 600; }
    .coupon-box > summary::-webkit-details-marker { display: none; }
    .coupon-box[open] > summary { color: var(--tt-text); }
    .coupon { margin-block-start: var(--tt-space-1); }
    .coupon .tt-btn { min-block-size: 44px; }
  `],
})
export class CartPage {
  readonly cart = inject(CartFacade);

  private readonly catalog = inject(CatalogFacade);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);
  private readonly preference = inject(PlatformPreferenceService);
  private readonly storefront = inject(StorefrontFacade);
  readonly growth = inject(GrowthFacade);

  readonly lookups$ = this.catalog.lookups$;

  /** A coin line shows the FUT coin; the catalog's own picture is a flat icon. */
  isCoins(item: CartItem): boolean {
    return /\/coins\.svg$/.test(item.imageUrl ?? '');
  }

  /**
   * The coin tiers, shown only when the cart is empty.
   *
   * Resolved from the catalog rather than pinned to a slug, so it disappears on
   * its own if the shop stops selling game currency.
   */
  readonly ladder$ = this.catalog.productsForGame(STOREFRONT.focusGameSlug).pipe(
    map((products) => products.find((product) => product.type === ProductType.GameCurrency)),
    switchMap((coins) => (coins
      ? this.catalog.productBySlug(coins.slug).pipe(catchError(() => of(null)))
      : of(null))),
  );

  /** The coin product, so a line can say what it delivers and offer its other platforms. */
  private readonly coins = toSignal(
    this.storefront.focusProductSlug$.pipe(
      switchMap((slug) => this.catalog.productBySlug(slug)),
      catchError(() => of(null as ProductDetail | null)),
    ),
    { initialValue: null as ProductDetail | null },
  );

  private readonly variants = computed(() => new Map<string, ProductVariant>(
    (this.coins()?.product.variants ?? []).map((variant) => [variant.id, variant]),
  ));

  /**
   * Coins across every coin line, launch bonus and applied reward included;
   * undefined when no line is coins. The server states each line's coins; a
   * line restored from storage before that existed falls back to the catalog.
   */
  readonly totalCoins = computed<string | undefined>(() => {
    const fromServer = this.cart.totalCoins();
    if (fromServer !== undefined) {
      return formatQuantity(fromServer);
    }
    let sum = 0;
    let any = false;
    for (const item of this.cart.items()) {
      const variant = this.variants().get(item.variantId);
      if (variant?.quantityValue) {
        any = true;
        sum += (variant.quantityValue + launchBonusOf(variant)) * item.quantity;
      }
    }
    return any ? formatQuantity(sum + (this.cart.benefits()?.rewardCoins ?? 0)) : undefined;
  });

  readonly countLabel = computed(() => itemsLabel(this.cart.items().length));

  couponCode = '';

  constructor() {
    this.analytics.pageView('/cart', 'Cart');
  }

  /** Base plus bonus equals received, for a coin line with a bonus. Per unit. */
  receipt(item: CartItem): { base: string; bonus: string; total: string } | undefined {
    if (item.coins !== undefined && item.bonusCoins !== undefined) {
      if (item.coins <= 0 || item.bonusCoins <= 0) {
        return undefined;
      }
      const base = item.coins / item.quantity;
      const bonus = item.bonusCoins / item.quantity;
      return { base: formatQuantity(base), bonus: formatQuantity(bonus), total: formatQuantity(base + bonus) };
    }
    const variant = this.variants().get(item.variantId);
    const bonus = launchBonusOf(variant);
    if (!variant?.quantityValue || bonus <= 0) {
      return undefined;
    }
    return { base: formatQuantity(variant.quantityValue), bonus: formatQuantity(bonus), total: formatQuantity(variant.quantityValue + bonus) };
  }

  /**
   * The platforms this line's bundle is also sold for, when there is more
   * than one. Only the coin product is known here; any other line shows its
   * platform as a fact.
   */
  platformOptions(item: CartItem, lookups: CatalogLookups): readonly Platform[] | null {
    const detail = this.coins();
    if (!detail || detail.product.id !== item.productId) {
      return null;
    }
    const ids = [...new Set(detail.offers
      .filter((offer) => offer.variantId === item.variantId && offer.regionId === item.regionId && offer.active)
      .map((offer) => offer.platformId))];
    const platforms = ids
      .map((id) => lookups.platforms.get(id))
      .filter((platform): platform is Platform => platform !== undefined)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return platforms.length > 1 ? platforms : null;
  }

  switchPlatform(item: CartItem, platform: Platform): void {
    const detail = this.coins();
    const offer = detail?.offers.find((candidate) => candidate.variantId === item.variantId
      && candidate.regionId === item.regionId && candidate.platformId === platform.id && candidate.active);
    if (!offer) {
      return;
    }
    this.preference.set(platform.id);
    this.cart.replaceOffer(item.id, offer.id).subscribe();
  }

  /** What the discount row is, in the customer's words. */
  discountLabel(): string {
    const applied = this.cart.benefits()?.applied ?? [];
    const reward = applied.find((benefit) => benefit.kind === 'REWARD' && benefit.effect.discount.amountMinor > 0);
    return reward ? `הטבה: ${reward.label.he}` : 'הנחה';
  }

  useReward(rewardId: string): void {
    this.cart.applyReward(rewardId).subscribe();
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
