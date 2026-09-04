import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { combineLatest, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { CampaignView } from '../../core/commerce';
import { LocalizePipe } from '../../core/i18n';
import { coinProductsFrom, hasRealDiscount } from '../../core/value';
import { CoinProduct, Product } from '../../domain';
import { CampaignsFacade, CatalogFacade, CatalogLookups } from '../../state';
import { CoinLadderComponent } from '../../ui/components/commerce/coin-ladder.component';
import { LaunchStripComponent } from '../../ui/components/commerce/launch-strip.component';
import { IconComponent } from '../../ui/components/icon.component';
import { ProductCardComponent } from '../../ui/components/product-card.component';
import { CartFacade } from '../../state/cart.facade';
import { Offer } from '../../domain';

interface OffersView {
  readonly live: readonly CampaignView[];
  readonly coming: readonly CampaignView[];
  readonly products: readonly CoinProduct[];
  readonly discounted: readonly Product[];
  readonly lookups: CatalogLookups;
}

/**
 * The offers hub: everything that gives a player a reason to buy now or come
 * back, each with its real state.
 *
 * Live campaigns lead, with their numbers. Campaigns in preparation are listed
 * as exactly that, so a returning visitor can see what is coming without
 * being sold something that does not exist yet. The ladder sits here too,
 * because the bonus only means something next to the prices.
 */
@Component({
  selector: 'tt-deals-page',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, IconComponent, LaunchStripComponent, CoinLadderComponent, ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="offers">
      <div class="tt-container tt-section tt-section--tight">
        <header class="tt-head tt-head--tight">
          <span class="tt-eyebrow">EASYCOINS · {{ gameName }}</span>
          <h1>מבצעים ובונוסים</h1>
          <p class="tt-head__lede">מה שפעיל מסומן פעיל, עם המספרים. מה שבהכנה כתוב שהוא בהכנה. בלי שעונים מזויפים ובלי "נותרו 3".</p>
        </header>
      </div>

      <ng-container *ngIf="vm$ | async as vm; else loading">
        <tt-launch-strip [products]="vm.products"></tt-launch-strip>

        <section class="tt-container tt-section tt-section--tight" *ngIf="vm.live.length > 0">
          <h2 class="section-title"><span class="live-dot" aria-hidden="true"></span>פעיל עכשיו</h2>
          <div class="live">
            <article class="campaign campaign--live" *ngFor="let campaign of vm.live">
              <header class="campaign__head">
                <span class="campaign__glyph" aria-hidden="true"><tt-icon [name]="campaign.icon" [size]="22"></tt-icon></span>
                <span class="campaign__eyebrow">{{ campaign.eyebrow }}</span>
                <span class="status status--live">{{ campaign.statusLabel }}</span>
              </header>
              <h3>{{ campaign.title }}</h3>
              <p>{{ campaign.lede }}</p>
              <ul class="points">
                <li *ngFor="let point of campaign.points"><tt-icon name="check" [size]="12"></tt-icon> {{ point }}</li>
              </ul>
              <a class="tt-btn tt-btn--buy" *ngIf="campaign.cta as cta" [routerLink]="cta.link">{{ cta.label }}</a>
            </article>
          </div>
        </section>

        <section class="tt-container tt-section tt-section--tight" *ngIf="vm.products.length > 0">
          <h2 class="section-title">הסולם המלא, עם הבונוס</h2>
          <tt-coin-ladder [products]="vm.products" [busy]="adding()" (buy)="buyOffer($event)"></tt-coin-ladder>
        </section>

        <section class="tt-container tt-section tt-section--tight" *ngIf="vm.coming.length > 0">
          <h2 class="section-title">בהכנה</h2>
          <ul class="coming">
            <li class="coming__item" *ngFor="let campaign of vm.coming">
              <span class="campaign__glyph campaign__glyph--sm" aria-hidden="true"><tt-icon [name]="campaign.icon" [size]="18"></tt-icon></span>
              <span class="coming__text">
                <span class="coming__title"><strong>{{ campaign.title }}</strong><span class="status status--soon">{{ campaign.statusLabel }}</span></span>
                <span class="coming__lede">{{ campaign.lede }}</span>
              </span>
              <a class="coming__go" *ngIf="campaign.cta as cta" [routerLink]="cta.link" [attr.aria-label]="cta.label"><tt-icon name="chevron" [size]="16" dir="auto"></tt-icon></a>
            </li>
          </ul>
        </section>

        <section class="tt-container tt-section tt-section--tight" *ngIf="vm.discounted.length > 0">
          <h2 class="section-title">מוצרים במחיר מיוחד</h2>
          <div class="tt-grid">
            <tt-product-card *ngFor="let product of vm.discounted" [product]="product" [lookups]="vm.lookups"></tt-product-card>
          </div>
        </section>
      </ng-container>

      <ng-template #loading>
        <div class="tt-container tt-section"><span class="tt-skeleton sk"></span></div>
      </ng-template>
    </div>
  `,
  styles: [`
    .section-title { display: flex; align-items: center; gap: var(--tt-space-2); margin: 0 0 var(--tt-space-4); font-size: var(--tt-text-xl); }
    .live-dot { inline-size: 8px; block-size: 8px; border-radius: 50%; background: var(--tt-energy); box-shadow: 0 0 0 4px rgba(47, 211, 111, 0.15); }
    .live { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--tt-space-4); }
    .campaign { display: flex; flex-direction: column; gap: var(--tt-space-2); padding: var(--tt-space-5); border-radius: var(--tt-radius-lg); border: 1px solid var(--tt-gold-600); background: linear-gradient(135deg, rgba(212, 180, 106, 0.14), transparent 55%), linear-gradient(180deg, #17161A, var(--tt-surface) 70%); }
    .campaign__head { display: flex; align-items: center; gap: var(--tt-space-2); }
    .campaign__glyph { display: grid; place-items: center; inline-size: 44px; block-size: 44px; border-radius: var(--tt-radius-md); background: var(--tt-gold-metal); color: var(--tt-text-on-gold); transform: skewX(-9deg); }
    .campaign__glyph tt-icon { transform: skewX(9deg); }
    .campaign__glyph--sm { inline-size: 36px; block-size: 36px; background: var(--tt-surface-2); color: var(--tt-gold-400); border: 1px solid var(--tt-gold-600); }
    .campaign__eyebrow { font-size: var(--tt-caption); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--tt-text-muted); }
    .status { margin-inline-start: auto; padding: 3px 9px; border-radius: var(--tt-radius-pill); font-size: 10px; font-weight: 800; letter-spacing: 0.04em; border: 1px solid var(--tt-border-strong); }
    .status--live { color: var(--tt-energy); border-color: rgba(47, 211, 111, 0.4); }
    .status--soon { color: var(--tt-gold-400); border-color: var(--tt-gold-600); margin-inline-start: var(--tt-space-2); }
    .campaign h3 { margin: var(--tt-space-1) 0 0; font-size: var(--tt-text-2xl); line-height: 1.15; }
    .campaign p { margin: 0; color: var(--tt-text-muted); line-height: var(--tt-leading); }
    .points { margin: var(--tt-space-1) 0 var(--tt-space-2); padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: var(--tt-text-sm); font-weight: 700; }
    .points li { display: flex; align-items: center; gap: 6px; }
    .points tt-icon { color: var(--tt-energy); }
    .campaign .tt-btn { align-self: flex-start; margin-block-start: auto; }
    .coming { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--tt-space-2); }
    .coming__item { display: flex; align-items: center; gap: var(--tt-space-3); padding: var(--tt-space-3) var(--tt-space-4); border: 1px solid var(--tt-border); border-radius: var(--tt-radius-lg); background: var(--tt-surface); }
    .coming__text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-inline-size: 0; }
    .coming__title { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
    .coming__lede { font-size: var(--tt-text-sm); color: var(--tt-text-muted); line-height: var(--tt-leading-snug); }
    .coming__go { display: grid; place-items: center; inline-size: 36px; block-size: 36px; border-radius: 50%; border: 1px solid var(--tt-border-strong); color: var(--tt-text-muted); flex: none; }
    .coming__go:hover { border-color: var(--tt-gold-600); color: var(--tt-gold-400); text-decoration: none; }
    .sk { display: block; block-size: 240px; border-radius: var(--tt-radius-lg); }
    @media (max-width: 600px) { .campaign { padding: var(--tt-space-4); } .campaign h3 { font-size: var(--tt-text-xl); } }
  `],
})
export class DealsPage {
  private readonly campaigns = inject(CampaignsFacade);
  private readonly catalog = inject(CatalogFacade);
  private readonly cart = inject(CartFacade);
  private readonly analytics = inject(AnalyticsService);

  readonly gameName = STOREFRONT.focusGameName;
  readonly adding = this.cart.busy;

  private readonly ladder$ = combineLatest([
    this.catalog.lookups$,
    this.catalog.productBySlug(STOREFRONT.focusProductSlug).pipe(catchError(() => of(null))),
  ]).pipe(
    map(([lookups, detail]) => (detail ? coinProductsFrom(detail, lookups.platforms, { game: STOREFRONT.focusGameEdition }) : [])),
  );

  /** Products with a real struck-through price, for the game this storefront sells. */
  private readonly discounted$ = this.catalog.gameBySlug(STOREFRONT.focusGameSlug).pipe(
    switchMap((game) => this.catalog.search({ gameIds: [game.id], page: { page: 1, pageSize: 24 } })),
    map((page) => page.items.filter((product) => product.fromPrice !== undefined && hasRealDiscount(product.fromPrice) && product.slug !== STOREFRONT.focusProductSlug)),
    catchError(() => of([] as readonly Product[])),
  );

  readonly vm$ = combineLatest([this.campaigns.campaigns$, this.ladder$, this.discounted$, this.catalog.lookups$]).pipe(
    map(([campaigns, products, discounted, lookups]): OffersView => ({
      live: campaigns.filter((campaign) => campaign.status === 'active'),
      coming: campaigns.filter((campaign) => campaign.status !== 'active' && campaign.status !== 'ended'),
      products,
      discounted,
      lookups,
    })),
  );

  constructor() {
    this.analytics.pageView('/deals', 'Deals');
  }

  buyOffer(offer: Offer): void {
    this.cart.add({ offerId: offer.id, quantity: 1 }).subscribe();
  }
}
