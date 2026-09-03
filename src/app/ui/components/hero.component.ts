import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { STOREFRONT } from '../../core/brand';
import { LocalizePipe } from '../../core/i18n';
import { formatQuantity, rankByValue } from '../../core/value';
import { Platform, ProductDetail } from '../../domain';
import { Material, materialForStep } from '../materials';
import { RevealDirective } from '../reveal.directive';
import { HeroSceneComponent } from './hero-scene.component';
import { IconComponent } from './icon.component';

/** A real tier, pinned to the artwork as a price tag. */
interface PriceTag {
  readonly quantity: string;
  readonly price: string;
  readonly material: Material;
}

/**
 * The opening screen.
 *
 * Four things, in the order a first-time visitor needs them: what this is,
 * what it promises, what it costs, what to press. The headline is set in the
 * display face at poster size; the price is a figure the catalog can back; the
 * action is gold because it is the moment money is involved.
 *
 * The artwork is the focal point. On a desktop it follows the pointer with a
 * shallow tilt, which is the cheapest thing that makes a rendered object feel
 * held rather than printed; on a phone, and for anyone who asked for less
 * motion, it stays still. Two real price tags are pinned to it in the tier
 * materials of the smallest and largest bundle.
 *
 * Desktop and phone are two compositions. On a phone the object gets a short
 * band of its own and the message is set centred beneath it with one gold
 * action, so the first screen is a poster and not a shrunken desktop.
 */
@Component({
  selector: 'tt-hero',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, HeroSceneComponent, IconComponent, RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <div class="hero__ground" aria-hidden="true">
        <span class="wash"></span>
        <span class="wash wash--warm"></span>
        <span class="bands"></span>
      </div>

      <div class="tt-container hero__inner">
        <div class="copy">
          <p class="kicker tt-glass" ttReveal="0">
            <tt-icon name="football" [size]="15"></tt-icon>
            <span>{{ gameName }} · Ultimate Team</span>
          </p>

          <h1 ttReveal="1">
            <span class="h1__what">קוינס ל־<span class="latin" dir="ltr">Ultimate Team</span></span>
            <span class="hl">בלי כאב ראש.</span>
          </h1>

          <p class="lede" ttReveal="2">
            בוחרים כמות, משלמים בתשלום מאובטח ומקבלים דף מעקב עד האספקה.
            הפלטפורמה ואזור החנות מוצגים לפני שמשלמים.
          </p>

          <div class="deal" *ngIf="best as price" ttReveal="3">
            <div class="deal__figure">
              <span class="deal__from">מ־</span>
              <span class="deal__value tt-figure">{{ price }}</span>
              <span class="deal__currency">₪</span>
            </div>
            <div class="deal__note">
              <span class="deal__unit">לכל מיליון קוינס</span>
              <span class="deal__sub">בחבילה הגדולה. המחיר של כל חבילה למטה.</span>
            </div>
          </div>

          <div class="cta" ttReveal="4">
            <a class="tt-btn tt-btn--buy tt-btn--lg" routerLink="/store">
              לבחירת חבילה <tt-icon name="arrow" [size]="18" dir="auto"></tt-icon>
            </a>
            <a class="tt-btn tt-btn--ghost tt-btn--lg" routerLink="/delivery">איך זה עובד</a>
          </div>

          <ul class="facts" *ngIf="platforms.length > 0" ttReveal="5">
            <li class="facts__label">
              <tt-icon name="platform" [size]="15"></tt-icon>
              זמין ל־
            </li>
            <li class="facts__chip" *ngFor="let platform of platforms">{{ platform.shortName | t }}</li>
          </ul>
        </div>

        <div class="art"
             aria-hidden="true"
             (pointermove)="tilt($event)"
             (pointerleave)="rest()">
          <div class="art__stage" [style.transform]="transform()">
            <tt-hero-scene tier="hero" material="elite"></tt-hero-scene>

            <span class="tag tag--a tt-glass" *ngIf="tags[0] as tag" [style.--mat]="tag.material.color">
              <span class="tag__dot"></span>
              <span class="tag__qty tt-figure">{{ tag.quantity }}</span>
              <span class="tag__price">{{ tag.price }}</span>
            </span>
            <span class="tag tag--b tt-glass" *ngIf="tags[1] as tag" [style.--mat]="tag.material.color">
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
    .wash--warm {
      inset-block-start: 10%;
      inset-inline-end: auto;
      inset-inline-start: -6%;
      inline-size: min(48vw, 520px);
      block-size: min(48vw, 520px);
      background: var(--tt-gold-500);
      opacity: 0.09;
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
      padding: 0.35rem 0.8rem;
      border-radius: var(--tt-radius-pill);
      font-size: var(--tt-text-xs);
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--tt-text-muted);
    }
    .kicker tt-icon { color: var(--tt-gold-400); }

    h1 {
      margin: 0;
      font-size: clamp(3rem, 5.2vw, 4.7rem);
      line-height: 0.94;
      letter-spacing: 0.005em;
      font-weight: 700;
    }
    .h1__what { display: block; }
    .latin { white-space: nowrap; unicode-bidi: isolate; }
    .hl { display: block; color: var(--tt-text); opacity: 0.55; font-weight: 400; }

    .lede {
      margin: var(--tt-space-4) 0 0;
      max-inline-size: 46ch;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-md);
      line-height: var(--tt-leading);
    }

    .deal {
      display: flex;
      align-items: center;
      gap: var(--tt-space-4);
      margin-block-start: var(--tt-space-5);
      padding-inline-start: var(--tt-space-4);
      border-inline-start: 2px solid var(--tt-gold-500);
    }
    .deal__figure { display: flex; align-items: baseline; gap: 3px; }
    .deal__from { color: var(--tt-text-faint); font-size: var(--tt-text-sm); }
    .deal__value { font-size: clamp(3rem, 5.6vw, 4.6rem); color: var(--tt-gold-400); }
    .deal__currency { font-family: var(--tt-font-display); font-size: var(--tt-text-2xl); color: var(--tt-gold-400); }
    .deal__note { display: flex; flex-direction: column; gap: 2px; }
    .deal__unit { font-size: var(--tt-text-sm); font-weight: 700; }
    .deal__sub { font-size: var(--tt-text-xs); color: var(--tt-text-faint); line-height: var(--tt-leading-snug); max-inline-size: 24ch; }

    .cta { display: flex; gap: var(--tt-space-3); flex-wrap: wrap; margin-block-start: var(--tt-space-5); }
    .cta .tt-btn { white-space: nowrap; }

    .facts { display: flex; align-items: center; flex-wrap: wrap; gap: var(--tt-space-2); margin: var(--tt-space-5) 0 0; padding: 0; list-style: none; font-size: var(--tt-text-xs); }
    .facts__label { display: inline-flex; align-items: center; gap: 5px; color: var(--tt-text-faint); font-weight: 600; margin-inline-end: var(--tt-space-1); }
    .facts__chip { padding: 0.25rem 0.6rem; border: 1px solid var(--tt-border-strong); border-radius: var(--tt-radius-pill); background: var(--tt-surface); color: var(--tt-text-muted); font-weight: 700; letter-spacing: 0.02em; }

    .art { position: relative; display: flex; justify-content: center; perspective: 1200px; }
    .art__stage {
      position: relative;
      inline-size: min(100%, 500px);
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
    }
    .tag__dot { inline-size: 10px; block-size: 10px; border-radius: 50%; background: var(--mat); box-shadow: 0 0 12px var(--mat); }
    .tag__qty { font-size: var(--tt-text-xl); }
    .tag__price { font-size: var(--tt-text-xs); font-weight: 700; color: var(--tt-gold-400); }
    .tag--a { inset-block-start: 20%; inset-inline-start: 2%; }
    .tag--b { inset-block-end: 24%; inset-inline-end: 2%; }

    @media (max-width: 1100px) { .hero__inner { grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); } }

    @media (max-width: 760px) {
      .hero { padding-block: calc(var(--tt-header-height) + var(--tt-space-2)) var(--tt-space-6); }
      .hero__inner { display: flex; flex-direction: column; gap: 0; }
      .art { order: -1; inline-size: 100%; margin-block-end: var(--tt-space-2); perspective: none; }
      .art__stage { inline-size: min(100%, 380px); transform: none !important; }
      .tag { display: none; }
      .copy { align-items: center; text-align: center; }
      .kicker { margin-block-end: var(--tt-space-3); }
      h1 { font-size: clamp(2.7rem, 12vw, 3.6rem); }
      .lede { font-size: var(--tt-text-sm); max-inline-size: 34ch; margin-block-start: var(--tt-space-3); }
      .deal { align-items: baseline; justify-content: center; gap: var(--tt-space-3); margin-block-start: var(--tt-space-4); padding: var(--tt-space-3) 0 0; border-inline-start: 0; border-block-start: 1px solid var(--tt-border); inline-size: 100%; }
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
    this.transform.set(`rotateY(${(x * 10).toFixed(2)}deg) rotateX(${(-y * 8).toFixed(2)}deg)`);
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
    const tag = (row: (typeof rows)[number], step: number): PriceTag => ({
      quantity: formatQuantity(row.variant.quantityValue) || row.variant.name.he,
      price: `₪${Math.round(row.offer.price.current.amountMinor / 100).toLocaleString('he-IL')}`,
      material: materialForStep(step),
    });
    return [tag(rows[0], 1), tag(rows[rows.length - 1], rows.length)];
  }
}
