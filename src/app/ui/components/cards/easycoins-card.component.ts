import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { LocalizePipe } from '../../../core/i18n';
import { formatQuantity, savedAmount } from '../../../core/value';
import { CoinProduct, GAME_EDITIONS, Money, Offer } from '../../../domain';
import { MoneyPipe } from '../../money.pipe';
import { IconComponent, IconName } from '../icon.component';
import { CoinArtComponent } from './coin-art.component';
import { TIERS, Tier } from './tiers';

/**
 * The EasyCoins card: one coin bundle as the shelf sells it.
 *
 * Reads top to bottom in the order a customer decides: the tier and any
 * data-backed badge, the artwork, the amount at display size (the one thing
 * that must be legible from across the room), the platform and edition, what
 * a million costs at this size, the price, and the action.
 *
 * Everything important is text. The art is decorative and the card is fully
 * understandable with it removed. Tier colour comes from the tier tokens, so
 * four cards side by side read as one family in four materials.
 *
 * The art links to the product page, where platform and region are chosen;
 * the button adds this exact offer to the cart and confirms in place once the
 * server has answered.
 *
 * Mobile and desktop are two layouts, not one scaled: the foot stacks and the
 * amount steps down when the card is narrow, driven by the card's own width
 * rather than the viewport, so the same card is right in a two-up phone grid,
 * a drawer, or a five-up desktop shelf.
 */
@Component({
  selector: 'tt-easycoins-card',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, MoneyPipe, CoinArtComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card"
             [class.card--best]="product.badge === 'best-value'"
             [class.card--out]="!product.inStock"
             [attr.data-tier]="product.tier"
             [style.--tier]="tier.color"
             [style.--tier-light]="tier.light"
             [style.--tier-deep]="tier.deep"
             [style.--tier-accent]="tier.accent"
             [style.--tier-glow]="tier.glow">
      <a class="media" [routerLink]="['/products', product.productSlug, product.variantId]"
         [attr.aria-label]="'לפרטי חבילת ' + amountLabel + ' קוינס'">
        <span class="tier">{{ tier.labelHe }}</span>
        <span class="flag" *ngIf="product.badge === 'best-value'">
          <tt-icon name="bolt" [size]="11"></tt-icon> הכי משתלם
        </span>
        <span class="flag flag--save" *ngIf="saved as amount">חוסכים {{ amount | money }}</span>
        <tt-coin-art class="media__art" [tier]="product.tier" [artKey]="product.artKey" variant="card"></tt-coin-art>
      </a>

      <div class="body">
        <p class="amount tt-figure">{{ amountLabel }}</p>
        <p class="meta">
          <span class="platform"><tt-icon [name]="platformIcon" [size]="14"></tt-icon>{{ product.platformLabel | t }}</span>
          <span class="edition">{{ edition }}</span>
        </p>
        <p class="rate" *ngIf="perMillion as rate">
          <span class="rate__chip tt-numeric">{{ rate | money }} למיליון</span>
        </p>
      </div>

      <div class="foot">
        <span class="price">
          <span class="tt-price">{{ product.offer.price.current | money }}</span>
          <span class="was tt-numeric" *ngIf="product.offer.price.compareAt as was">{{ was | money }}</span>
        </span>
        <button type="button"
                class="tt-btn tt-btn--buy tt-btn--sm buy"
                [class.tt-btn--loading]="loading()"
                [class.tt-btn--done]="done()"
                [attr.aria-busy]="loading() ? 'true' : null"
                [disabled]="!product.inStock || (busyState() && !done())"
                (click)="add()">
          <ng-container *ngIf="!product.inStock">אזל מהמלאי</ng-container>
          <ng-container *ngIf="product.inStock && !done()"><tt-icon name="cart" [size]="15"></tt-icon> הוספה לסל</ng-container>
          <ng-container *ngIf="product.inStock && done()"><tt-icon name="check" [size]="15"></tt-icon> נוסף לסל</ng-container>
        </button>
      </div>
    </article>
  `,
  styles: [`
    :host { display: block; block-size: 100%; container-type: inline-size; }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      block-size: 100%;
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-xl);
      overflow: hidden;
      transition: transform var(--tt-duration-fast) var(--tt-ease),
                  border-color var(--tt-duration-fast) var(--tt-ease),
                  box-shadow var(--tt-duration) var(--tt-ease);
    }
    .card:hover { transform: translateY(-3px); border-color: var(--tier); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); }
    .card--best { border-color: var(--tt-gold-500); }
    .card[data-tier='legend'] { background: linear-gradient(180deg, #0D0B09, var(--tt-surface) 42%); }

    .media {
      position: relative;
      display: grid;
      place-items: center;
      aspect-ratio: 5 / 4;
      overflow: hidden;
      background:
        radial-gradient(70% 60% at 50% 64%, var(--tier-glow), transparent 72%),
        repeating-linear-gradient(99deg, rgba(255, 248, 235, 0.03) 0 1px, transparent 1px 22px),
        var(--tt-bg-elevated);
    }
    /* Legend alone carries the prism, as a hairline. */
    .card[data-tier='legend'] .media::before {
      content: '';
      position: absolute;
      inset-inline: 0;
      inset-block-start: 0;
      block-size: 2px;
      background: var(--tt-tier-legend-prism);
      opacity: 0.75;
    }
    .media__art { inline-size: 74%; filter: drop-shadow(0 14px 18px rgba(0, 0, 0, 0.5)); transition: transform var(--tt-duration-slow) var(--tt-ease-out); }
    .card:hover .media__art { transform: translateY(-3px) scale(1.03); }
    .card--out .media__art { filter: grayscale(0.7) opacity(0.55); }

    .tier {
      position: absolute;
      inset-block-start: var(--tt-space-2);
      inset-inline-start: var(--tt-space-2);
      padding: 0.15rem 0.55rem;
      border: 1px solid var(--tier);
      border-radius: var(--tt-radius-pill);
      color: var(--tier);
      background: rgba(12, 11, 9, 0.6);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.1em;
    }
    .flag {
      position: absolute;
      inset-block-start: var(--tt-space-2);
      inset-inline-end: var(--tt-space-2);
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0.15rem 0.5rem;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-gold-500);
      color: var(--tt-text-on-gold);
      font-size: 10px;
      font-weight: 800;
      line-height: 1.6;
      white-space: nowrap;
      transform: skewX(-8deg);
    }
    .flag--save { inset-block-start: auto; inset-block-end: var(--tt-space-2); background: var(--tt-surface-3); color: var(--tt-gold-300); }

    .body { display: flex; flex-direction: column; padding: var(--tt-space-3) var(--tt-space-3) var(--tt-space-2); flex: 1; }
    .amount { margin: 0; font-size: 2.5rem; text-align: end; }
    .meta { display: flex; align-items: center; justify-content: space-between; gap: var(--tt-space-2); margin: 2px 0 0; font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text-muted); }
    .platform { display: inline-flex; align-items: center; gap: 5px; color: var(--tt-text); }
    .platform tt-icon { color: var(--tt-text-faint); }
    .edition { color: var(--tt-text-faint); letter-spacing: 0.04em; }
    .rate { margin: 6px 0 0; }
    .rate__chip { display: inline-block; padding: 0.15rem 0.5rem; border-radius: var(--tt-radius-sm); background: var(--tt-surface-2); color: var(--tt-text-muted); font-size: var(--tt-caption); }

    .foot { display: flex; align-items: center; justify-content: space-between; gap: var(--tt-space-2); padding: var(--tt-space-2) var(--tt-space-3) var(--tt-space-3); border-block-start: 1px solid var(--tt-border); }
    .price { display: flex; flex-direction: column; gap: 1px; min-inline-size: 0; }
    .price .tt-price { font-size: 1.7rem; }
    .was { font-size: var(--tt-caption); color: var(--tt-text-faint); text-decoration: line-through; }
    .buy { min-block-size: 38px; white-space: nowrap; flex: none; }

    /* Narrow card (a two-up phone grid): the foot stacks and the figure steps down. */
    @container (max-width: 215px) {
      .foot { flex-direction: column; align-items: stretch; }
      .price { flex-direction: row; align-items: baseline; justify-content: space-between; gap: 6px; }
      .price .tt-price { font-size: 1.5rem; }
      .amount { font-size: 2.1rem; }
      .buy { inline-size: 100%; }
      .media__art { inline-size: 80%; }
    }
    /* Wide card (a single column at 320px, or a spotlight): room for a larger figure. */
    @container (min-width: 300px) {
      .amount { font-size: 3rem; }
      .media__art { inline-size: 60%; }
    }
  `],
})
export class EasyCoinsCardComponent {
  @Input({ required: true }) product!: CoinProduct;

  /**
   * Whether the parent has a cart request in flight. The card watches the
   * transition back to idle: if it was this card that asked, the button
   * confirms. A confirmation before the server answered would be a lie the
   * toast has to correct a second later.
   */
  @Input() set busy(value: boolean) {
    const wasBusy = this.busyState();
    this.busyState.set(value);
    if (this.pending() && wasBusy && !value) {
      this.finish();
    }
  }

  @Output() readonly buy = new EventEmitter<Offer>();

  readonly busyState = signal(false);
  readonly pending = signal(false);
  readonly done = signal(false);
  readonly loading = computed(() => this.pending() && this.busyState());

  get tier(): Tier {
    return TIERS[this.product.tier];
  }

  get amountLabel(): string {
    return formatQuantity(this.product.amount) || this.product.offer.id;
  }

  get edition(): string {
    return GAME_EDITIONS[this.product.game].label;
  }

  get platformIcon(): IconName {
    return this.product.platform === 'pc' ? 'platform' : 'gamepad';
  }

  get perMillion(): Money | undefined {
    return this.product.perMillionIls === undefined
      ? undefined
      : { amountMinor: Math.round(this.product.perMillionIls * 100), currency: this.product.offer.price.current.currency };
  }

  get saved(): Money | undefined {
    return savedAmount(this.product.offer.price);
  }

  add(): void {
    if (this.done() || this.pending() || !this.product.inStock) {
      return;
    }
    this.pending.set(true);
    this.buy.emit(this.product.offer);
    setTimeout(() => {
      if (this.pending() && !this.busyState()) {
        this.finish();
      }
    }, 0);
  }

  private finish(): void {
    this.pending.set(false);
    this.done.set(true);
    setTimeout(() => this.done.set(false), 1400);
  }
}
