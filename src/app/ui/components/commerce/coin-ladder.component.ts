import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, QueryList, ViewChildren, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { LocalizePipe } from '../../../core/i18n';
import { roleLabel } from '../../../core/commerce';
import { formatQuantity } from '../../../core/value';
import { CoinProduct, Offer } from '../../../domain';
import { MoneyPipe } from '../../money.pipe';
import { IconComponent } from '../icon.component';

/**
 * The whole ladder, comparable at a glance.
 *
 * One row per bundle: amount and role, launch bonus, total received, price,
 * price per million received, one action. A row of amount chips above it
 * answers "how many coins?" with a tap: the ladder scrolls to that size and
 * lights it. Eleven bundles as eleven big cards would be a wall; as rows
 * they are a price list a player reads top to bottom in ten seconds.
 */
@Component({
  selector: 'tt-coin-ladder',
  standalone: true,
  imports: [CommonModule, RouterLink, LocalizePipe, MoneyPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ladder" *ngIf="products.length > 0">
      <div class="ask">
        <p class="ask__q">כמה קוינס בא לך?</p>
        <div class="chips" role="group" aria-label="בחירת כמות">
          <button type="button" class="chip" *ngFor="let product of products"
                  [class.chip--on]="highlight() === product.amount"
                  (click)="focusRow(product.amount)">
            <span class="tt-numeric">{{ label(product.amount) }}</span>
          </button>
        </div>
      </div>

      <div class="table" role="table" aria-label="סולם החבילות">
        <div class="thead" role="row" aria-hidden="true">
          <span>חבילה</span><span>בונוס השקה</span><span>מקבלים</span><span>מחיר</span><span>למיליון</span><span></span>
        </div>
        <div class="row" role="row" #row
             *ngFor="let product of products; trackBy: trackById"
             [attr.data-amount]="product.amount"
             [class.row--on]="highlight() === product.amount"
             [class.row--best]="product.badge === 'best-value'"
             [class.row--out]="!product.inStock">
          <span class="cell cell--pack" role="cell">
            <a class="pack" [routerLink]="['/products', product.productSlug, product.variantId]">
              <span class="pack__amount tt-figure">{{ label(product.amount) }}</span>
              <span class="pack__role" *ngIf="roleOf(product) as role">{{ role }}</span>
            </a>
          </span>
          <span class="cell cell--bonus" role="cell">
            <ng-container *ngIf="product.bonus > 0; else noBonus">
              <span class="bonus tt-numeric">+{{ label(product.bonus) }}</span>
            </ng-container>
            <ng-template #noBonus><span class="tt-faint">—</span></ng-template>
          </span>
          <span class="cell cell--total" role="cell">
            <span class="total tt-numeric">{{ label(product.totalCoins) }}</span>
            <span class="cell__label">קוינס</span>
          </span>
          <span class="cell cell--price" role="cell">
            <span class="price tt-price">{{ product.offer.price.current | money }}</span>
            <span class="was tt-numeric" *ngIf="product.offer.price.compareAt as was">{{ was | money }}</span>
          </span>
          <span class="cell cell--rate" role="cell">
            <span class="rate tt-numeric" *ngIf="product.effectivePerMillionIls as rate">₪{{ rate | number:'1.0-0' }}</span>
            <span class="cell__label" *ngIf="product.bonus > 0">כולל בונוס</span>
          </span>
          <span class="cell cell--act" role="cell">
            <button type="button" class="tt-btn tt-btn--sm buy"
                    [class.tt-btn--buy]="product.badge === 'best-value' || highlight() === product.amount"
                    [class.tt-btn--ghost]="product.badge !== 'best-value' && highlight() !== product.amount"
                    [disabled]="!product.inStock || busy"
                    (click)="buy.emit(product.offer)">
              <ng-container *ngIf="product.inStock; else out"><tt-icon name="cart" [size]="14"></tt-icon> הוספה</ng-container>
              <ng-template #out>אזל</ng-template>
            </button>
          </span>
        </div>
      </div>
      <p class="fine tt-faint">
        המחיר לכל חבילה ולכל מיליון מוצג לפני התשלום. הבונוס מופיע בעגלה, בקופה ובדף ההזמנה, ומגיע יחד עם הקוינס.
      </p>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ask { display: flex; align-items: center; gap: var(--tt-space-4); flex-wrap: wrap; margin-block-end: var(--tt-space-4); }
    .ask__q { margin: 0; font-family: var(--tt-font-display); font-weight: 900; font-size: var(--tt-text-xl); letter-spacing: -0.01em; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { min-inline-size: 58px; padding: 7px 12px; border-radius: var(--tt-radius-pill); border: 1px solid var(--tt-border-strong); background: var(--tt-surface-2); color: var(--tt-text); font: inherit; font-weight: 800; font-size: var(--tt-text-sm); cursor: pointer; transition: border-color var(--tt-duration) var(--tt-ease), background-color var(--tt-duration) var(--tt-ease); }
    .chip:hover { border-color: var(--tt-gold-600); }
    .chip--on { border-color: var(--tt-gold-500); background: var(--tt-gold-tint); color: var(--tt-gold-400); }

    .table { border: 1px solid var(--tt-border); border-radius: var(--tt-radius-lg); overflow: hidden; background: var(--tt-surface); }
    .thead, .row { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr 0.9fr auto; align-items: center; gap: var(--tt-space-3); padding: var(--tt-space-3) var(--tt-space-4); }
    .thead { font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text-faint); letter-spacing: 0.04em; border-block-end: 1px solid var(--tt-border); background: var(--tt-surface-2); }
    .row { border-block-end: 1px solid var(--tt-border); transition: background-color var(--tt-duration) var(--tt-ease); scroll-margin-block-start: calc(var(--tt-header-height) + var(--tt-space-4)); }
    .row:last-child { border-block-end: 0; }
    .row:hover { background: rgba(255, 248, 235, 0.02); }
    .row--on { background: var(--tt-gold-tint); box-shadow: inset 3px 0 0 var(--tt-gold-500); }
    .row--best { background: linear-gradient(90deg, rgba(212, 180, 106, 0.1), transparent 60%); }
    .row--out { opacity: 0.55; }
    .cell { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
    .cell__label { font-size: 10px; font-weight: 700; color: var(--tt-text-faint); letter-spacing: 0.04em; }
    .pack { display: flex; align-items: center; gap: var(--tt-space-2); min-block-size: 44px; color: inherit; }
    .pack:hover { text-decoration: none; }
    .pack__amount { font-size: 1.5rem; }
    .pack__role { padding: 2px 8px; border-radius: var(--tt-radius-pill); border: 1px solid var(--tt-gold-600); color: var(--tt-gold-400); font-size: 10px; font-weight: 800; letter-spacing: 0.04em; white-space: nowrap; }
    .row--best .pack__role { background: var(--tt-gold-metal); color: var(--tt-text-on-gold); border-color: transparent; }
    .bonus { font-weight: 800; color: var(--tt-gold-400); direction: ltr; unicode-bidi: isolate; }
    .total { font-weight: 900; font-size: var(--tt-text-lg); color: var(--tt-text); }
    .price { font-size: 1.35rem; color: var(--tt-text); }
    .was { font-size: var(--tt-caption); color: var(--tt-text-faint); text-decoration: line-through; }
    .rate { font-weight: 800; color: var(--tt-text-muted); }
    .buy { min-inline-size: 104px; min-block-size: 40px; }
    .fine { margin: var(--tt-space-3) 0 0; font-size: var(--tt-caption); }

    @media (max-width: 860px) {
      .thead { display: none; }
      .row { grid-template-columns: 1fr auto; grid-template-areas: 'pack price' 'bonus total' 'rate act'; row-gap: var(--tt-space-2); }
      .cell--pack { grid-area: pack; }
      .cell--price { grid-area: price; align-items: flex-end; }
      .cell--bonus { grid-area: bonus; flex-direction: row; align-items: baseline; gap: 6px; }
      .cell--bonus::before { content: 'בונוס'; font-size: 10px; font-weight: 700; color: var(--tt-text-faint); }
      .cell--total { grid-area: total; flex-direction: row; align-items: baseline; gap: 6px; justify-content: flex-end; }
      .cell--rate { grid-area: rate; flex-direction: row; align-items: baseline; gap: 6px; }
      .cell--rate::before { content: 'למיליון'; font-size: 10px; font-weight: 700; color: var(--tt-text-faint); }
      .cell--act { grid-area: act; align-items: flex-end; }
      .buy { min-inline-size: 120px; }
    }
  `],
})
export class CoinLadderComponent {
  @Input() products: readonly CoinProduct[] = [];
  @Input() busy = false;
  @Output() readonly buy = new EventEmitter<Offer>();

  @ViewChildren('row') private readonly rows?: QueryList<ElementRef<HTMLElement>>;

  readonly highlight = signal<number | undefined>(undefined);

  label(value: number): string {
    return formatQuantity(value);
  }

  roleOf(product: CoinProduct): string | undefined {
    return roleLabel(product.role);
  }

  trackById(_index: number, product: CoinProduct): string {
    return product.id;
  }

  /** Lights the row for that amount and brings it into view. */
  focusRow(amount: number): void {
    this.highlight.set(amount);
    const row = this.rows?.find((entry) => Number(entry.nativeElement.dataset['amount']) === amount);
    row?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
