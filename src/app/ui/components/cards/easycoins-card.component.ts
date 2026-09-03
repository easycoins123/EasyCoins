import {
  ChangeDetectionStrategy, Component, EventEmitter, HostBinding, Input, Output, computed, signal,
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
 * The EasyCoins package card, as the reference sets it.
 *
 * Top to bottom: the amount, huge, with COINS under it; a fact chip where the
 * data supports one; the bundle's own artwork, which grows with the bundle;
 * the price; the action. One card on the shelf is featured, the one the
 * numbers say is the best value, and it alone carries the gold frame and the
 * gold button, so the eye lands where the value is.
 *
 * Everything important is text. The art is decorative and the card is fully
 * understandable with it removed. Tier colour appears on the chip and the
 * hover edge; the coin stays black and gold.
 *
 * The art links to the product page, where platform and region are chosen;
 * the button adds this exact offer to the cart and confirms in place once the
 * server has answered.
 */
@Component({
  selector: 'tt-easycoins-card',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, MoneyPipe, CoinArtComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card"
             [class.card--featured]="featured"
             [class.card--out]="!product.inStock"
             [attr.data-tier]="product.tier"
             [style.--tier]="tier.color"
             [style.--tier-glow]="tier.glow">
      <span class="ribbon" *ngIf="featured" aria-hidden="true">הכי משתלם</span>

      <div class="head">
        <p class="qty">
          <span class="amount tt-figure">{{ amountLabel }}</span>
          <span class="qty__unit">COINS</span>
        </p>
        <span class="chip" *ngIf="chip && !featured">{{ chip }}</span>
      </div>

      <a class="media" [routerLink]="['/products', product.productSlug, product.variantId]"
         [attr.aria-label]="'לפרטי חבילת ' + amountLabel + ' קוינס'">
        <tt-coin-art class="media__art" variant="bundle" [amount]="product.amount" [tier]="product.tier" [artKey]="product.artKey"></tt-coin-art>
      </a>

      <p class="meta">
        <span class="platform"><tt-icon [name]="platformIcon" [size]="14"></tt-icon>{{ product.platformLabel | t }}</span>
        <span class="edition">{{ edition }}</span>
        <span class="rate tt-numeric" *ngIf="perMillion as rate">{{ rate | money }} / מיליון</span>
      </p>

      <p class="price">
        <span class="tt-price">{{ product.offer.price.current | money }}</span>
        <span class="was tt-numeric" *ngIf="product.offer.price.compareAt as was">{{ was | money }}</span>
        <span class="saving" *ngIf="saved as amount">חוסכים {{ amount | money }}</span>
      </p>

      <button type="button"
              class="tt-btn buy"
              [class.tt-btn--buy]="featured"
              [class.tt-btn--ghost]="!featured"
              [class.tt-btn--loading]="loading()"
              [class.tt-btn--done]="done()"
              [attr.aria-busy]="loading() ? 'true' : null"
              [disabled]="!product.inStock || (busyState() && !done())"
              (click)="add()">
        <ng-container *ngIf="!product.inStock">אזל מהמלאי</ng-container>
        <ng-container *ngIf="product.inStock && !done()"><tt-icon name="cart" [size]="15"></tt-icon> הוספה לסל</ng-container>
        <ng-container *ngIf="product.inStock && done()"><tt-icon name="check" [size]="15"></tt-icon> נוסף לסל</ng-container>
      </button>
    </article>
  `,
  styles: [`
    :host { display: block; block-size: 100%; container-type: inline-size; }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      block-size: 100%;
      padding: var(--tt-space-4) var(--tt-space-3) var(--tt-space-3);
      background: linear-gradient(180deg, #17161A 0%, var(--tt-surface) 55%, #121110 100%);
      border: 1px solid var(--tt-border-strong);
      border-radius: var(--tt-radius-lg);
      overflow: hidden;
      text-align: center;
      transition: transform var(--tt-duration-fast) var(--tt-ease),
                  border-color var(--tt-duration-fast) var(--tt-ease),
                  box-shadow var(--tt-duration) var(--tt-ease);
    }
    .card::before {
      content: '';
      position: absolute;
      inset-inline: 0;
      inset-block-start: 0;
      block-size: 1px;
      background: linear-gradient(90deg, transparent, rgba(255, 248, 235, 0.16), transparent);
    }
    .card:hover { transform: translateY(-3px); border-color: var(--tier); box-shadow: 0 18px 44px rgba(0, 0, 0, 0.5); }
    .card--featured {
      border-color: var(--tt-gold-500);
      box-shadow: 0 0 0 1px rgba(212, 180, 106, 0.25), inset 0 0 0 1px rgba(212, 180, 106, 0.12), 0 18px 44px rgba(0, 0, 0, 0.5);
      background: linear-gradient(180deg, #1B1912 0%, var(--tt-surface) 55%, #121110 100%);
    }
    .card--featured:hover { border-color: var(--tt-gold-400); }

    .ribbon {
      position: absolute;
      inset-block-start: 14px;
      inset-inline-end: -34px;
      padding: 0.2rem 2.6rem;
      background: var(--tt-gold-metal);
      color: var(--tt-text-on-gold);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.04em;
      transform: rotate(45deg);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }
    [dir='rtl'] .ribbon { transform: rotate(-45deg); }

    .head { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .qty { display: flex; flex-direction: column; align-items: center; margin: 0; line-height: 1; }
    .amount { font-size: 2.6rem; }
    .qty__unit { margin-block-start: 2px; font-size: var(--tt-caption); font-weight: 800; letter-spacing: 0.22em; color: var(--tt-text-muted); direction: ltr; }
    .card--featured .amount { color: var(--tt-gold-400); }
    .chip {
      padding: 0.15rem 0.6rem;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-surface-3);
      border: 1px solid var(--tt-border-strong);
      color: var(--tt-text);
      font-size: 11px;
      font-weight: 800;
      transform: skewX(-8deg);
    }
    .card--featured .chip { background: var(--tt-gold-500); border-color: transparent; color: var(--tt-text-on-gold); }

    /* The art fills its frame: the composition already carries its own air. */
    .media { position: relative; display: block; inline-size: 100%; aspect-ratio: 4 / 3; margin-block: 0 var(--tt-space-1);
      background: radial-gradient(60% 55% at 50% 66%, var(--tier-glow), transparent 72%); }
    .media__art { position: absolute; inset: -9% -8%; inline-size: 116%; filter: drop-shadow(0 14px 18px rgba(0, 0, 0, 0.55)); transition: transform var(--tt-duration-slow) var(--tt-ease-out); }
    .media__art ::ng-deep .art, .media__art ::ng-deep .raster { block-size: 100%; }
    .media__art ::ng-deep img, .media__art ::ng-deep .art { object-fit: contain; block-size: 100%; }
    .card:hover .media__art { transform: translateY(-3px) scale(1.03); }
    .card--out .media__art { filter: grayscale(0.7) opacity(0.55); }

    .meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 10px; margin: 0; font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text-faint); }
    .platform { display: inline-flex; align-items: center; gap: 4px; color: var(--tt-text-muted); }
    .rate { color: var(--tt-text-faint); }

    .price { display: flex; flex-direction: column; align-items: center; gap: 2px; margin: var(--tt-space-2) 0 var(--tt-space-3); }
    .price .tt-price { font-size: 2.2rem; color: var(--tt-text); }
    .card--featured .price .tt-price { color: var(--tt-gold-400); font-size: 2.5rem; }
    .was { font-size: var(--tt-caption); color: var(--tt-text-faint); text-decoration: line-through; }
    .saving { font-size: var(--tt-caption); font-weight: 700; color: var(--tt-gold-400); }

    .buy { inline-size: 100%; min-block-size: 42px; margin-block-start: auto; white-space: nowrap; font-weight: 800; }
    .tt-btn--ghost.buy { border-color: var(--tt-border-strong); background: rgba(255, 248, 235, 0.03); }
    .tt-btn--ghost.buy:hover:not(:disabled) { border-color: var(--tt-gold-500); color: var(--tt-gold-300); }

    @container (max-width: 200px) {
      .amount { font-size: 2rem; }
      .price .tt-price { font-size: 1.6rem; }
      .card--featured .price .tt-price { font-size: 1.8rem; }
      .meta .rate { display: none; }
    }
    @container (min-width: 300px) {
      .amount { font-size: 2.9rem; }
    }

    /* The flagship: on a phone, the last card of an odd shelf spans the row
       and lays out sideways, art beside the facts, instead of sitting alone. */
    @media (max-width: 700px) {
      :host(.flagship) .card {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
        grid-template-areas: 'head media' 'meta media' 'price media' 'buy media';
        column-gap: var(--tt-space-3);
        align-items: center;
        text-align: start;
        padding: var(--tt-space-4);
      }
      :host(.flagship) .head { grid-area: head; align-items: flex-start; }
      :host(.flagship) .qty { align-items: flex-start; }
      :host(.flagship) .amount { font-size: 3rem; }
      :host(.flagship) .media { grid-area: media; aspect-ratio: 1; margin: 0; align-self: stretch; }
      :host(.flagship) .meta { grid-area: meta; justify-content: flex-start; }
      :host(.flagship) .price { grid-area: price; align-items: flex-start; margin-block: var(--tt-space-2); }
      :host(.flagship) .buy { grid-area: buy; margin-block-start: 0; }
    }
  `],
})
export class EasyCoinsCardComponent {
  @Input({ required: true }) product!: CoinProduct;
  /** The card the numbers single out. Only one per shelf. */
  @Input() featured = false;
  /** Spans the row and lays out sideways on a phone; the shelf sets it on its last odd card. */
  @Input() @HostBinding('class.flagship') flagship = false;
  /** A short, data-backed fact for the chip ("הכי זול", "הכי גדולה"). */
  @Input() chip?: string;

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
