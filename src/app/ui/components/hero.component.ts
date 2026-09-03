import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { STOREFRONT } from '../../core/brand';
import { LocalizePipe } from '../../core/i18n';
import { formatQuantity, rankByValue } from '../../core/value';
import { GAME_EDITIONS, Platform, PlatformFamily, ProductDetail } from '../../domain';
import { TIERS, Tier, tierForAmount } from './cards/tiers';
import { HeroSceneComponent } from './hero-scene.component';
import { IconComponent } from './icon.component';
import { StadiumComponent } from './world/stadium.component';

/** A real tier, pinned to the artwork as a price tag. */
interface PriceTag {
  readonly quantity: string;
  readonly price: string;
  readonly tier: Tier;
}

/**
 * The opening screen, set the way the reference sets it.
 *
 * Copy on the start side: the game as a kicker, a three-line headline with
 * "Ultimate Team" in gold, three facts the shop keeps, the price a million
 * costs, the gold action and the quiet one, and the platforms. The trophy on
 * the other side, in a stadium after dark. Every number is the catalog's;
 * every fact is something the product does.
 *
 * On a phone the copy leads and the trophy follows the actions, smaller, so
 * the first screen is a headline, a price and a button, not a picture.
 */
@Component({
  selector: 'tt-hero',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, HeroSceneComponent, IconComponent, StadiumComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <tt-stadium scene="hero" [animated]="true"></tt-stadium>

      <div class="tt-container hero__inner">
        <div class="copy">
          <p class="kicker seq seq--word" style="--seq-delay: 220ms">
            <tt-icon name="crown" [size]="15"></tt-icon>
            <span>{{ gameName }} {{ editionLabel }}</span>
            <tt-icon name="football" [size]="14"></tt-icon>
          </p>

          <h1>
            <span class="line seq seq--word" style="--seq-delay: 320ms">קונים קוינס</span>
            <span class="line line--gold seq seq--word" style="--seq-delay: 440ms" dir="ltr">Ultimate Team</span>
            <span class="line seq seq--word" style="--seq-delay: 560ms">בלי כאב ראש.</span>
          </h1>

          <ul class="facts seq seq--word" style="--seq-delay: 660ms">
            <li><tt-icon name="check" [size]="14"></tt-icon> מחיר סופי לפני התשלום</li>
            <li><tt-icon name="check" [size]="14"></tt-icon> תשלום מאובטח</li>
            <li><tt-icon name="check" [size]="14"></tt-icon> דף מעקב לכל הזמנה</li>
          </ul>

          <div class="deal seq seq--word" *ngIf="best as price" style="--seq-delay: 760ms">
            <span class="deal__from">מ־</span>
            <span class="deal__value tt-figure">{{ price }}</span>
            <span class="deal__currency">₪</span>
            <span class="deal__unit">לכל מיליון קוינס <span class="deal__sub">בחבילה הגדולה</span></span>
          </div>

          <div class="cta seq seq--word" style="--seq-delay: 860ms">
            <a class="tt-btn tt-btn--buy tt-btn--lg seq seq--glow" style="--seq-delay: 1350ms" routerLink="/store">
              <tt-icon name="cart" [size]="18"></tt-icon> לבחירת חבילה
            </a>
            <a class="tt-btn tt-btn--ghost tt-btn--lg" routerLink="/delivery">איך זה עובד</a>
          </div>

          <div class="platforms seq seq--word" *ngIf="platforms.length > 0" style="--seq-delay: 960ms">
            <span class="platforms__label">תואם לכל הפלטפורמות</span>
            <ul class="pills">
              <li class="pill" *ngFor="let platform of platforms">
                <tt-icon [name]="platform.family === pc ? 'platform' : 'gamepad'" [size]="13"></tt-icon>
                {{ platform.shortName | t }}
              </li>
            </ul>
          </div>
        </div>

        <div class="art seq seq--object"
             style="--seq-delay: 120ms"
             aria-hidden="true"
             (pointermove)="tilt($event)"
             (pointerleave)="rest()">
          <div class="art__stage" [style.transform]="transform()">
            <tt-hero-scene tier="legend"></tt-hero-scene>

            <span class="tag tag--a tt-glass" *ngIf="tags[0] as tag" [style.--mat]="tag.tier.color">
              <span class="tag__dot"></span>
              <span class="tag__qty tt-figure">{{ tag.quantity }}</span>
              <span class="tag__price">{{ tag.price }}</span>
            </span>
            <span class="tag tag--b tt-glass" *ngIf="tags[1] as tag" [style.--mat]="tag.tier.color">
              <span class="tag__dot"></span>
              <span class="tag__qty tt-figure">{{ tag.quantity }}</span>
              <span class="tag__price">{{ tag.price }}</span>
            </span>
          </div>
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
      min-block-size: min(84vh, 780px);
      display: flex;
      align-items: center;
    }
    .hero__inner {
      inline-size: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: center;
      gap: var(--tt-space-6);
    }
    .copy { display: flex; flex-direction: column; align-items: flex-start; }

    .kicker {
      display: inline-flex;
      align-items: center;
      gap: var(--tt-space-2);
      margin: 0 0 var(--tt-space-4);
      padding: 0.3rem 0.75rem;
      border: 1px solid rgba(212, 180, 106, 0.35);
      border-radius: var(--tt-radius-pill);
      background: rgba(212, 180, 106, 0.08);
      color: var(--tt-gold-400);
      font-size: var(--tt-label);
      font-weight: 800;
      letter-spacing: 0.06em;
      direction: ltr;
    }

    h1 { margin: 0; font-size: var(--tt-display-1); line-height: 1.04; }
    .line { display: block; }
    .line--gold {
      color: var(--tt-gold-400);
      background: linear-gradient(180deg, #F4E6C3 0%, #E6CB86 45%, #C9A55A 100%);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      text-align: start;
    }

    .facts { display: flex; flex-wrap: wrap; gap: var(--tt-space-2) var(--tt-space-4); margin: var(--tt-space-4) 0 0; padding: 0; list-style: none; font-size: var(--tt-text-sm); font-weight: 700; color: var(--tt-text-muted); }
    .facts li { display: inline-flex; align-items: center; gap: 6px; }
    .facts tt-icon { color: var(--tt-energy); }

    .deal { display: flex; align-items: baseline; gap: 4px; margin-block-start: var(--tt-space-4); }
    .deal__from { color: var(--tt-text-faint); font-size: var(--tt-text-sm); }
    .deal__value { font-size: 2.6rem; color: var(--tt-gold-400); }
    .deal__currency { font-family: var(--tt-font-display); font-weight: 900; font-size: var(--tt-text-xl); color: var(--tt-gold-400); }
    .deal__unit { margin-inline-start: var(--tt-space-2); font-size: var(--tt-text-sm); font-weight: 700; }
    .deal__sub { display: block; font-size: var(--tt-caption); font-weight: 500; color: var(--tt-text-faint); }

    .cta { display: flex; gap: var(--tt-space-3); flex-wrap: wrap; margin-block-start: var(--tt-space-5); }
    .cta .tt-btn { white-space: nowrap; }

    .platforms { display: flex; flex-direction: column; gap: var(--tt-space-2); margin-block-start: var(--tt-space-5); }
    .platforms__label { font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text-faint); }
    .pills { display: flex; flex-wrap: wrap; gap: var(--tt-space-2); margin: 0; padding: 0; list-style: none; }
    .pill { display: inline-flex; align-items: center; gap: 6px; padding: 0.35rem 0.75rem; border: 1px solid var(--tt-border-strong); border-radius: var(--tt-radius-md); background: rgba(255, 248, 235, 0.03); color: var(--tt-text); font-size: var(--tt-caption); font-weight: 800; letter-spacing: 0.04em; direction: ltr; }
    .pill tt-icon { color: var(--tt-text-faint); }

    .art { position: relative; display: flex; justify-content: center; perspective: 1200px; }
    .art__stage {
      position: relative;
      inline-size: min(100%, 600px);
      transform-style: preserve-3d;
      transition: transform 300ms var(--tt-ease-out);
      will-change: transform;
    }
    .art__stage tt-hero-scene { inline-size: 100%; }

    .tag {
      position: absolute;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0.5rem 0.8rem;
      border-radius: var(--tt-radius-md);
      line-height: 1;
      direction: ltr;
      transform: translateZ(40px);
      box-shadow: var(--tt-glass-highlight), 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .tag__dot { inline-size: 10px; block-size: 10px; border-radius: 50%; background: var(--mat); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45); }
    .tag__qty { font-size: var(--tt-text-xl); }
    .tag__price { font-size: var(--tt-text-xs); font-weight: 700; color: var(--tt-gold-400); }
    .tag--a { inset-block-start: 30%; inset-inline-start: 0; }
    .tag--b { inset-block-end: 36%; inset-inline-end: 0; }

    @media (max-width: 1100px) { .hero__inner { grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); } }

    @media (max-width: 760px) {
      .hero { padding-block: calc(var(--tt-header-height) + var(--tt-space-3)) var(--tt-space-5); min-block-size: 0; display: block; }
      .hero__inner { display: flex; flex-direction: column; gap: var(--tt-space-3); }
      .copy { align-items: flex-start; }
      .kicker { margin-block-end: var(--tt-space-3); }
      h1 { font-size: clamp(2.2rem, 10vw, 2.9rem); }
      .facts { gap: var(--tt-space-1) var(--tt-space-3); font-size: var(--tt-caption); margin-block-start: var(--tt-space-3); }
      .deal { margin-block-start: var(--tt-space-3); }
      .deal__value { font-size: 2.1rem; }
      .cta { inline-size: 100%; flex-direction: column; align-items: stretch; margin-block-start: var(--tt-space-4); }
      .cta .tt-btn { inline-size: 100%; }
      .cta .tt-btn--ghost { min-block-size: 46px; }
      .platforms { margin-block-start: var(--tt-space-4); }
      /* The trophy leads on a phone, small enough that the headline, the
         price and the action share the first screen with it. */
      .art { order: -1; inline-size: 100%; perspective: none; margin-block: 0 var(--tt-space-1); }
      .art__stage { inline-size: min(64%, 280px); transform: none !important; }
      .tag { display: none; }
    }
  `],
})
export class HeroComponent {
  readonly gameName = STOREFRONT.focusGameName;
  readonly editionLabel = String(GAME_EDITIONS[STOREFRONT.focusGameEdition].year);
  readonly pc = PlatformFamily.Pc;

  /** Cheapest price per million in the catalog, in whole shekels. */
  best: string | null = null;
  tags: readonly PriceTag[] = [];

  @Input() platforms: readonly Platform[] = [];

  @Input() set ladder(detail: ProductDetail | null | undefined) {
    this.best = this.cheapestPerMillion(detail);
    this.tags = this.tagsFor(detail);
  }

  /** The tilt of the artwork, following the pointer on a desktop. */
  readonly transform = signal('');

  private readonly canTilt = typeof window !== 'undefined'
    && !window.matchMedia('(pointer: coarse)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  tilt(event: PointerEvent): void {
    if (!this.canTilt) {
      return;
    }
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    this.transform.set(`rotateY(${(x * 8).toFixed(2)}deg) rotateX(${(-y * 6).toFixed(2)}deg)`);
  }

  rest(): void {
    this.transform.set('');
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
      tier: TIERS[tierForAmount(row.variant.quantityValue)],
    });
    return [tag(rows[0]), tag(rows[rows.length - 1])];
  }
}
