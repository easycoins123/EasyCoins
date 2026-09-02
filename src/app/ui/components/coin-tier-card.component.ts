import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { LocalizePipe } from '../../core/i18n';
import { OfferValue, formatQuantity, savedAmount } from '../../core/value';
import { LocalizedText, Money, Offer } from '../../domain';
import { MoneyPipe } from '../money.pipe';
import { CoinPackComponent } from './coin-pack.component';
import { IconComponent } from './icon.component';

/**
 * One coin bundle, as a shop shelf shows it.
 *
 * The store used to list the coin product as a single card reading
 * "100K–2M, from 49 ₪", which told a customer nothing they could act on. A
 * bundle is what people buy, so each bundle is a card: its own artwork at its
 * own tier, the quantity at display size, the price in gold, what a million
 * costs at that tier, and a button that puts it in the cart.
 *
 * The artwork is a link to the product page, where the platform and region are
 * chosen. The button adds the default offer directly, which is the one the
 * price on the card belongs to. Every figure comes from a priced offer; the
 * "best value" flag is a ranking this component was handed, never a claim
 * about what other people bought.
 */
@Component({
  selector: 'tt-tier-card',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, MoneyPipe, CoinPackComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card" [class.card--best]="row.isBestValue">
      <a class="media"
         [routerLink]="['/products', productSlug, row.variant.id]"
         [attr.aria-label]="'לפרטי חבילת ' + label">
        <tt-coin-pack class="media__art" [steps]="rank"></tt-coin-pack>
        <span class="flag" *ngIf="row.isBestValue">
          <tt-icon name="lightning" [size]="11"></tt-icon> הכי משתלם
        </span>
        <span class="flag flag--save" *ngIf="saved as amount">חוסכים {{ amount | money }}</span>
      </a>

      <div class="body">
        <p class="name">{{ productName | t }}</p>
        <p class="qty tt-numeric">{{ label }}</p>
        <p class="rate tt-numeric" *ngIf="perMillion as rate">
          {{ rate | money }} <span>למיליון</span>
        </p>
      </div>

      <div class="foot">
        <span class="price">
          <span class="tt-price tt-numeric">{{ row.offer.price.current | money }}</span>
          <span class="was tt-numeric" *ngIf="row.offer.price.compareAt as was">{{ was | money }}</span>
        </span>
        <button type="button"
                class="tt-btn tt-btn--buy tt-btn--sm buy"
                [disabled]="busy"
                (click)="buy.emit(row.offer)">
          <tt-icon name="cart" [size]="15"></tt-icon>
          הוספה לסל
        </button>
      </div>
    </article>
  `,
  styles: [`
    :host { display: block; block-size: 100%; }

    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      block-size: 100%;
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-lg);
      overflow: hidden;
      transition: transform var(--tt-duration-fast) var(--tt-ease),
                  border-color var(--tt-duration-fast) var(--tt-ease),
                  box-shadow var(--tt-duration) var(--tt-ease);
    }
    .card:hover { transform: translateY(-3px); border-color: var(--tt-border-strong); box-shadow: var(--tt-shadow-2); }
    .card--best { border-color: var(--tt-gold-500); }
    .card--best:hover { box-shadow: var(--tt-ring-gold), var(--tt-shadow-2); }

    .media {
      position: relative;
      display: grid;
      place-items: center;
      aspect-ratio: 5 / 4;
      overflow: hidden;
      background:
        radial-gradient(70% 60% at 50% 62%, var(--tt-brand-tint), transparent 72%),
        var(--tt-bg-elevated);
    }
    .card--best .media {
      background:
        radial-gradient(70% 60% at 50% 62%, var(--tt-gold-tint), transparent 72%),
        var(--tt-bg-elevated);
    }
    .media__art { inline-size: 62%; transition: transform var(--tt-duration-slow) var(--tt-ease-out); }
    .card:hover .media__art { transform: translateY(-3px) scale(1.03); }

    .flag {
      position: absolute;
      inset-block-start: var(--tt-space-2);
      inset-inline-start: var(--tt-space-2);
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0.15rem 0.45rem;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-gold-500);
      color: var(--tt-text-on-gold);
      font-size: 10px;
      font-weight: 800;
      line-height: 1.6;
      white-space: nowrap;
    }
    .flag--save { inset-inline-start: auto; inset-inline-end: var(--tt-space-2); background: var(--tt-surface-3); color: var(--tt-gold-300); }

    .body { display: flex; flex-direction: column; padding: var(--tt-space-3) var(--tt-space-3) var(--tt-space-2); flex: 1; }
    .name { margin: 0; font-size: var(--tt-text-xs); font-weight: 600; color: var(--tt-text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qty {
      margin: 2px 0 0;
      font-size: var(--tt-text-2xl);
      font-weight: 900;
      line-height: 1.05;
      letter-spacing: -0.025em;
      direction: ltr;
      unicode-bidi: isolate;
      text-align: end;
    }
    .rate { margin: 4px 0 0; font-size: var(--tt-text-xs); color: var(--tt-text-faint); }
    .rate span { color: var(--tt-text-faint); }

    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--tt-space-2);
      padding: var(--tt-space-2) var(--tt-space-3) var(--tt-space-3);
      border-block-start: 1px solid var(--tt-border);
    }
    .price { display: flex; flex-direction: column; gap: 1px; min-inline-size: 0; }
    .price .tt-price { font-size: var(--tt-text-xl); }
    .was { font-size: var(--tt-text-xs); color: var(--tt-text-faint); text-decoration: line-through; }
    .buy { min-block-size: 38px; white-space: nowrap; flex: none; }

    /* Two cards across a phone leave no room for a price beside a button, so
       the foot stacks: price row, then a full-width action. */
    @media (max-width: 480px) {
      .foot { flex-direction: column; align-items: stretch; gap: var(--tt-space-2); }
      .price { flex-direction: row; align-items: baseline; justify-content: space-between; gap: 6px; }
      .price .tt-price { font-size: var(--tt-text-lg); }
      .qty { font-size: var(--tt-text-xl); }
      .buy { inline-size: 100%; }
    }
  `],
})
export class CoinTierCardComponent {
  @Input({ required: true }) row!: OfferValue;
  /** Position in the range, one through five, which drives the artwork. */
  @Input() rank = 1;
  @Input({ required: true }) productSlug = '';
  @Input({ required: true }) productName!: LocalizedText;
  @Input() busy = false;

  @Output() readonly buy = new EventEmitter<Offer>();

  get label(): string {
    return formatQuantity(this.row.variant.quantityValue) || this.row.variant.name.he;
  }

  get perMillion(): Money | undefined {
    return this.row.perUnitMinor === undefined
      ? undefined
      : { amountMinor: this.row.perUnitMinor, currency: this.row.offer.price.current.currency };
  }

  get saved(): Money | undefined {
    return savedAmount(this.row.offer.price);
  }
}
