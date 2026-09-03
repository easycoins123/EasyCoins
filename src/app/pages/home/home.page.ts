import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { combineLatest, concat, map, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { CoinPlan, coinProductsFrom } from '../../core/value';
import { LocalizePipe } from '../../core/i18n';
import { CoinProduct, LocalizedText, Offer, Platform } from '../../domain';
import { CartFacade, CatalogFacade } from '../../state';
// Imported by file rather than through the barrel: the barrel re-exports every
// component in the library, and a chunk that imports it carries the store's
// filters, search box and product cards to the first screen of the home page.
import { AmountSelectorComponent } from '../../ui/components/amount-selector.component';
import { CoinArtComponent } from '../../ui/components/cards/coin-art.component';
import { EasyCoinsCardComponent } from '../../ui/components/cards/easycoins-card.component';
import { HeroComponent } from '../../ui/components/hero.component';
import { IconComponent, IconName } from '../../ui/components/icon.component';
import { ProcessArtComponent } from '../../ui/components/process-art.component';
import { ReviewsSectionComponent } from '../../ui/components/reviews-section.component';
import { SkeletonGridComponent } from '../../ui/components/state.component';
import { StadiumComponent } from '../../ui/components/world/stadium.component';
import { LiveDirective } from '../../ui/live.directive';
import { RevealDirective } from '../../ui/reveal.directive';

interface TrustItem { readonly icon: IconName; readonly title: string; readonly note: string; readonly gold?: boolean; }
interface Reason { readonly icon: IconName; readonly title: string; readonly note: string; }

/**
 * The landing page, composed to the reference.
 *
 * Hero, a trust rail directly under it, the five packages, how it works in
 * three object cards, what verified customers say, why EasyCoins, and the
 * closing ticket. Every number comes from the catalog; every claim is
 * something the product does; the reviews are only ones an order backs.
 */
@Component({
  selector: 'tt-home-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe,
    HeroComponent, IconComponent, AmountSelectorComponent, EasyCoinsCardComponent, CoinArtComponent,
    ProcessArtComponent, ReviewsSectionComponent, SkeletonGridComponent, LiveDirective, RevealDirective, StadiumComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- The hero is not gated on the data: the first screen and its largest
         image paint as soon as the chunk runs, and the numbers fill in. -->
    <ng-container *ngIf="{ vm: vm$ | async } as state">
    <tt-hero [ladder]="state.vm?.ladder ?? null" [platforms]="state.vm?.platforms ?? []" [pending]="!state.vm"></tt-hero>

    <ng-container *ngIf="state.vm as vm; else loading">

      <!-- The trust rail: five things the shop keeps, in a strip under the hero. -->
      <div class="rail-band">
        <div class="tt-container">
          <ul class="rail" ttReveal>
            <li class="rail__item" *ngFor="let item of trust">
              <span class="rail__glyph" [class.rail__glyph--gold]="item.gold"><tt-icon [name]="item.icon" [size]="20"></tt-icon></span>
              <span class="rail__text"><strong>{{ item.title }}</strong><span>{{ item.note }}</span></span>
            </li>
          </ul>
        </div>
      </div>

      <!-- The packages: five bundles, the numbers' favourite featured. -->
      <section class="packages tt-section tt-section--tight" id="bundles">
        <div class="tt-container">
          <div class="chapter" ttReveal>
            <h2><span class="chapter__rule"></span>חבילות פופולריות<span class="chapter__rule"></span></h2>
            <p class="tt-muted">מחירים חיים מהקטלוג. הפלטפורמה ואזור החנות נבחרים לפני התשלום.</p>
          </div>

          <div class="shelf" *ngIf="vm.products.length > 0; else noShelf">
            <tt-easycoins-card *ngFor="let product of vm.products; let i = index; trackBy: trackByOffer"
                               [ttReveal]="i"
                               [product]="product"
                               [featured]="product.badge === 'best-value'"
                               [chip]="chipFor(product, vm.products)"
                               [flagship]="i === vm.products.length - 1 && vm.products.length % 2 === 1"
                               [busy]="adding()"
                               (buy)="buyOffer($event)">
            </tt-easycoins-card>
          </div>
          <ng-template #noShelf><tt-skeleton-grid [count]="5"></tt-skeleton-grid></ng-template>

          <p class="packages__more" ttReveal>
            <a class="ghost-link" routerLink="/store"><tt-icon name="chevron" [size]="15" dir="auto"></tt-icon> צפייה בכל החבילות</a>
          </p>

          <details class="custom tt-plate" *ngIf="vm.ladder as ladder" ttReveal>
            <summary>
              <tt-icon name="edit" [size]="16"></tt-icon>
              <span class="custom__title">צריכים כמות אחרת?</span>
              <span class="custom__hint">נרכיב אותה מהחבילות שיוצאות הכי משתלם</span>
              <tt-icon class="custom__sign" name="chevron" [size]="14"></tt-icon>
            </summary>
            <div class="custom__body">
              <tt-amount-selector [detail]="ladder" [busy]="adding()" (confirm)="addPlan($event)"></tt-amount-selector>
            </div>
          </details>
        </div>
      </section>

      <!-- How it works: three objects, one line. -->
      <section class="process" ttLive>
        <tt-stadium scene="band"></tt-stadium>
        <div class="tt-container">
          <div class="chapter" ttReveal>
            <h2><span class="chapter__rule"></span>איך זה עובד?<span class="chapter__rule"></span></h2>
          </div>
          <ol class="steps">
            <li class="step tt-plate" ttReveal="1">
              <span class="step__num">01</span>
              <div class="step__art step__art--coins"><tt-coin-art variant="bundle" artKey="fut-stadium" tier="elite"></tt-coin-art></div>
              <h3>בחרו חבילה</h3>
              <p>בחרו את כמות הקוינס והפלטפורמה שלכם. המחיר מוצג מראש.</p>
            </li>
            <li class="step__link" aria-hidden="true"><span class="tt-travel"></span></li>
            <li class="step tt-plate" ttReveal="2">
              <span class="step__num">02</span>
              <div class="step__art"><tt-process-art step="secure"></tt-process-art></div>
              <h3>בצעו תשלום מאובטח</h3>
              <p>התשלום עובר לספק הסליקה. פרטי האשראי לא נשמרים אצלנו.</p>
            </li>
            <li class="step__link" aria-hidden="true"><span class="tt-travel"></span></li>
            <li class="step tt-plate" ttReveal="3">
              <span class="step__num">03</span>
              <div class="step__art step__art--coins"><tt-coin-art variant="bundle" [amount]="1000000" tier="elite"></tt-coin-art></div>
              <h3>קבלו את הקוינס</h3>
              <p>עוקבים אחרי הסטטוס בדף ההזמנה, מהתשלום ועד האספקה.</p>
              <p class="step__data" *ngIf="vm.delivery as delivery"><tt-icon name="delivery" [size]="14"></tt-icon> {{ delivery | t }}</p>
            </li>
          </ol>
        </div>
      </section>

      <!-- What verified customers say. -->
      <section class="voices tt-section tt-section--tight">
        <div class="tt-container">
          <div class="chapter" ttReveal>
            <h2><span class="chapter__rule"></span>מה אומרים עלינו?<span class="chapter__rule"></span></h2>
          </div>
          <tt-reviews-section ttReveal="1"></tt-reviews-section>
        </div>
      </section>

      <!-- Why EasyCoins. -->
      <section class="why tt-hexfield">
        <span class="why__energy" aria-hidden="true"></span>
        <svg class="why__ball" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
          <g fill="none" stroke="#D4B46A" stroke-width="1.6" stroke-linejoin="round">
            <circle cx="100" cy="100" r="86"/>
            <path d="M100 58 L136 84 L122 128 L78 128 L64 84 Z"/>
            <path d="M100 58 L100 22 M136 84 L172 70 M122 128 L146 162 M78 128 L54 162 M64 84 L28 70"/>
            <path d="M100 22 L66 14 M100 22 L134 14 M172 70 L186 104 M146 162 L136 186 M54 162 L64 186 M28 70 L14 104"/>
          </g>
        </svg>
        <div class="tt-container">
          <div class="chapter" ttReveal>
            <h2>למה שחקני <span class="why__fc" dir="ltr">FC</span> בוחרים ב־<span class="why__brand" dir="ltr">EasyCoins</span>?</h2>
          </div>
          <ul class="reasons">
            <li class="reason" *ngFor="let reason of reasons; let i = index" [ttReveal]="i + 1">
              <span class="reason__glyph"><tt-icon [name]="reason.icon" [size]="24"></tt-icon></span>
              <strong>{{ reason.title }}</strong>
              <span>{{ reason.note }}</span>
            </li>
          </ul>
        </div>
      </section>
    </ng-container>

    <ng-template #loading>
      <section class="tt-container tt-section"><tt-skeleton-grid [count]="5"></tt-skeleton-grid></section>
    </ng-template>
    </ng-container>

    <section class="close">
      <tt-stadium scene="close"></tt-stadium>
      <div class="tt-container close__inner" ttReveal>
        <div class="close__copy">
          <p class="tt-eyebrow">ערב משחק מתחיל כאן</p>
          <h2>מוכנים? בוחרים כמות, רואים מחיר, מסיימים.</h2>
          <div class="close__cta">
            <a class="tt-btn tt-btn--buy tt-btn--lg" routerLink="/store"><tt-icon name="cart" [size]="18"></tt-icon> לקניית קוינס</a>
            <a class="tt-btn tt-btn--ghost tt-btn--lg" routerLink="/faq">שאלות נפוצות</a>
          </div>
          <p class="close__fine"><tt-icon name="lock" [size]="13"></tt-icon> תשלום מאובטח · מחיר סופי · דף מעקב לכל הזמנה</p>
        </div>
        <div class="close__art" aria-hidden="true"><tt-coin-art variant="bundle" artKey="fut-podium" tier="legend"></tt-coin-art></div>
      </div>
    </section>
  `,
  styles: [`
    h2 { margin: 0; }
    .chapter { display: flex; flex-direction: column; align-items: center; gap: var(--tt-space-2); margin-block-end: var(--tt-space-6); text-align: center; }
    .chapter h2 { display: inline-flex; align-items: center; gap: var(--tt-space-3); }
    .chapter__rule { display: inline-block; inline-size: 36px; block-size: 2px; background: linear-gradient(90deg, transparent, var(--tt-gold-500)); }
    .chapter__rule:last-child { background: linear-gradient(90deg, var(--tt-gold-500), transparent); }
    .chapter p { margin: 0; font-size: var(--tt-text-sm); }
    .ghost-link { display: inline-flex; align-items: center; gap: 4px; color: var(--tt-gold-400); font-size: var(--tt-text-sm); font-weight: 700; text-decoration: underline; text-underline-offset: 4px; text-decoration-color: rgba(212, 180, 106, 0.4); }
    .ghost-link:hover { color: var(--tt-gold-300); }

    /* --- Trust rail ---------------------------------------------------------- */
    .rail-band { position: relative; margin-block-start: calc(var(--tt-space-6) * -1); padding-block: 0 var(--tt-space-2); z-index: 1; }
    .rail { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0; margin: 0; padding: var(--tt-space-3) var(--tt-space-2); list-style: none;
      background: linear-gradient(180deg, #17161A, #121110); border: 1px solid var(--tt-border-strong); border-radius: var(--tt-radius-lg); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5); }
    .rail__item { display: flex; align-items: center; gap: var(--tt-space-3); padding: var(--tt-space-2) var(--tt-space-3); border-inline-end: 1px solid var(--tt-border); }
    .rail__item:last-child { border-inline-end: 0; }
    .rail__glyph { display: grid; place-items: center; flex: none; inline-size: 48px; block-size: 48px; border-radius: var(--tt-radius-md); background: var(--tt-surface-3); border: 1px solid var(--tt-border-strong); color: var(--tt-gold-400); transform: skewX(-9deg); }
    .rail__glyph tt-icon { transform: skewX(9deg); }
    .rail__glyph--gold { background: var(--tt-gold-metal); color: var(--tt-text-on-gold); border-color: transparent; }
    .rail__text { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
    .rail__text strong { font-size: var(--tt-text-md); font-weight: 800; }
    .rail__text span { font-size: var(--tt-label); color: var(--tt-text-muted); line-height: var(--tt-leading-snug); }

    /* --- Packages ------------------------------------------------------------ */
    .packages { background: radial-gradient(60% 40% at 50% 0%, rgba(212, 180, 106, 0.06), transparent 70%), var(--tt-bg); }
    .shelf { display: grid; gap: var(--tt-space-4); grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: stretch; }
    .packages__more { margin: var(--tt-space-5) 0 0; text-align: center; }
    .custom { margin-block-start: var(--tt-space-5); border-radius: var(--tt-radius-lg); }
    .custom > summary { display: flex; align-items: center; gap: var(--tt-space-2); min-block-size: 56px; padding-inline: var(--tt-space-4); cursor: pointer; list-style: none; color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .custom > summary::-webkit-details-marker { display: none; }
    .custom__title { font-weight: 800; color: var(--tt-text); }
    .custom__hint { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--tt-caption); }
    .custom__sign { flex: none; transform: rotate(90deg); transition: transform var(--tt-duration) var(--tt-ease); }
    .custom[open] .custom__sign { transform: rotate(-90deg); }
    .custom__body { padding: var(--tt-space-2) var(--tt-space-4) var(--tt-space-5); border-block-start: 1px solid var(--tt-border); }

    /* --- Process ------------------------------------------------------------- */
    .process { position: relative; isolation: isolate; overflow: hidden; padding-block: calc(var(--tt-section-y) * 0.8); border-block: 1px solid var(--tt-border); }
    .steps { display: grid; grid-template-columns: minmax(0, 1fr) 48px minmax(0, 1fr) 48px minmax(0, 1fr); align-items: stretch; margin: 0; padding: 0; list-style: none; }
    .step { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--tt-space-1); padding: var(--tt-space-4) var(--tt-space-4) var(--tt-space-4); border-radius: var(--tt-radius-lg); text-align: center; }
    .step__num { position: absolute; inset-block-start: var(--tt-space-3); inset-inline-start: var(--tt-space-4); font-family: var(--tt-font-display); font-weight: 900; font-size: var(--tt-text-xl); color: var(--tt-gold-400); letter-spacing: -0.02em; }
    .step__art { inline-size: min(60%, 190px); }
    .step__art--coins { inline-size: min(58%, 180px); }
    .step h3 { margin: var(--tt-space-2) 0 0; font-family: var(--tt-font-display); font-weight: 900; font-size: var(--tt-text-xl); letter-spacing: -0.01em; }
    .step p { margin: 0; max-inline-size: 30ch; color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading-snug); }
    .step__data { display: inline-flex !important; align-items: center; gap: 6px; padding: 0.3rem 0.7rem; border: 1px solid var(--tt-border-strong); border-radius: var(--tt-radius-pill); color: var(--tt-text) !important; font-weight: 700; }
    .step__data tt-icon { color: var(--tt-energy); }
    /* the connector: the shared travelling line (.tt-travel), live while the section is on screen */
    .step__link { display: flex; align-items: center; justify-content: center; }

    /* --- Reviews ------------------------------------------------------------- */
    .voices { background: var(--tt-bg-elevated); border-block-end: 1px solid var(--tt-border); }
    /* No verified reviews yet: no section, rather than a page of apology. */
    .voices:has(tt-reviews-section.empty) { display: none; }

    /* --- Why ----------------------------------------------------------------- */
    .why { position: relative; overflow: hidden; padding-block: calc(var(--tt-section-y) * 0.85); }
    .why__energy { position: absolute; inset-inline-start: -10%; inset-block-end: -30%; inline-size: 50%; block-size: 90%; border-radius: 50%; background: radial-gradient(ellipse at 40% 60%, var(--tt-energy-soft), transparent 70%); filter: blur(40px); pointer-events: none; }
    .why__ball { position: absolute; inset-inline-end: -60px; inset-block-end: -70px; inline-size: 260px; opacity: 0.16; pointer-events: none; }
    .why__fc { color: var(--tt-energy); }
    .why__brand { color: var(--tt-gold-400); }
    .reasons { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--tt-space-4); margin: 0; padding: 0; list-style: none; }
    .reason { display: flex; flex-direction: column; align-items: center; gap: var(--tt-space-2); text-align: center; }
    .reason__glyph { display: grid; place-items: center; inline-size: 64px; block-size: 64px; border-radius: 50%; border: 1px solid var(--tt-gold-600); background: radial-gradient(circle at 40% 30%, #221E17, #0F0D0A); color: var(--tt-gold-400); box-shadow: 0 0 0 4px rgba(212, 180, 106, 0.06); }
    .reason strong { font-size: var(--tt-text-md); }
    .reason span:last-child { font-size: var(--tt-caption); color: var(--tt-text-muted); line-height: var(--tt-leading-snug); max-inline-size: 22ch; }

    /* --- Close --------------------------------------------------------------- */
    .close { position: relative; isolation: isolate; overflow: hidden; padding-block: calc(var(--tt-section-y) * 0.8); border-block-start: 1px solid var(--tt-border); }
    .close__inner { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); align-items: center; gap: var(--tt-space-6); }
    .close__copy { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tt-space-3); }
    .close__copy h2 { max-inline-size: 18ch; }
    .close__cta { display: flex; flex-wrap: wrap; gap: var(--tt-space-3); }
    .close__fine { display: inline-flex; align-items: center; gap: 6px; margin: 0; color: var(--tt-text-faint); font-size: var(--tt-caption); }
    .close__art { inline-size: min(100%, 420px); justify-self: center; filter: drop-shadow(0 30px 40px rgba(0, 0, 0, 0.6)); }

    @media (max-width: 1100px) {
      .rail { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--tt-space-2); }
      .rail__item { border-inline-end: 0; }
      .shelf { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .reasons { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--tt-space-5) var(--tt-space-4); }
    }
    @media (max-width: 860px) {
      .steps { grid-template-columns: 1fr; gap: 0; }
      .step__link { block-size: 40px; }
      .step__link .tt-travel { inline-size: 2px; block-size: 100%; }
      .step__link .tt-travel::before { inset-inline: 0; inset-block-start: 0; inline-size: auto; block-size: calc(100% + 24px); background: repeating-linear-gradient(180deg, var(--tt-gold-500) 0 6px, transparent 6px 12px); animation-name: tt-travel-y; }
      @keyframes tt-travel-y { to { transform: translateY(-12px); } }
      .close__inner { grid-template-columns: 1fr; }
      .close__art { inline-size: min(100%, 320px); }
    }
    @media (max-width: 700px) {
      .rail-band { margin-block-start: 0; padding-block-start: var(--tt-space-4); }
      .rail { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: var(--tt-space-2); }
      .rail__item { padding: var(--tt-space-2); }
      .rail__glyph { inline-size: 36px; block-size: 36px; }
      .shelf { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--tt-space-3); }
      .reasons { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      /* An odd last item spans the row instead of sitting alone. */
      .rail__item:last-child:nth-child(odd), .shelf > :last-child:nth-child(odd), .reasons > :last-child:nth-child(odd) { grid-column: 1 / -1; }
    }
    @media (max-width: 340px) {
      .shelf { grid-template-columns: 1fr; }
      .rail { grid-template-columns: 1fr; }
    }
  `],
})
export class HomePage {
  private readonly catalog = inject(CatalogFacade);
  private readonly cart = inject(CartFacade);
  private readonly analytics = inject(AnalyticsService);

  readonly gameName = STOREFRONT.focusGameName;

  /** Only what the shop actually keeps. Five, so the rail reads at a glance. */
  readonly trust: readonly TrustItem[] = [
    { icon: 'tag', title: 'מחירים חיים', note: 'מהקטלוג, לפני התשלום', gold: true },
    { icon: 'shield', title: 'תשלום מאובטח', note: 'דרך ספק סליקה' },
    { icon: 'headset', title: 'תמיכה בעברית', note: 'כותבים לנו ומקבלים תשובה במייל' },
    { icon: 'truck', title: 'מעקב הזמנה', note: 'דף סטטוס לכל הזמנה' },
    { icon: 'gamepad', title: 'PS5 · PS4 · Xbox · PC', note: 'בוחרים פלטפורמה לפני התשלום' },
  ];

  /** Football-native, and true. */
  readonly reasons: readonly Reason[] = [
    { icon: 'tag', title: 'מחיר FC ברור', note: 'המחיר לכל חבילה ולכל מיליון, לפני שמשלמים' },
    { icon: 'package', title: 'בחירת חבילה פשוטה', note: 'חמש חבילות, או כמות מדויקת שנרכיב מהן' },
    { icon: 'gamepad', title: 'תמיכה בפלטפורמות', note: 'PS5, PS4, Xbox ו־PC, נבחרים לפני התשלום' },
    { icon: 'market', title: 'סטטוס הזמנה', note: 'דף מעקב אישי מהתשלום ועד האספקה' },
    { icon: 'headset', title: 'תמיכה אנושית בעברית', note: 'שאלה על הזמנה או מוצר, אנחנו עונים במייל' },
  ];

  readonly vm$ = combineLatest([
    this.catalog.lookups$,
    this.catalog.productBySlug(STOREFRONT.focusProductSlug).pipe(catchError(() => of(null))),
  ]).pipe(
    map(([lookups, ladder]) => {
      const platforms: readonly Platform[] = ladder
        ? ladder.product.platformIds
          .map((id) => lookups.platforms.get(id))
          .filter((platform): platform is Platform => platform !== undefined)
        : [];
      const products: readonly CoinProduct[] = ladder
        ? coinProductsFrom(ladder, lookups.platforms, { game: STOREFRONT.focusGameEdition })
        : [];
      const method = ladder?.offers[0]?.fulfillmentMethod;
      const delivery: LocalizedText | undefined = method ? lookups.fulfillment.get(method)?.description : undefined;
      return { lookups, ladder, platforms, products, delivery };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly adding = signal(false);

  trackByOffer(_index: number, product: CoinProduct): string {
    return product.id;
  }

  chipFor(product: CoinProduct, shelf: readonly CoinProduct[]): string | undefined {
    if (product.badge === 'best-value') {
      return 'הכי משתלם';
    }
    const amounts = shelf.map((entry) => entry.amount);
    if (product.amount === Math.min(...amounts)) {
      return 'הכי זול';
    }
    if (product.amount === Math.max(...amounts)) {
      return 'הכי גדולה';
    }
    return undefined;
  }

  buyOffer(offer: Offer): void {
    if (this.adding()) {
      return;
    }
    this.adding.set(true);
    this.cart.add({ offerId: offer.id, quantity: 1 }).subscribe({
      complete: () => this.adding.set(false),
      error: () => this.adding.set(false),
    });
  }

  addPlan(plan: CoinPlan): void {
    if (this.adding()) {
      return;
    }
    this.adding.set(true);
    concat(...plan.lines.map((line) => this.cart.add({ offerId: line.offer.id, quantity: line.count }))).subscribe({
      complete: () => this.adding.set(false),
      error: () => this.adding.set(false),
    });
  }

  constructor() {
    this.analytics.pageView('/', 'Home');
  }
}
