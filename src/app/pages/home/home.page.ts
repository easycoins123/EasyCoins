import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { combineLatest, concat, map, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { CoinPlan } from '../../core/value';
import { LocalizePipe } from '../../core/i18n';
import { LocalizedText, Platform } from '../../domain';
import { SupportApiService } from '../../data/api';
import { CartFacade, CatalogFacade } from '../../state';
import {
  AmountSelectorComponent, CoinArtComponent, FaqAccordionComponent, HeroComponent, IconComponent,
  ParallaxDirective, ProductCardComponent, RevealDirective, SkeletonGridComponent, SquadComponent,
  StadiumComponent, ValueStripComponent,
} from '../../ui';

/**
 * The landing page: match night.
 *
 * The page is a story told in a stadium after dark. The hero is the trophy
 * under the lights; the picker is where the customer chooses; the journey is
 * the customer's own evening acted out by the squad (walk out, kick off, full
 * time); the "why here" section makes the case with nothing but what the
 * product actually does; the shelf and the questions close it.
 *
 * Everything with a number in it is real. The picker prices from server
 * offers; the platforms are the product's own; the delivery line comes from
 * the fulfillment descriptor or is not shown; there is no customer count,
 * rating or statistic because none exists as data.
 */
@Component({
  selector: 'tt-home-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe,
    HeroComponent, IconComponent, AmountSelectorComponent, ValueStripComponent, CoinArtComponent,
    ProductCardComponent, FaqAccordionComponent, SkeletonGridComponent, RevealDirective,
    StadiumComponent, SquadComponent, ParallaxDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="vm$ | async as vm; else loading">
      <tt-hero [ladder]="vm.ladder" [platforms]="vm.platforms"></tt-hero>

      <!-- The scoreboard: four things this shop keeps, in a strip under the lights. -->
      <div class="promises">
        <div class="tt-container" ttReveal>
          <h2 class="tt-visually-hidden">למה EASYCOINS</h2>
          <tt-value-strip></tt-value-strip>
        </div>
      </div>

      <div class="buy" id="bundles">
        <div class="tt-container">
          <section class="buy__pick" *ngIf="vm.ladder as ladder" ttReveal>
            <tt-amount-selector [detail]="ladder" heading="כמה קוינס אתם צריכים?" [busy]="adding()" (confirm)="addPlan($event)"></tt-amount-selector>
          </section>
        </div>
      </div>

      <!-- The journey: the customer's evening, in three acts, on the pitch. -->
      <section class="journey">
        <tt-stadium scene="band"></tt-stadium>
        <div class="tt-container">
          <div class="tt-head" ttReveal>
            <span class="tt-eyebrow">דוח משחק</span>
            <h2>ערב המשחק שלכם, בשלושה רגעים</h2>
            <p class="tt-head__lede">מה שרואים לפני התשלום זה מה שמשלמים. אין שלב נסתר.</p>
          </div>

          <ol class="acts">
            <li class="act" ttReveal="1">
              <div class="act__stage">
                <span class="act__light"></span>
                <tt-squad class="act__figure" pose="walk" [ttParallax]="0.08"></tt-squad>
              </div>
              <div class="act__copy">
                <span class="act__num">01</span>
                <span class="act__kicker">יציאה מהמנהרה</span>
                <h3>בוחרים חבילה</h3>
                <p>חמש חבילות במחיר סופי. המחיר, הפלטפורמה ואזור החנות מופיעים לפני התשלום, לא אחריו.</p>
                <a class="ghost-link" href="#bundles">לבחירת כמות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon></a>
              </div>
            </li>
            <li class="act act--flip" ttReveal="2">
              <div class="act__stage">
                <span class="act__light"></span>
                <tt-squad class="act__figure" pose="keeper" [ttParallax]="0.1"></tt-squad>
              </div>
              <div class="act__copy">
                <span class="act__num">02</span>
                <span class="act__kicker">שריקת פתיחה</span>
                <h3>משלמים בתשלום מאובטח</h3>
                <p>פרטי האשראי עוברים לספק הסליקה ולא נשמרים אצלנו. לעולם לא נבקש סיסמה, קוד אימות או קודי גיבוי של חשבון המשחק.</p>
                <a class="ghost-link" routerLink="/privacy">מה נשמר ומה לא <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon></a>
              </div>
            </li>
            <li class="act" ttReveal="3">
              <div class="act__stage">
                <span class="act__light"></span>
                <tt-squad class="act__figure" pose="celebrate" [ttParallax]="0.08"></tt-squad>
              </div>
              <div class="act__copy">
                <span class="act__num">03</span>
                <span class="act__kicker">שריקת סיום</span>
                <h3>מקבלים, עם דף מעקב</h3>
                <p>לכל הזמנה יש דף מעקב אישי עם הסטטוס, מהתשלום ועד האספקה.</p>
                <p class="act__data" *ngIf="vm.delivery as delivery">
                  <tt-icon name="delivery" [size]="15"></tt-icon> {{ delivery | t }}
                </p>
                <a class="ghost-link" routerLink="/delivery">איך האספקה עובדת <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon></a>
              </div>
            </li>
          </ol>

          <div class="compat" *ngIf="vm.platforms.length > 0" ttReveal="4">
            <span class="compat__label"><tt-icon name="platform" [size]="16"></tt-icon> עובד על</span>
            <span class="compat__chip" *ngFor="let platform of vm.platforms">{{ platform.name | t }}</span>
          </div>
        </div>
      </section>

      <!-- Why pay here: only claims the product keeps, each with a way to check it. -->
      <section class="why tt-section">
        <div class="tt-container">
          <div class="tt-head" ttReveal>
            <span class="tt-eyebrow">למה כאן</span>
            <h2>המקום הנכון לשלם בו</h2>
            <p class="tt-head__lede">בלי הבטחות ריקות. רק מה שהאתר באמת עושה, ואפשר לבדוק כל שורה.</p>
          </div>
          <ul class="reasons">
            <li class="reason tt-plate" *ngFor="let reason of reasons; let i = index" [ttReveal]="i + 1">
              <span class="reason__glyph" [class.reason__glyph--gold]="reason.gold"><tt-icon [name]="reason.icon" [size]="20"></tt-icon></span>
              <h3>{{ reason.title }}</h3>
              <p>{{ reason.text }}</p>
              <a class="ghost-link" *ngIf="reason.link" [routerLink]="reason.link">{{ reason.linkLabel }} <tt-icon name="chevron" [size]="14" dir="auto"></tt-icon></a>
            </li>
          </ul>
        </div>
      </section>

      <section class="shelf-band" *ngIf="vm.products.length > 0">
        <div class="tt-container">
          <header class="band" ttReveal>
            <h2>עוד ל{{ gameName }}</h2>
            <a class="ghost-link" routerLink="/store">לחנות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon></a>
          </header>
          <div class="shelf-row">
            <div class="shelf">
              <tt-product-card *ngFor="let product of vm.products; let i = index" [ttReveal]="i + 1" [product]="product" [lookups]="vm.lookups"></tt-product-card>
            </div>
            <aside class="shelf__aside" ttReveal="3">
              <p class="shelf__kicker">יותר מקוינס</p>
              <p class="shelf__line">נקודות FC ושירות SBC, באותו חשבון ובאותם כללים: מחיר סופי, בלי סיסמאות, עם דף מעקב.</p>
              <a class="ghost-link" routerLink="/delivery">איך האספקה עובדת <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon></a>
            </aside>
          </div>
        </div>
      </section>
    </ng-container>

    <ng-template #loading>
      <tt-hero></tt-hero>
      <section class="tt-container tt-section"><tt-skeleton-grid [count]="4"></tt-skeleton-grid></section>
    </ng-template>

    <section class="close">
      <tt-stadium scene="close"></tt-stadium>
      <div class="tt-container close__inner">
        <div class="close__ask" ttReveal>
          <h2>שאלות שחוזרות</h2>
          <tt-faq-accordion [entries]="(faq$ | async) ?? []"></tt-faq-accordion>
          <a class="ghost-link" routerLink="/faq">עוד שאלות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon></a>
        </div>
        <aside class="close__act tt-ticket tt-ticket--gold" ttReveal="2">
          <div class="tt-ticket__main">
            <p class="tt-ticket__eyebrow"><span>כרטיס · ערב משחק</span><span>{{ gameName }}</span></p>
            <div class="close__scene" aria-hidden="true">
              <tt-squad class="close__figure" pose="celebrate"></tt-squad>
              <tt-coin-art class="close__coin" tier="legend" variant="card"></tt-coin-art>
            </div>
            <p class="close__kicker">מוכנים?</p>
            <p class="close__line">בוחרים כמות, רואים מחיר, מסיימים.</p>
            <a class="tt-btn tt-btn--buy tt-btn--lg" routerLink="/store">לקניית קוינס <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon></a>
          </div>
          <div class="tt-ticket__stub">
            <span class="tt-ticket__tally"></span>
            <span class="close__fine"><tt-icon name="lock" [size]="13"></tt-icon> תשלום מאובטח · מחיר סופי</span>
          </div>
        </aside>
      </div>
    </section>
  `,
  styles: [`
    h2 { margin: 0; }

    .promises { padding-block: var(--tt-space-6); border-block-end: 1px solid var(--tt-border); background: var(--tt-bg-elevated); }

    .buy {
      position: relative;
      background:
        radial-gradient(70% 80% at 85% 0%, rgba(46, 95, 240, 0.07), transparent 60%),
        var(--tt-bg-elevated);
      border-block-end: 1px solid var(--tt-border);
      padding-block: var(--tt-section-y);
    }

    /* --- The journey ------------------------------------------------------- */
    .journey { position: relative; isolation: isolate; overflow: hidden; padding-block: var(--tt-section-y); border-block-end: 1px solid var(--tt-border); }
    .acts { display: flex; flex-direction: column; gap: var(--tt-space-7); margin: 0; padding: 0; list-style: none; }
    .act { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); align-items: center; gap: var(--tt-space-6); }
    .act--flip .act__stage { order: 2; }
    .act__stage { position: relative; display: grid; place-items: end center; min-block-size: 300px; }
    .act__light {
      position: absolute; inset-inline: 10%; inset-block-end: 6%; block-size: 40%;
      background: radial-gradient(50% 60% at 50% 100%, var(--tt-flood-soft), transparent 70%);
    }
    .act__light::after {
      content: ''; position: absolute; inset-inline: 18%; inset-block-end: 0; block-size: 18px;
      border-radius: 50%; border: 1px solid var(--tt-pitch); opacity: 0.9;
    }
    .act__figure { position: relative; inline-size: min(52%, 220px); }
    .act__copy { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tt-space-2); }
    .act__num { font-family: var(--tt-font-display); font-size: var(--tt-display-2); line-height: 0.9; color: var(--tt-gold-400); }
    .act__kicker { font-size: var(--tt-label); font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--tt-text-faint); }
    .act h3 { margin: 0; font-family: var(--tt-font-display); font-size: var(--tt-display-3); line-height: 1; letter-spacing: var(--tt-tracking-display); }
    .act p { margin: 0; max-inline-size: 44ch; color: var(--tt-text-muted); font-size: var(--tt-text-md); line-height: var(--tt-leading); }
    .act__data { display: inline-flex; align-items: center; gap: 6px; padding: 0.35rem 0.7rem; border: 1px solid var(--tt-border-strong); border-radius: var(--tt-radius-pill); color: var(--tt-text) !important; font-size: var(--tt-text-sm) !important; font-weight: 700; }
    .act__data tt-icon { color: var(--tt-accent-500); }
    .ghost-link { display: inline-flex; align-items: center; gap: 4px; color: var(--tt-text-muted); font-size: var(--tt-text-sm); font-weight: 600; white-space: nowrap; }
    .ghost-link:hover { color: var(--tt-brand-300); text-decoration: none; }
    .act .ghost-link { margin-block-start: var(--tt-space-2); }

    .compat { display: flex; align-items: center; flex-wrap: wrap; gap: var(--tt-space-2); margin-block-start: var(--tt-space-7); padding-block-start: var(--tt-space-4); border-block-start: 1px solid var(--tt-border); font-size: var(--tt-text-sm); }
    .compat__label { display: inline-flex; align-items: center; gap: 6px; color: var(--tt-text-muted); font-weight: 700; margin-inline-end: var(--tt-space-1); }
    .compat__chip { padding: 0.3rem 0.75rem; border: 1px solid var(--tt-border-strong); border-radius: var(--tt-radius-pill); background: var(--tt-surface); font-weight: 700; font-size: var(--tt-text-xs); }

    /* --- Why here ------------------------------------------------------------ */
    .why { border-block-end: 1px solid var(--tt-border); }
    .reasons { display: grid; gap: var(--tt-space-4); grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; padding: 0; list-style: none; }
    .reason { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tt-space-2); padding: var(--tt-space-5); border-radius: var(--tt-radius-lg); }
    .reason__glyph { display: grid; place-items: center; inline-size: 44px; block-size: 44px; margin-block-end: var(--tt-space-1); border-radius: var(--tt-radius-md); background: var(--tt-surface-2); border: 1px solid var(--tt-border-strong); color: var(--tt-brand-300); transform: skewX(-9deg); }
    .reason__glyph tt-icon { transform: skewX(9deg); }
    .reason__glyph--gold { color: var(--tt-gold-400); border-color: var(--tt-gold-600); }
    .reason h3 { margin: 0; font-size: var(--tt-title); }
    .reason p { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
    .reason .ghost-link { margin-block-start: auto; padding-block-start: var(--tt-space-2); }

    /* --- Shelf ------------------------------------------------------------- */
    .shelf-band { padding-block: var(--tt-section-y); background: var(--tt-bg-elevated); border-block-end: 1px solid var(--tt-border); }
    .shelf-row { display: grid; gap: var(--tt-space-6); align-items: center; }
    .shelf { display: grid; gap: var(--tt-space-3); grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .shelf__aside { display: none; }
    @media (min-width: 700px) { .shelf { gap: var(--tt-space-4); grid-template-columns: repeat(auto-fit, minmax(230px, 280px)); } }
    @media (min-width: 1000px) {
      .shelf-row { grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); }
      .shelf__aside { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tt-space-2); padding-inline-start: var(--tt-space-6); border-inline-start: 1px solid var(--tt-border); }
      .shelf__kicker { margin: 0; font-family: var(--tt-font-display); font-size: var(--tt-display-3); line-height: 1; }
      .shelf__line { margin: 0; max-inline-size: 34ch; color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
    }
    .band { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--tt-space-4); margin-block-end: var(--tt-space-5); flex-wrap: wrap; }

    /* --- Close ------------------------------------------------------------- */
    .close { position: relative; isolation: isolate; overflow: hidden; padding-block: var(--tt-section-y); }
    .close__inner { display: grid; gap: var(--tt-space-7); grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr); align-items: start; }
    .close__ask h2 { margin-block-end: var(--tt-space-4); }
    .close__ask .ghost-link { margin-block-start: var(--tt-space-4); }
    .close__act { --tt-ticket-stub: 56px; }
    .close__act .tt-ticket__main { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tt-space-2); padding: var(--tt-space-5); }
    .close__scene { position: relative; align-self: stretch; block-size: 150px; margin-block: calc(var(--tt-space-2) * -1) var(--tt-space-2); }
    .close__figure { position: absolute; inset-inline-start: 6%; inset-block-end: 0; inline-size: 26%; }
    .close__coin { position: absolute; inset-inline-end: 4%; inset-block-end: -4%; inline-size: 58%; }
    .close__kicker { margin: 0; font-family: var(--tt-font-display); font-size: var(--tt-display-2); line-height: 1; }
    .close__line { margin: 0 0 var(--tt-space-2); color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .close__fine { display: inline-flex; align-items: center; gap: 6px; color: var(--tt-text-faint); font-size: var(--tt-text-xs); }

    @media (max-width: 900px) {
      .reasons { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 860px) {
      .act, .act--flip { grid-template-columns: 1fr; gap: var(--tt-space-3); }
      .act--flip .act__stage { order: 0; }
      .act__stage { min-block-size: 200px; }
      .act__figure { inline-size: min(40%, 160px); }
      .acts { gap: var(--tt-space-6); }
      .close__inner { grid-template-columns: 1fr; gap: var(--tt-space-6); }
      .close__act { align-self: stretch; }
      .close__act .tt-btn { inline-size: 100%; }
    }
    @media (max-width: 560px) {
      .reasons { grid-template-columns: 1fr; }
      .reason { padding: var(--tt-space-4); }
    }
  `],
})
export class HomePage {
  private readonly catalog = inject(CatalogFacade);
  private readonly cart = inject(CartFacade);
  private readonly supportApi = inject(SupportApiService);
  private readonly analytics = inject(AnalyticsService);

  readonly gameName = STOREFRONT.focusGameName;
  readonly faq$ = this.supportApi.getFaq().pipe(map((entries) => entries.slice(0, 5)));

  /** Only what the product actually does. Each line can be checked on the linked page. */
  readonly reasons = [
    { icon: 'tag', gold: true, title: 'מחיר סופי לפני התשלום', text: 'מה שרואים בעגלה זה מה שמשלמים. אין תוספות בקופה ואין הפתעות אחריה.', link: '/store', linkLabel: 'לחנות' },
    { icon: 'platform', gold: false, title: 'הפלטפורמה ואזור החנות מוצגים קודם', text: 'נבחרים ומופיעים לפני התשלום, ומודפסים גם על הכרטיס של ההזמנה.', link: '/delivery', linkLabel: 'איך זה עובד' },
    { icon: 'delivery', gold: false, title: 'דף מעקב לכל הזמנה', text: 'קישור אישי עם הסטטוס, מהתשלום ועד האספקה, בלי לחפש במייל.', link: '/account/orders', linkLabel: 'ההזמנות שלי' },
    { icon: 'shield', gold: false, title: 'לעולם לא מבקשים סיסמה', text: 'לא סיסמה של חשבון המשחק, לא קוד אימות ולא קודי גיבוי. בשום שלב.', link: '/privacy', linkLabel: 'פרטיות' },
    { icon: 'support', gold: false, title: 'תמיכה בעברית', text: 'שאלה על הזמנה או על מוצר? כותבים לנו ומקבלים תשובה במייל.', link: '/support', linkLabel: 'תמיכה' },
    { icon: 'refresh', gold: true, title: 'מדיניות ביטול והחזרים כתובה', text: 'הכללים מפורסמים מראש. כדאי לקרוא אותם לפני שמשלמים, לא אחרי.', link: '/refund-policy', linkLabel: 'ביטול והחזרים' },
  ] as const;

  readonly vm$ = combineLatest([
    this.catalog.productsForGame(STOREFRONT.focusGameSlug),
    this.catalog.lookups$,
    this.catalog.productBySlug(STOREFRONT.focusProductSlug).pipe(catchError(() => of(null))),
  ]).pipe(
    map(([products, lookups, ladder]) => {
      const rest = products.filter((product) => product.id !== ladder?.product.id);
      const platforms: readonly Platform[] = ladder
        ? ladder.product.platformIds
          .map((id) => lookups.platforms.get(id))
          .filter((platform): platform is Platform => platform !== undefined)
        : [];
      const method = ladder?.offers[0]?.fulfillmentMethod;
      const delivery: LocalizedText | undefined = method ? lookups.fulfillment.get(method)?.description : undefined;
      return { products: rest, lookups, ladder, platforms, delivery };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly adding = signal(false);

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
