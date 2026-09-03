import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { LocalizePipe } from '../../core/i18n';
import { OfferValue, formatQuantity, savedAmount } from '../../core/value';
import { LocalizedText, Money, Offer } from '../../domain';
import { MoneyPipe } from '../money.pipe';
import { Material, materialForStep } from '../materials';
import { CoinPackComponent } from './coin-pack.component';
import { IconComponent } from './icon.component';

/**
 * One coin bundle, as a shop shelf shows it.
 *
 * Each bundle is its own object in its own material: the artwork at its
 * tier, the quantity at display size, the price in gold, what a million costs
 * at that tier, and a button that puts it in the cart. The frame, the glow and
 * the small material label all follow the tier, so five cards side by side
 * read as a progression rather than five copies.
 *
 * The artwork links to the product page, where platform and region are chosen.
 * The button adds the default offer directly, the one the card's price belongs
 * to, and confirms in place for a moment before returning to its label.
 */
@Component({
  selector: 'tt-tier-card',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, MoneyPipe, CoinPackComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card"
             [class.card--best]="row.isBestValue"
             [class.card--elite]="material.name === 'elite'"
             [style.--mat]="material.color"
             [style.--mat-glow]="material.glow">
      <a class="media" [routerLink]="['/products', productSlug, row.variant.id]" [attr.aria-label]="'לפרטי חבילת ' + label">
        <span class="mat">{{ material.labelHe }}</span>
        <tt-coin-pack class="media__art" [steps]="rank"></tt-coin-pack>
        <span class="flag" *ngIf="row.isBestValue">
          <tt-icon name="lightning" [size]="11"></tt-icon> הכי משתלם
        </span>
        <span class="flag flag--save" *ngIf="saved as amount">חוסכים {{ amount | money }}</span>
      </a>

      <div class="body">
        <p class="name">{{ productName | t }}</p>
        <p class="qty tt-figure">{{ label }}</p>
        <p class="rate" *ngIf="perMillion as rate">
          <span class="rate__chip tt-numeric">{{ rate | money }} למיליון</span>
        </p>
      </div>

      <div class="foot">
        <span class="price">
          <span class="tt-price">{{ row.offer.price.current | money }}</span>
          <span class="was tt-numeric" *ngIf="row.offer.price.compareAt as was">{{ was | money }}</span>
        </span>
        <button type="button"
                class="tt-btn tt-btn--buy tt-btn--sm buy"
                [class.tt-btn--loading]="loading()"
                [class.tt-btn--done]="done()"
                [attr.aria-busy]="loading() ? 'true' : null"
                [disabled]="busyState() && !done()"
                (click)="add()">
          <ng-container *ngIf="!done()"><tt-icon name="cart" [size]="15"></tt-icon> הוספה לסל</ng-container>
          <ng-container *ngIf="done()"><tt-icon name="check" [size]="15"></tt-icon> נוסף לסל</ng-container>
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
      border-radius: var(--tt-radius-xl);
      overflow: hidden;
      transition: transform var(--tt-duration-fast) var(--tt-ease),
                  border-color var(--tt-duration-fast) var(--tt-ease),
                  box-shadow var(--tt-duration) var(--tt-ease);
    }
    /* Hover is a lift and the material on the edge. No halo: five glowing
       cards in a row is a slot machine, not a shelf. */
    .card:hover { transform: translateY(-3px); border-color: var(--mat); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45); }
    .card--best { border-color: var(--tt-gold-500); }
    .card--elite { background: linear-gradient(180deg, #0F0D0A, var(--tt-surface) 40%); }

    .media {
      position: relative;
      display: grid;
      place-items: center;
      aspect-ratio: 5 / 4;
      overflow: hidden;
      background:
        radial-gradient(70% 60% at 50% 62%, var(--mat-glow), transparent 72%),
        repeating-linear-gradient(99deg, rgba(255, 248, 235, 0.03) 0 1px, transparent 1px 22px),
        var(--tt-bg-elevated);
    }
    .media__art { inline-size: 64%; filter: drop-shadow(0 16px 20px rgba(0, 0, 0, 0.5)); transition: transform var(--tt-duration-slow) var(--tt-ease-out); }
    .card:hover .media__art { transform: translateY(-4px) scale(1.04); }

    .mat {
      position: absolute;
      inset-block-end: var(--tt-space-2);
      inset-inline-end: var(--tt-space-2);
      padding: 0.15rem 0.5rem;
      border: 1px solid var(--mat);
      border-radius: var(--tt-radius-pill);
      color: var(--mat);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.1em;
      background: rgba(12, 11, 9, 0.55);
    }
    .flag {
      position: absolute;
      inset-block-start: var(--tt-space-2);
      inset-inline-start: var(--tt-space-2);
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
    .flag--save { inset-inline-start: auto; inset-inline-end: var(--tt-space-2); background: var(--tt-surface-3); color: var(--tt-gold-300); }

    .body { display: flex; flex-direction: column; padding: var(--tt-space-3) var(--tt-space-3) var(--tt-space-2); flex: 1; }
    .name { margin: 0; font-size: var(--tt-text-xs); font-weight: 600; color: var(--tt-text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qty { margin: 2px 0 0; font-size: 2.5rem; text-align: end; }
    .rate { margin: 6px 0 0; }
    .rate__chip { display: inline-block; padding: 0.15rem 0.5rem; border-radius: var(--tt-radius-sm); background: var(--tt-surface-2); color: var(--tt-text-muted); font-size: var(--tt-text-xs); }

    .foot { display: flex; align-items: center; justify-content: space-between; gap: var(--tt-space-2); padding: var(--tt-space-2) var(--tt-space-3) var(--tt-space-3); border-block-start: 1px solid var(--tt-border); }
    .price { display: flex; flex-direction: column; gap: 1px; min-inline-size: 0; }
    .price .tt-price { font-size: 1.7rem; }
    .was { font-size: var(--tt-text-xs); color: var(--tt-text-faint); text-decoration: line-through; }
    .buy { min-block-size: 38px; white-space: nowrap; flex: none; }

    @media (max-width: 480px) {
      .foot { flex-direction: column; align-items: stretch; gap: var(--tt-space-2); }
      .price { flex-direction: row; align-items: baseline; justify-content: space-between; gap: 6px; }
      .price .tt-price { font-size: 1.5rem; }
      .qty { font-size: 2.1rem; }
      .buy { inline-size: 100%; }
    }
  `],
})
export class CoinTierCardComponent {
  @Input({ required: true }) row!: OfferValue;
  @Input() rank = 1;
  @Input({ required: true }) productSlug = '';
  @Input({ required: true }) productName!: LocalizedText;

  /**
   * Whether the parent has a cart request in flight. The card watches the
   * transition back to idle: if it was this card that asked, the button
   * confirms. A confirmation that appears before the server answered would be
   * a lie the toast has to correct a second later.
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
  /** True from this card's click until the parent reports the request done. */
  readonly pending = signal(false);
  /** True for a moment after the bundle went into the cart. */
  readonly done = signal(false);
  readonly loading = computed(() => this.pending() && this.busyState());

  get material(): Material {
    return materialForStep(this.rank);
  }

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

  add(): void {
    if (this.done() || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.buy.emit(this.row.offer);
    // The parent's busy flag reaches this input on the next change detection.
    // If it never turns on (a synchronous add), confirm right away rather than
    // leaving the button waiting for a transition that will not come.
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
