import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { combineLatest, concat, map, of } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { CoinPlan } from '../../core/value';
import { LocalizePipe } from '../../core/i18n';
import { Platform } from '../../domain';
import { SupportApiService } from '../../data/api';
import { CartFacade, CatalogFacade } from '../../state';
import {
  AmountSelectorComponent, CoinPackComponent, FaqAccordionComponent, HeroComponent, IconComponent,
  ProductCardComponent, RevealDirective, SkeletonGridComponent, ValueStripComponent,
} from '../../ui';

/**
 * The landing page.
 *
 * A flow rather than a stack of sections: the hero sells the product, the
 * picker sells a bundle, a short shelf shows what else there is, then how
 * buying works and where it works, and the questions that stop a purchase
 * beside the purchase itself. Each block has its own ground, its own light and
 * its own shape, and arrives as the customer reaches it.
 *
 * Everything with a number in it is real. The picker prices from server
 * offers; the compatibility row is the product's own platforms; there is no
 * customer count, rating or delivery statistic because none exists as data.
 */
@Component({
  selector: 'tt-home-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe,
    HeroComponent, IconComponent, AmountSelectorComponent, ValueStripComponent, CoinPackComponent,
    ProductCardComponent, FaqAccordionComponent, SkeletonGridComponent, RevealDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="vm$ | async as vm; else loading">
      <tt-hero [ladder]="vm.ladder" [platforms]="vm.platforms"></tt-hero>

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

          <section class="buy__shelf" *ngIf="vm.products.length > 0">
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
          </section>
        </div>
      </div>

      <section class="tt-section steps-band">
        <div class="tt-container">
          <div class="steps-head" ttReveal>
            <h2>שלושה צעדים, בלי הפתעות</h2>
            <p class="tt-muted">מה שרואים לפני התשלום זה מה שמשלמים. אין שלב נסתר.</p>
          </div>

          <ol class="steps">
            <li ttReveal="1">
              <span class="steps__badge tt-glass"><tt-icon name="coin" [size]="22"></tt-icon><b>1</b></span>
              <h3>בוחרים חבילה</h3>
              <p>המחיר, הפלטפורמה ואזור החנות מופיעים לפני התשלום.</p>
            </li>
            <li ttReveal="2">
              <span class="steps__badge tt-glass"><tt-icon name="lock" [size]="22"></tt-icon><b>2</b></span>
              <h3>משלמים</h3>
              <p>פרטי האשראי עוברים לספק הסליקה. אצלנו הם לא נשמרים.</p>
            </li>
            <li ttReveal="3">
              <span class="steps__badge tt-glass"><tt-icon name="delivery" [size]="22"></tt-icon><b>3</b></span>
              <h3>מקבלים</h3>
              <p>לכל הזמנה יש דף מעקב עם הסטטוס, מהתשלום ועד האספקה.</p>
            </li>
          </ol>

          <div class="compat" *ngIf="vm.platforms.length > 0" ttReveal="4">
            <span class="compat__label"><tt-icon name="platform" [size]="16"></tt-icon> עובד על</span>
            <span class="compat__chip" *ngFor="let platform of vm.platforms">{{ platform.name | t }}</span>
            <span class="compat__note">
              <tt-icon name="shield" [size]="15"></tt-icon>
              לא מבקשים סיסמה לחשבון המשחק, לא קוד אימות ולא קודי גיבוי. בשום שלב.
            </span>
          </div>
        </div>
      </section>
    </ng-container>

    <ng-template #loading>
      <tt-hero></tt-hero>
      <section class="tt-container tt-section"><tt-skeleton-grid [count]="4"></tt-skeleton-grid></section>
    </ng-template>

    <section class="close">
      <div class="close__art" aria-hidden="true"><tt-coin-pack [steps]="5"></tt-coin-pack></div>
      <div class="tt-container close__inner">
        <div class="close__ask" ttReveal>
          <h2>שאלות שחוזרות</h2>
          <tt-faq-accordion [entries]="(faq$ | async) ?? []"></tt-faq-accordion>
          <a class="ghost-link" routerLink="/faq">עוד שאלות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon></a>
        </div>
        <aside class="close__act tt-glass" ttReveal="2">
          <p class="close__kicker">מוכנים?</p>
          <p class="close__line">בוחרים כמות, רואים מחיר, מסיימים.</p>
          <a class="tt-btn tt-btn--buy tt-btn--lg" routerLink="/store">לקניית קוינס <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon></a>
          <span class="close__fine"><tt-icon name="lock" [size]="13"></tt-icon> תשלום מאובטח · מחיר סופי</span>
        </aside>
      </div>
    </section>
  `,
  styles: [`
    h2 { margin: 0; }

    .promises { padding-block: var(--tt-space-6); border-block-end: 1px solid var(--tt-border); }

    .buy {
      position: relative;
      background:
        radial-gradient(70% 80% at 85% 0%, var(--tt-brand-tint), transparent 60%),
        radial-gradient(40% 60% at 10% 100%, var(--tt-gold-tint), transparent 60%),
        var(--tt-bg-elevated);
      border-block-end: 1px solid var(--tt-border);
      padding-block: var(--tt-section-y);
    }
    .buy__shelf { margin-block-start: var(--tt-section-y); padding-block-start: var(--tt-space-6); border-block-start: 1px solid var(--tt-border); }
    .shelf-row { display: grid; gap: var(--tt-space-6); align-items: center; }
    .shelf { display: grid; gap: var(--tt-space-3); grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .shelf__aside { display: none; }
    @media (min-width: 700px) { .shelf { gap: var(--tt-space-4); grid-template-columns: repeat(auto-fit, minmax(230px, 280px)); } }
    @media (min-width: 1000px) {
      .shelf-row { grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); }
      .shelf__aside { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tt-space-2); padding-inline-start: var(--tt-space-6); border-inline-start: 1px solid var(--tt-border); }
      .shelf__kicker { margin: 0; font-family: var(--tt-font-display); font-size: 2.2rem; line-height: 1; }
      .shelf__line { margin: 0; max-inline-size: 34ch; color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
    }

    .band { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--tt-space-4); margin-block-end: var(--tt-space-5); flex-wrap: wrap; }
    .ghost-link { display: inline-flex; align-items: center; gap: 4px; color: var(--tt-text-muted); font-size: var(--tt-text-sm); font-weight: 600; white-space: nowrap; }
    .ghost-link:hover { color: var(--tt-brand-300); text-decoration: none; }

    .steps-band { border-block-end: 1px solid var(--tt-border); background: radial-gradient(60% 70% at 50% 100%, var(--tt-brand-tint), transparent 70%); }
    .steps-head { margin-block-end: var(--tt-space-6); max-inline-size: 60ch; }
    .steps-head p { margin: var(--tt-space-2) 0 0; font-size: var(--tt-text-sm); }

    /* A timeline: three stops on one rule. */
    .steps { position: relative; display: grid; gap: var(--tt-space-5); grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; padding: 0; list-style: none; }
    .steps::before { content: ''; position: absolute; inset-inline: 30px; inset-block-start: 30px; block-size: 1px; background: linear-gradient(90deg, transparent, var(--tt-border-strong) 15%, var(--tt-border-strong) 85%, transparent); }
    .steps li { position: relative; }
    .steps__badge {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: var(--tt-space-2);
      min-block-size: 60px;
      padding-inline: var(--tt-space-3) var(--tt-space-4);
      margin-block-end: var(--tt-space-3);
      border-radius: var(--tt-radius-pill);
      color: var(--tt-gold-400);
    }
    .steps__badge b { font-family: var(--tt-font-display); font-size: 2.2rem; line-height: 1; color: var(--tt-text); }
    .steps h3 { margin: 0 0 var(--tt-space-1); font-family: var(--tt-font-display); font-size: 1.6rem; }
    .steps p { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading-snug); }

    .compat { display: flex; align-items: center; flex-wrap: wrap; gap: var(--tt-space-2); margin-block-start: var(--tt-space-6); padding-block-start: var(--tt-space-4); border-block-start: 1px solid var(--tt-border); font-size: var(--tt-text-sm); }
    .compat__label { display: inline-flex; align-items: center; gap: 6px; color: var(--tt-text-muted); font-weight: 700; margin-inline-end: var(--tt-space-1); }
    .compat__chip { padding: 0.3rem 0.75rem; border: 1px solid var(--tt-border-strong); border-radius: var(--tt-radius-pill); background: var(--tt-surface); font-weight: 700; font-size: var(--tt-text-xs); }
    .compat__note { display: inline-flex; align-items: center; gap: 6px; margin-inline-start: auto; color: var(--tt-text-muted); font-size: var(--tt-text-xs); }
    .compat__note tt-icon { color: var(--tt-brand-400); flex: none; }

    .close { position: relative; isolation: isolate; overflow: hidden; padding-block: var(--tt-section-y); }
    .close__art { position: absolute; inset-block-start: 50%; inset-inline-start: -4%; inline-size: min(40vw, 420px); transform: translateY(-50%) rotate(-10deg); opacity: 0.14; filter: blur(1px); z-index: -1; pointer-events: none; }
    .close__inner { display: grid; gap: var(--tt-space-7); grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr); align-items: start; }
    .close__ask h2 { margin-block-end: var(--tt-space-4); }
    .close__ask .ghost-link { margin-block-start: var(--tt-space-4); }
    .close__act { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tt-space-3); padding: var(--tt-space-5); border-radius: var(--tt-radius-xl); }
    .close__kicker { margin: 0; font-family: var(--tt-font-display); font-size: 3rem; line-height: 1; }
    .close__line { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .close__fine { display: inline-flex; align-items: center; gap: 6px; color: var(--tt-text-faint); font-size: var(--tt-text-xs); }

    @media (max-width: 860px) {
      .steps { grid-template-columns: 1fr; gap: var(--tt-space-4); }
      .steps::before { display: none; }
      .steps li { padding-inline-start: 0; }
      .compat__note { margin-inline-start: 0; inline-size: 100%; }
      .close__inner { grid-template-columns: 1fr; gap: var(--tt-space-6); }
      .close__art { display: none; }
      .close__act { align-self: stretch; }
      .close__act .tt-btn { inline-size: 100%; }
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
      return { products: rest, lookups, ladder, platforms };
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
