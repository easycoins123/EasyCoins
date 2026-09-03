import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { formatQuantity, OfferValue, rankByValue } from '../../core/value';
import { LocalizePipe } from '../../core/i18n';
import { Offer, ProductDetail, ProductVariant } from '../../domain';
import { MoneyPipe } from '../money.pipe';
import { CoinTier } from '../../domain';
import { CoinArtComponent } from './cards/coin-art.component';
import { tierForAmount } from './cards/tiers';
import { IconComponent } from './icon.component';

/**
 * The price ladder: the value argument, made visible.
 *
 * A column of prices tells a customer what each bundle costs. It does not tell
 * them which one is worth buying, which is the question they are actually
 * asking. This shows the relationship instead: quantity, price, what a million
 * coins costs at that tier, and a bar whose length is the value. "Buy more, pay
 * less per coin" stops being marketing copy and becomes something read off the
 * page in a second.
 *
 * On a phone it is a horizontal snap rail, not five stacked rectangles. Five
 * full-width rows meant a customer had to scroll through the whole range to
 * compare its ends, which defeats the point of a comparison. Swiping a rail
 * puts two tiers on screen at once and matches how every other price selector
 * on a phone behaves.
 *
 * Every figure comes from offers the server priced. This computes ratios and
 * nothing else; it never decides what anything costs, and it has no concept of
 * a popular or best-selling tier because no such data exists.
 */
@Component({
  selector: 'tt-bundle-ladder',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, MoneyPipe, CoinArtComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rail" *ngIf="rows.length > 0">
      <ul class="ladder">
        <li class="tier"
            *ngFor="let row of rows; let i = index"
            [class.tier--best]="row.isBestValue">
          <a class="tier__link"
             [routerLink]="['/products', productSlug, row.variant.id]">

            <span class="tier__flag" *ngIf="row.isBestValue">
              <tt-icon name="bolt" [size]="12"></tt-icon> הערך הגבוה ביותר
            </span>

            <tt-coin-art class="tier__art" [tier]="tierFor(row)" variant="tile"></tt-coin-art>

            <span class="qty tt-numeric">{{ label(row) }}</span>

            <!-- The bar is the argument: longer means more coins per shekel. -->
            <span class="meter" aria-hidden="true">
              <span class="meter__fill" [style.inline-size.%]="fillPercent(row)"></span>
            </span>

            <span class="per-unit tt-numeric" *ngIf="row.perUnitMinor as perUnit">
              {{ { amountMinor: perUnit, currency: row.offer.price.current.currency } | money }}
              <span class="per-unit__label">למיליון</span>
            </span>

            <span class="tier__buy">
              <span class="tt-price">{{ row.offer.price.current | money }}</span>
              <tt-icon class="tier__go" name="chevron" [size]="16" dir="auto"></tt-icon>
            </span>
          </a>
        </li>
      </ul>
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* The rail bleeds to the viewport edge on a phone so the last tier is
       visibly cut off, which is what tells a thumb there is more to swipe. */
    .rail { position: relative; }

    .ladder {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
      gap: var(--tt-space-3);
      align-items: stretch;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .tier {
      display: flex;
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface);
      transition: border-color var(--tt-duration-fast) var(--tt-ease),
                  background-color var(--tt-duration-fast) var(--tt-ease);
    }
    .tier:hover { border-color: var(--tt-border-strong); background: var(--tt-surface-2); }

    /* The strongest tier is marked in the value colour. It is a ranking this
       component computed, not a claim about what other people bought. */
    .tier--best {
      border-color: var(--tt-gold-500);
      background: linear-gradient(180deg, var(--tt-gold-tint), transparent 60%), var(--tt-surface);
    }

    .tier__link {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--tt-space-2);
      inline-size: 100%;
      padding: var(--tt-space-4) var(--tt-space-3) var(--tt-space-3);
      color: inherit;
    }
    .tier__link:hover { text-decoration: none; }

    .tier__flag {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0.1rem 0.4rem;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-gold-500);
      color: var(--tt-text-on-gold);
      font-size: 10px;
      font-weight: 800;
      white-space: nowrap;
    }

    .tier__art { inline-size: 74px; align-self: center; }
    .tier--best .tier__art { inline-size: 88px; }

    .qty {
      font-size: var(--tt-text-xl);
      font-weight: 900;
      letter-spacing: -0.02em;
      line-height: 1;
    }

    .meter {
      display: block;
      inline-size: 100%;
      block-size: 4px;
      border-radius: var(--tt-radius-pill);
      background: var(--tt-surface-3);
      overflow: hidden;
    }
    .meter__fill {
      display: block;
      block-size: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--tt-gold-600), var(--tt-gold-400));
      transition: inline-size var(--tt-duration-slow) var(--tt-ease-out);
    }

    .per-unit { color: var(--tt-text-faint); font-size: var(--tt-text-xs); }
    .per-unit__label { color: var(--tt-text-faint); }

    .tier__buy {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--tt-space-2);
      inline-size: 100%;
      margin-block-start: auto;
      padding-block-start: var(--tt-space-2);
      border-block-start: 1px solid var(--tt-border);
    }
    .tier__go { color: var(--tt-text-faint); flex: none; }
    .tier:hover .tier__go { color: var(--tt-brand-400); }

    /* --- Phone: a swipeable rail ------------------------------------------ */
    @media (max-width: 959px) {
      /* Pull out to the viewport edges so a tier can be cut by the screen. */
      .rail {
        /* Matches the page gutter, which is fluid. A hard value here would
           stop reaching the viewport edge the moment the gutter grew. */
        margin-inline: calc(var(--tt-gutter) * -1);
      }
      .ladder {
        /* Wide enough to read, narrow enough that the next tier is visibly
           cut by the screen edge, which is the affordance. */
        grid-auto-columns: min(60%, 210px);
        gap: var(--tt-space-2);
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        padding-inline: var(--tt-gutter);
        padding-block-end: var(--tt-space-2);
        /* Scrollbar hidden: this is a product rail, not a document pane. */
        scrollbar-width: none;
        overscroll-behavior-x: contain;
      }
      .ladder::-webkit-scrollbar { display: none; }
      .tier { scroll-snap-align: start; }
      .tier__link { padding: var(--tt-space-3); }
      .tier__art { inline-size: 64px; }
      .tier--best .tier__art { inline-size: 74px; }
      .qty { font-size: var(--tt-text-lg); }
    }

    /* --- Wide: a row of tiers, the best one lifted ------------------------ */
    @media (min-width: 960px) {
      .ladder { align-items: end; }
      .tier--best {
        transform: translateY(-10px);
        box-shadow: var(--tt-ring-gold), var(--tt-shadow-2);
      }
      .tier__art { inline-size: 84px; }
      .tier--best .tier__art { inline-size: 100px; }
    }
  `],
})
export class BundleLadderComponent {
  @Input({ required: true }) productSlug = '';

  tierFor(row: { readonly variant: { readonly quantityValue?: number } }): CoinTier {
    return tierForAmount(row.variant.quantityValue);
  }

  /** The product's offers and variants, already loaded by the caller. */
  @Input() set detail(detail: ProductDetail | null | undefined) {
    if (!detail) {
      this.rows = [];
      return;
    }
    this.build(detail.offers, detail.product.variants);
  }

  rows: OfferValue[] = [];

  private build(offers: readonly Offer[], variants: readonly ProductVariant[]): void {
    // One platform and region only. Comparing a PS5 price against a PC price
    // would rank the platforms rather than the bundles.
    const first = offers[0];
    if (!first) {
      this.rows = [];
      return;
    }

    const comparable = offers.filter(
      (offer) => offer.platformId === first.platformId && offer.regionId === first.regionId,
    );

    this.rows = rankByValue(comparable, variants)
      .filter((row) => row.perUnitMinor !== undefined)
      .sort((a, b) => (a.variant.quantityValue ?? 0) - (b.variant.quantityValue ?? 0));
  }

  label(row: OfferValue): string {
    const quantity = formatQuantity(row.variant.quantityValue);
    return quantity || row.variant.name.he;
  }

  /**
   * Bar length, scaled so the best tier fills it and the worst still shows.
   *
   * Value is the inverse of price per unit: cheaper per coin is a longer bar.
   * The floor of 30% stops the weakest tier reading as worthless.
   */
  fillPercent(row: OfferValue): number {
    const perUnits = this.rows
      .map((entry) => entry.perUnitMinor)
      .filter((value): value is number => value !== undefined);

    if (perUnits.length === 0 || row.perUnitMinor === undefined) {
      return 0;
    }

    const best = Math.min(...perUnits);
    const worst = Math.max(...perUnits);
    if (worst === best) {
      return 100;
    }

    const ratio = (worst - row.perUnitMinor) / (worst - best);
    return Math.round(30 + ratio * 70);
  }
}
