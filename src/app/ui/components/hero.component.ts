import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { STOREFRONT } from '../../core/brand';
import { LocalizePipe } from '../../core/i18n';
import { formatQuantity, rankByValue } from '../../core/value';
import { Platform, ProductDetail } from '../../domain';
import { HeroSceneComponent } from './hero-scene.component';
import { IconComponent } from './icon.component';

/** A real tier, pinned to the artwork as a price tag. */
interface PriceTag {
  readonly quantity: string;
  readonly price: string;
}

/**
 * The opening screen.
 *
 * It has four things to say, in the order a first-time visitor needs them:
 * what this is, what it promises, what it costs, and what to press. The
 * headline names the product and carries the brand's one promise; a single
 * line under it says how buying works; the price is a figure the catalog can
 * back; and the action is gold because it is the moment money is involved.
 *
 * The artwork is the focal point, and two price tags are pinned to it so the
 * object reads as merchandise rather than as decoration. Both are real tiers at
 * real prices. If the catalog has not loaded, the figure and the tags are
 * absent rather than placeholders.
 *
 * Desktop and phone are two compositions. On a wide screen the copy and the
 * object share a row. On a phone the object gets a short band of its own at
 * full strength, and the message is set centred beneath it with a full-width
 * action, so the first screen is a poster and not a shrunken desktop.
 */
@Component({
  selector: 'tt-hero',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, HeroSceneComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <div class="hero__ground" aria-hidden="true">
        <span class="wash"></span>
        <span class="wash wash--warm"></span>
        <!-- Diagonal bands cut at the same angle as the brand mark. Cheap,
             original, and it gives the ground a direction instead of a blur. -->
        <span class="bands"></span>
      </div>

      <div class="tt-container hero__inner">
        <div class="copy">
          <p class="kicker">
            <tt-icon name="football" [size]="15"></tt-icon>
            <span>{{ gameName }} · Ultimate Team</span>
          </p>

          <h1>
            <span class="h1__what">קוינס ל־<span class="latin" dir="ltr">Ultimate Team</span></span>
            <span class="hl">בלי כאב ראש.</span>
          </h1>

          <p class="lede">
            בוחרים כמות, משלמים בתשלום מאובטח ומקבלים דף מעקב עד האספקה.
            הפלטפורמה ואזור החנות מוצגים לפני שמשלמים.
          </p>

          <!-- The price block: a figure, its unit, and what it is a price of. -->
          <div class="deal" *ngIf="best as price">
            <div class="deal__figure">
              <span class="deal__from">מ־</span>
              <span class="deal__value tt-numeric">{{ price }}</span>
              <span class="deal__currency">₪</span>
            </div>
            <div class="deal__note">
              <span class="deal__unit">לכל מיליון קוינס</span>
              <span class="deal__sub">בחבילה הגדולה. המחיר של כל חבילה למטה.</span>
            </div>
          </div>

          <div class="cta">
            <a class="tt-btn tt-btn--buy tt-btn--lg" routerLink="/store">
              לבחירת חבילה <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon>
            </a>
            <a class="tt-btn tt-btn--ghost tt-btn--lg" routerLink="/delivery">איך זה עובד</a>
          </div>

          <!-- Where it works. Read from the product's offers, never typed in. -->
          <ul class="facts" *ngIf="platforms.length > 0">
            <li class="facts__label">
              <tt-icon name="platform" [size]="15"></tt-icon>
              זמין ל־
            </li>
            <li class="facts__chip" *ngFor="let platform of platforms">{{ platform.shortName | t }}</li>
          </ul>
        </div>

        <div class="art" aria-hidden="true">
          <tt-hero-scene tier="hero"></tt-hero-scene>

          <span class="tag tag--a" *ngIf="tags[0] as tag">
            <span class="tag__qty tt-numeric">{{ tag.quantity }}</span>
            <span class="tag__price tt-numeric">{{ tag.price }}</span>
          </span>
          <span class="tag tag--b" *ngIf="tags[1] as tag">
            <span class="tag__qty tt-numeric">{{ tag.quantity }}</span>
            <span class="tag__price tt-numeric">{{ tag.price }}</span>
          </span>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .hero {
      position: relative;
      isolation: isolate;
      overflow: hidden;
      margin-block-start: calc(var(--tt-header-height) * -1);
      padding-block: calc(var(--tt-header-height) + var(--tt-space-7)) var(--tt-space-7);
      border-block-end: 1px solid var(--tt-border);
    }

    .hero__ground { position: absolute; inset: 0; z-index: -1; }
    .wash {
      position: absolute;
      inset-block-start: -40%;
      inset-inline-end: -10%;
      inline-size: min(70vw, 760px);
      block-size: min(70vw, 760px);
      border-radius: 50%;
      background: var(--tt-brand-500);
      opacity: 0.14;
      filter: blur(130px);
    }
    /* A second, warmer pool behind the object, so the metal has light to catch. */
    .wash--warm {
      inset-block-start: 10%;
      inset-inline-end: auto;
      inset-inline-start: -6%;
      inline-size: min(48vw, 520px);
      block-size: min(48vw, 520px);
      background: var(--tt-gold-500);
      opacity: 0.07;
    }
    .bands {
      position: absolute;
      inset: 0;
      background-image: repeating-linear-gradient(99deg, var(--tt-border) 0 1px, transparent 1px 74px);
      -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.85), transparent 78%);
      mask-image: linear-gradient(180deg, rgba(0,0,0,0.85), transparent 78%);
    }

    .hero__inner {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
      align-items: center;
      gap: var(--tt-space-6);
    }

    .copy { display: flex; flex-direction: column; align-items: flex-start; }

    .kicker {
      display: inline-flex;
      align-items: center;
      gap: var(--tt-space-2);
      margin: 0 0 var(--tt-space-4);
      padding: 0.3rem 0.7rem;
      border: 1px solid var(--tt-border-strong);
      border-radius: var(--tt-radius-pill);
      font-size: var(--tt-text-xs);
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--tt-text-muted);
    }
    .kicker tt-icon { color: var(--tt-gold-400); }

    h1 {
      margin: 0;
      font-size: clamp(2.1rem, 3.7vw, 3.4rem);
      line-height: 1.02;
      letter-spacing: -0.03em;
      font-weight: 900;
    }
    /* Gold is money here, so the fold carries exactly two gold things: the
       price and the button that spends it. The promise steps back a shade. */
    .h1__what { display: block; }
    .latin { white-space: nowrap; unicode-bidi: isolate; }
    .hl { display: block; color: var(--tt-text); opacity: 0.6; }

    .lede {
      margin: var(--tt-space-4) 0 0;
      max-inline-size: 46ch;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-md);
      line-height: var(--tt-leading);
    }

    /* The figure and its explanation, joined by a rule rather than boxed. */
    .deal {
      display: flex;
      align-items: center;
      gap: var(--tt-space-4);
      margin-block-start: var(--tt-space-5);
      padding-inline-start: var(--tt-space-4);
      border-inline-start: 2px solid var(--tt-gold-500);
    }
    .deal__figure { display: flex; align-items: baseline; gap: 2px; }
    .deal__from { color: var(--tt-text-faint); font-size: var(--tt-text-sm); }
    .deal__value {
      font-size: clamp(2.6rem, 5vw, 3.8rem);
      font-weight: 900;
      line-height: 0.86;
      letter-spacing: -0.045em;
      color: var(--tt-gold-400);
    }
    .deal__currency { font-size: var(--tt-text-xl); font-weight: 700; color: var(--tt-gold-400); }
    .deal__note { display: flex; flex-direction: column; gap: 2px; }
    .deal__unit { font-size: var(--tt-text-sm); font-weight: 700; }
    .deal__sub {
      font-size: var(--tt-text-xs);
      color: var(--tt-text-faint);
      line-height: var(--tt-leading-snug);
      max-inline-size: 24ch;
    }

    .cta {
      display: flex;
      gap: var(--tt-space-3);
      flex-wrap: wrap;
      margin-block-start: var(--tt-space-5);
    }
    .cta .tt-btn { white-space: nowrap; }

    .facts {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--tt-space-2);
      margin: var(--tt-space-5) 0 0;
      padding: 0;
      list-style: none;
      font-size: var(--tt-text-xs);
    }
    .facts__label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--tt-text-faint);
      font-weight: 600;
      margin-inline-end: var(--tt-space-1);
    }
    .facts__chip {
      padding: 0.2rem 0.55rem;
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-sm);
      background: var(--tt-surface);
      color: var(--tt-text-muted);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .art { position: relative; display: flex; justify-content: center; }
    .art tt-hero-scene { inline-size: min(100%, 470px); }

    /* Price tags pinned to the object. They sit at the same skew as the brand
       and are the only two pieces of type in the picture. */
    .tag {
      position: absolute;
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 0.45rem 0.7rem;
      border: 1px solid var(--tt-border-strong);
      border-radius: var(--tt-radius-md);
      background: color-mix(in srgb, var(--tt-bg-elevated) 84%, transparent);
      backdrop-filter: blur(10px);
      box-shadow: var(--tt-shadow-2);
      line-height: 1;
      direction: ltr;
    }
    .tag__qty { font-size: var(--tt-text-md); font-weight: 900; }
    .tag__price { font-size: var(--tt-text-xs); font-weight: 700; color: var(--tt-gold-400); }
    .tag--a { inset-block-start: 22%; inset-inline-start: 4%; }
    .tag--b { inset-block-end: 26%; inset-inline-end: 4%; border-color: var(--tt-gold-500); }

    /* --- Tablet: two columns, the object a little smaller ------------------ */
    @media (max-width: 1100px) {
      .hero__inner { grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); }
    }

    /* --- Phone: a poster ---------------------------------------------------- */
    @media (max-width: 760px) {
      .hero {
        padding-block: calc(var(--tt-header-height) + var(--tt-space-2)) var(--tt-space-6);
      }
      .hero__inner { display: flex; flex-direction: column; gap: 0; }

      /* The object first, whole and at full strength, on a short band. */
      .art { order: -1; inline-size: 100%; margin-block-end: var(--tt-space-2); }
      .art tt-hero-scene { inline-size: min(100%, 360px); }
      .tag { display: none; }

      .copy { align-items: center; text-align: center; }
      .kicker { margin-block-end: var(--tt-space-3); }
      h1 { font-size: clamp(1.9rem, 8.6vw, 2.6rem); }
      .lede { font-size: var(--tt-text-sm); max-inline-size: 34ch; margin-block-start: var(--tt-space-3); }

      .deal {
        align-items: baseline;
        justify-content: center;
        gap: var(--tt-space-3);
        margin-block-start: var(--tt-space-4);
        padding: var(--tt-space-3) 0 0;
        border-inline-start: 0;
        border-block-start: 1px solid var(--tt-border);
        inline-size: 100%;
      }
      .deal__note { text-align: start; }
      .deal__sub { display: none; }

      .cta { inline-size: 100%; flex-direction: column; align-items: stretch; margin-block-start: var(--tt-space-4); }
      .cta .tt-btn { inline-size: 100%; }
      .cta .tt-btn--ghost { min-block-size: 44px; }

      .facts { justify-content: center; }
    }
  `],
})
export class HeroComponent {
  readonly gameName = STOREFRONT.focusGameName;

  /** Cheapest price per million in the catalog, in whole shekels. */
  best: string | null = null;

  /** Smallest and largest tier, for the tags on the artwork. */
  tags: readonly PriceTag[] = [];

  /** The platforms the coin product is sold on, resolved by the page. */
  @Input() platforms: readonly Platform[] = [];

  @Input() set ladder(detail: ProductDetail | null | undefined) {
    this.best = this.cheapestPerMillion(detail);
    this.tags = this.tagsFor(detail);
  }

  private cheapestPerMillion(detail: ProductDetail | null | undefined): string | null {
    if (!detail) {
      return null;
    }

    const rates = rankByValue(detail.offers, detail.product.variants)
      .map((row) => row.perUnitMinor)
      .filter((value): value is number => value !== undefined);

    if (rates.length === 0) {
      return null;
    }

    // Whole shekels: a headline figure carrying agorot reads as precision
    // nobody asked for.
    return Math.round(Math.min(...rates) / 100).toLocaleString('he-IL');
  }

  private tagsFor(detail: ProductDetail | null | undefined): readonly PriceTag[] {
    if (!detail) {
      return [];
    }
    const first = detail.offers[0];
    if (!first) {
      return [];
    }
    const rows = rankByValue(
      detail.offers.filter((offer) => offer.platformId === first.platformId && offer.regionId === first.regionId),
      detail.product.variants,
    )
      .filter((row) => row.perUnitMinor !== undefined)
      .sort((a, b) => (a.variant.quantityValue ?? 0) - (b.variant.quantityValue ?? 0));

    if (rows.length < 2) {
      return [];
    }
    const tag = (row: (typeof rows)[number]): PriceTag => ({
      quantity: formatQuantity(row.variant.quantityValue) || row.variant.name.he,
      price: `₪${Math.round(row.offer.price.current.amountMinor / 100).toLocaleString('he-IL')}`,
    });
    return [tag(rows[0]), tag(rows[rows.length - 1])];
  }
}
