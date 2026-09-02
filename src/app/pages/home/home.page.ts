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
  AmountSelectorComponent, FaqAccordionComponent, HeroComponent, IconComponent,
  ProductCardComponent, SkeletonGridComponent, ValueStripComponent,
} from '../../ui';

/**
 * The landing page.
 *
 * A flow rather than a stack of sections: the hero sells the product, the
 * picker sells a bundle, a short shelf shows what else there is, then how
 * buying works and where it works, and the questions that stop a purchase
 * beside the purchase itself. Each block has its own ground or its own shape,
 * so the page reads as chapters rather than as a list of identical bands.
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
    HeroComponent, IconComponent, AmountSelectorComponent, ValueStripComponent,
    ProductCardComponent, FaqAccordionComponent, SkeletonGridComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="vm$ | async as vm; else loading">
      <tt-hero [ladder]="vm.ladder" [platforms]="vm.platforms"></tt-hero>

      <!-- The promises, as a caption to the hero rather than a chapter. -->
      <div class="promises">
        <div class="tt-container">
          <h2 class="tt-visually-hidden">למה EASYCOINS</h2>
          <tt-value-strip></tt-value-strip>
        </div>
      </div>

      <!-- The purchase, on its own ground. -->
      <div class="buy" id="bundles">
        <div class="tt-container">
          <section class="buy__pick" *ngIf="vm.ladder as ladder">
            <tt-amount-selector [detail]="ladder"
                                heading="כמה קוינס אתם צריכים?"
                                [busy]="adding()"
                                (confirm)="addPlan($event)">
            </tt-amount-selector>
          </section>

          <section class="buy__shelf" *ngIf="vm.products.length > 0">
            <header class="band">
              <h2>עוד ל{{ gameName }}</h2>
              <a class="ghost-link" routerLink="/store">
                לחנות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon>
              </a>
            </header>
            <div class="shelf">
              <tt-product-card *ngFor="let product of vm.products"
                               [product]="product"
                               [lookups]="vm.lookups">
              </tt-product-card>
            </div>
          </section>
        </div>
      </div>

      <!-- How buying works, and where it works. -->
      <section class="tt-section steps-band">
        <div class="tt-container">
          <div class="steps-head">
            <h2>שלושה צעדים, בלי הפתעות</h2>
            <p class="tt-muted">מה שרואים לפני התשלום זה מה שמשלמים. אין שלב נסתר.</p>
          </div>

          <ol class="steps">
            <li>
              <span class="steps__n"><tt-icon name="coin" [size]="20"></tt-icon><b>1</b></span>
              <h3>בוחרים חבילה</h3>
              <p>המחיר, הפלטפורמה ואזור החנות מופיעים לפני התשלום.</p>
            </li>
            <li>
              <span class="steps__n"><tt-icon name="lock" [size]="20"></tt-icon><b>2</b></span>
              <h3>משלמים</h3>
              <p>פרטי האשראי עוברים לספק הסליקה. אצלנו הם לא נשמרים.</p>
            </li>
            <li>
              <span class="steps__n"><tt-icon name="delivery" [size]="20"></tt-icon><b>3</b></span>
              <h3>מקבלים</h3>
              <p>לכל הזמנה יש דף מעקב עם הסטטוס, מהתשלום ועד האספקה.</p>
            </li>
          </ol>

          <div class="compat" *ngIf="vm.platforms.length > 0">
            <span class="compat__label">
              <tt-icon name="platform" [size]="16"></tt-icon> עובד על
            </span>
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

    <!-- The close: the questions that stop a purchase, and the purchase. -->
    <section class="tt-container tt-section close">
      <div class="close__ask">
        <h2>שאלות שחוזרות</h2>
        <tt-faq-accordion [entries]="(faq$ | async) ?? []"></tt-faq-accordion>
        <a class="ghost-link" routerLink="/faq">
          עוד שאלות <tt-icon name="chevron" [size]="15" dir="auto"></tt-icon>
        </a>
      </div>

      <aside class="close__act">
        <p class="close__kicker">מוכנים?</p>
        <p class="close__line">בוחרים כמות, רואים מחיר, מסיימים.</p>
        <a class="tt-btn tt-btn--buy tt-btn--lg" routerLink="/store">
          לקניית קוינס <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon>
        </a>
      </aside>
    </section>
  `,
  styles: [`
    h2 {
      margin: 0;
      font-size: var(--tt-display-2);
      letter-spacing: var(--tt-tracking-display);
      line-height: var(--tt-leading-tight);
    }

    .promises {
      padding-block: var(--tt-space-5);
      border-block-end: 1px solid var(--tt-border);
    }

    .buy {
      background:
        radial-gradient(80% 100% at 50% 0%, var(--tt-brand-tint), transparent 62%),
        var(--tt-bg-elevated);
      border-block-end: 1px solid var(--tt-border);
      padding-block: var(--tt-section-y);
    }
    .buy__shelf {
      margin-block-start: var(--tt-section-y);
      padding-block-start: var(--tt-space-6);
      border-block-start: 1px solid var(--tt-border);
    }
    /* A short shelf: two or three cards at a comfortable width, never a row of
       stretched tiles. */
    .shelf {
      display: grid;
      gap: var(--tt-space-3);
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    @media (min-width: 700px) {
      .shelf { gap: var(--tt-space-4); grid-template-columns: repeat(auto-fit, minmax(230px, 280px)); }
    }

    .band {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--tt-space-4);
      margin-block-end: var(--tt-space-5);
      flex-wrap: wrap;
    }
    .ghost-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
      font-weight: 600;
      white-space: nowrap;
    }
    .ghost-link:hover { color: var(--tt-brand-300); text-decoration: none; }

    .steps-band { border-block-end: 1px solid var(--tt-border); }
    .steps-head { margin-block-end: var(--tt-space-6); max-inline-size: 60ch; }
    .steps-head p { margin: var(--tt-space-2) 0 0; font-size: var(--tt-text-sm); }

    .steps {
      display: grid;
      gap: var(--tt-space-5);
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .steps li {
      position: relative;
      padding-inline-start: var(--tt-space-4);
      border-inline-start: 1px solid var(--tt-border);
    }
    .steps__n {
      display: flex;
      align-items: center;
      gap: var(--tt-space-2);
      margin-block-end: var(--tt-space-3);
      color: var(--tt-gold-400);
    }
    .steps__n b {
      font-family: var(--tt-font-numeric);
      font-size: var(--tt-text-2xl);
      font-weight: 900;
      line-height: 1;
      color: var(--tt-text);
      opacity: 0.35;
    }
    .steps h3 { margin: 0 0 var(--tt-space-1); font-size: var(--tt-text-lg); }
    .steps p { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading-snug); }

    .compat {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--tt-space-2);
      margin-block-start: var(--tt-space-6);
      padding-block-start: var(--tt-space-4);
      border-block-start: 1px solid var(--tt-border);
      font-size: var(--tt-text-sm);
    }
    .compat__label { display: inline-flex; align-items: center; gap: 6px; color: var(--tt-text-muted); font-weight: 700; margin-inline-end: var(--tt-space-1); }
    .compat__chip {
      padding: 0.25rem 0.65rem;
      border: 1px solid var(--tt-border-strong);
      border-radius: var(--tt-radius-sm);
      background: var(--tt-surface);
      font-weight: 700;
      font-size: var(--tt-text-xs);
    }
    .compat__note {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-inline-start: auto;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-xs);
    }
    .compat__note tt-icon { color: var(--tt-brand-400); flex: none; }

    .close {
      display: grid;
      gap: var(--tt-space-7);
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr);
      align-items: start;
    }
    .close__ask h2 { margin-block-end: var(--tt-space-4); }
    .close__ask .ghost-link { margin-block-start: var(--tt-space-4); }
    .close__act {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--tt-space-3);
      padding-inline-start: var(--tt-space-5);
      border-inline-start: 2px solid var(--tt-gold-500);
    }
    .close__kicker { margin: 0; font-size: var(--tt-display-2); font-weight: 900; line-height: 1; letter-spacing: var(--tt-tracking-display); }
    .close__line { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); }

    @media (max-width: 860px) {
      .steps { grid-template-columns: 1fr; gap: var(--tt-space-4); }
      .steps li { padding-inline-start: var(--tt-space-3); }
      .steps__n { margin-block-end: var(--tt-space-2); }
      .compat__note { margin-inline-start: 0; inline-size: 100%; }
      .close { grid-template-columns: 1fr; gap: var(--tt-space-6); }
      .close__act {
        padding-inline-start: 0;
        padding-block-start: var(--tt-space-5);
        border-inline-start: 0;
        border-block-start: 1px solid var(--tt-border);
        align-self: stretch;
      }
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

  /**
   * The catalog for the game this shop sells, and the coin product with its
   * offers, fetched side by side rather than one after the other.
   *
   * Products are filtered by game so the page cannot quietly advertise a
   * product from a game the storefront does not present. The coin product is
   * fetched by the slug the storefront names; if that fails the page still
   * renders, with the product on the shelf as an ordinary card and no picker.
   * The platforms are the coin product's own.
   */
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

  /** Set while a plan is being added, so the button cannot be double-pressed. */
  readonly adding = signal(false);

  /**
   * Adds every bundle in the plan to the cart.
   *
   * Sequential rather than parallel: the cart merges by offer, and several
   * writes at once against one line is how a quantity gets lost.
   */
  addPlan(plan: CoinPlan): void {
    if (this.adding()) {
      return;
    }
    this.adding.set(true);

    concat(...plan.lines.map((line) => this.cart.add({
      offerId: line.offer.id,
      quantity: line.count,
    }))).subscribe({
      complete: () => this.adding.set(false),
      error: () => this.adding.set(false),
    });
  }

  constructor() {
    this.analytics.pageView('/', 'Home');
  }
}
