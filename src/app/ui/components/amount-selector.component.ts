import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  CoinPlan, coinRange, formatQuantity, planForQuantity, rankByValue,
} from '../../core/value';
import { Money, Offer, ProductDetail, ProductVariant } from '../../domain';
import { MoneyPipe } from '../money.pipe';
import { CoinPackComponent } from './coin-pack.component';
import { IconComponent } from './icon.component';

/** One purchasable bundle, as the picker presents it. */
interface Tier {
  readonly quantity: number;
  readonly label: string;
  readonly price: Money;
  readonly perMillion: Money;
  readonly best: boolean;
}

/**
 * "How many coins do you want?"
 *
 * This is the question the shop exists to answer, and it is answered with the
 * five bundles the shop actually sells, each with its price and its price per
 * million, so the value argument is read off the row rather than explained.
 * Choosing one is one press. The selected bundle is drawn large beside the
 * total and the action.
 *
 * Anyone who needs an amount between or beyond the bundles opens the second
 * step: a slider and a field. Whatever the number, it is filled from bundles
 * the server priced and the breakdown is shown. Nothing here computes a
 * price: it adds up prices that already exist. When the amount lands between
 * bundles the plan rounds up, because that is the only honest way to cover it,
 * and the extra is stated before anyone presses buy.
 */
@Component({
  selector: 'tt-amount-selector',
  standalone: true,
  imports: [CommonModule, MoneyPipe, CoinPackComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="picker" *ngIf="plan() as current">
      <header class="picker__head" *ngIf="heading">
        <h2>{{ heading }}</h2>
        <p>חמש חבילות במחיר סופי. ככל שהחבילה גדולה יותר, המחיר למיליון יורד.</p>
      </header>

      <div class="picker__body">
        <div class="tiers" role="radiogroup" aria-label="בחירת חבילה">
          <button type="button"
                  class="tier"
                  *ngFor="let tier of tiers; let i = index"
                  role="radio"
                  [attr.aria-checked]="requested() === tier.quantity"
                  [class.on]="requested() === tier.quantity"
                  [class.tier--best]="tier.best"
                  (click)="setAmount(tier.quantity)">
            <span class="tier__flag" *ngIf="tier.best">
              <tt-icon name="lightning" [size]="11"></tt-icon> הכי משתלם
            </span>
            <tt-coin-pack class="tier__art" [steps]="i + 1"></tt-coin-pack>
            <span class="tier__text">
              <span class="tier__qty tt-numeric">{{ tier.label }}</span>
              <span class="tier__rate tt-numeric">{{ tier.perMillion | money }} למיליון</span>
            </span>
            <span class="tier__price tt-numeric">{{ tier.price | money }}</span>
            <span class="tier__check" aria-hidden="true"><tt-icon name="check" [size]="12"></tt-icon></span>
          </button>
        </div>

        <!-- The second step, for amounts the chips do not cover. -->
        <details class="custom" [open]="customOpen()" (toggle)="onCustomToggle($event)">
          <summary>
            <tt-icon name="edit" [size]="15"></tt-icon>
            <span class="custom__title">צריכים כמות אחרת?</span>
            <span class="custom__hint">נרכיב אותה מהחבילות שיוצאות הכי משתלם</span>
            <tt-icon class="custom__sign" name="chevron" [size]="14"></tt-icon>
          </summary>
          <div class="custom__body">
            <label class="slider">
              <span class="tt-visually-hidden">כמות קוינס</span>
              <input type="range" class="tt-range"
                     [min]="range.min"
                     [max]="range.max"
                     [step]="range.step"
                     [value]="requested()"
                     (input)="onSlide($event)"
                     [attr.aria-valuetext]="display() + ' קוינס'" />
              <span class="slider__ends tt-numeric">
                <span>{{ label(range.min) }}</span>
                <span>{{ label(range.max) }}</span>
              </span>
            </label>
            <label class="exact">
              <span class="tt-label">כמות מדויקת</span>
              <input class="tt-input tt-numeric"
                     type="text"
                     inputmode="numeric"
                     autocomplete="off"
                     [value]="display()"
                     (change)="onType($event)"
                     aria-label="כמות קוינס מדויקת" />
            </label>
          </div>
        </details>
      </div>

      <!-- The quote. The one bordered surface in the module, because this is the
           part that takes money and should look like it. -->
      <aside class="quote">
        <div class="quote__stage">
          <tt-coin-pack class="quote__art" [steps]="artSteps()"></tt-coin-pack>
        </div>

        <div class="quote__head">
          <span class="quote__qty tt-numeric">{{ label(current.provided) }}</span>
          <span class="quote__unit">קוינס ל־<span dir="ltr">Ultimate Team</span></span>
        </div>

        <p class="quote__rounded" *ngIf="current.provided > current.requested">
          <tt-icon name="info" [size]="14"></tt-icon>
          מעגלים ל־{{ label(current.provided) }} כדי להרכיב את הכמות מחבילות מלאות.
        </p>

        <ul class="quote__lines" *ngIf="showsLines(current)">
          <li *ngFor="let line of current.lines">
            <span>{{ line.count }} × {{ label(line.quantityEach) }}</span>
            <span class="tt-numeric">{{ lineTotal(line.offer, line.count) | money }}</span>
          </li>
        </ul>

        <div class="quote__total">
          <span class="quote__label">לתשלום</span>
          <span class="tt-price tt-price--lg tt-numeric">{{ current.total | money }}</span>
        </div>
        <p class="quote__rate tt-numeric">
          {{ { amountMinor: current.perMillionMinor, currency: current.total.currency } | money }}
          <span>למיליון קוינס</span>
        </p>

        <button type="button"
                class="tt-btn tt-btn--buy tt-btn--lg tt-btn--block"
                [disabled]="busy"
                (click)="confirm.emit(current)">
          <tt-icon name="cart" [size]="18"></tt-icon>
          <span>{{ busy ? 'מוסיפים…' : 'הוספה לסל' }}</span>
        </button>

        <p class="quote__assure">
          <tt-icon name="lock" [size]="13"></tt-icon>
          מחיר סופי. הפלטפורמה ואזור החנות נבחרים לפני התשלום.
        </p>
      </aside>
    </section>
  `,
  styles: [`
    :host { display: block; }

    .picker { display: grid; gap: var(--tt-stack); align-items: start; }
    @media (min-width: 900px) {
      .picker {
        grid-template-columns: minmax(0, 1.55fr) minmax(300px, 0.85fr);
        grid-template-areas: 'head quote' 'body quote';
        column-gap: var(--tt-space-6);
      }
      .picker__head { grid-area: head; }
      .picker__body { grid-area: body; }
      .quote { grid-area: quote; }
    }

    .picker__head h2 { margin: 0 0 var(--tt-space-2); }
    .picker__head p { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .picker__body { display: flex; flex-direction: column; gap: var(--tt-space-4); }

    /* --- The five tiers ----------------------------------------------------- */
    .tiers { display: grid; gap: var(--tt-space-2); grid-template-columns: repeat(5, minmax(0, 1fr)); }

    .tier {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: var(--tt-space-4) var(--tt-space-2) var(--tt-space-3);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface);
      color: var(--tt-text);
      font: inherit;
      cursor: pointer;
      transition: border-color var(--tt-duration-fast) var(--tt-ease),
                  background-color var(--tt-duration-fast) var(--tt-ease),
                  transform var(--tt-duration-fast) var(--tt-ease);
    }
    .tier:hover { border-color: var(--tt-border-strong); transform: translateY(-2px); }
    .tier.on {
      border-color: var(--tt-gold-500);
      background: linear-gradient(180deg, var(--tt-gold-tint), transparent 70%), var(--tt-surface);
      box-shadow: var(--tt-ring-gold);
    }
    .tier__art { inline-size: 64px; }
    .tier__text { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .tier__qty { font-size: var(--tt-text-xl); font-weight: 900; line-height: 1; letter-spacing: -0.02em; }
    .tier__rate { font-size: 11px; color: var(--tt-text-faint); white-space: nowrap; }
    .tier__price { font-size: var(--tt-text-md); font-weight: 800; color: var(--tt-gold-400); }
    .tier__flag {
      position: absolute;
      inset-block-start: -10px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0.1rem 0.45rem;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-gold-500);
      color: var(--tt-text-on-gold);
      font-size: 10px;
      font-weight: 800;
      white-space: nowrap;
    }
    .tier__check {
      position: absolute;
      inset-block-start: 8px;
      inset-inline-end: 8px;
      display: grid;
      place-items: center;
      inline-size: 20px;
      block-size: 20px;
      border-radius: 50%;
      background: var(--tt-gold-500);
      color: var(--tt-text-on-gold);
      opacity: 0;
      transform: scale(0.6);
      transition: opacity var(--tt-duration-fast) var(--tt-ease), transform var(--tt-duration-fast) var(--tt-ease-out);
    }
    .tier.on .tier__check { opacity: 1; transform: scale(1); }

    /* Phone: rows, not columns. Five cards across a phone is five stamps. */
    @media (max-width: 640px) {
      .tiers { grid-template-columns: 1fr; gap: var(--tt-space-2); }
      .tier {
        flex-direction: row;
        gap: var(--tt-space-3);
        min-block-size: 64px;
        padding: var(--tt-space-2) var(--tt-space-3);
        padding-inline-end: 44px;
        text-align: start;
      }
      .tier__art { inline-size: 46px; flex: none; }
      .tier__text { flex: 1; align-items: flex-start; }
      .tier__qty { font-size: var(--tt-text-lg); }
      .tier__price { font-size: var(--tt-text-lg); }
      .tier__flag { inset-block-start: -8px; inset-inline-start: 56px; }
      .tier__check { inset-block-start: 50%; transform: translateY(-50%) scale(0.6); }
      .tier.on .tier__check { transform: translateY(-50%) scale(1); }
    }

    /* --- The second step ---------------------------------------------------- */
    .custom {
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface);
    }
    .custom > summary {
      display: flex;
      align-items: center;
      gap: var(--tt-space-2);
      min-block-size: 48px;
      padding-inline: var(--tt-space-3);
      cursor: pointer;
      list-style: none;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
    }
    .custom > summary::-webkit-details-marker { display: none; }
    .custom__title { font-weight: 700; color: var(--tt-text); }
    .custom__hint { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--tt-text-xs); }
    .custom__sign { flex: none; transform: rotate(90deg); transition: transform var(--tt-duration) var(--tt-ease); }
    .custom[open] .custom__sign { transform: rotate(-90deg); }
    .custom__body {
      display: grid;
      gap: var(--tt-space-4);
      padding: var(--tt-space-2) var(--tt-space-3) var(--tt-space-4);
      border-block-start: 1px solid var(--tt-border);
    }
    @media (min-width: 640px) {
      .custom__body { grid-template-columns: minmax(0, 1fr) 11rem; align-items: end; }
    }

    .slider { display: block; }
    .slider__ends { display: flex; justify-content: space-between; color: var(--tt-text-faint); font-size: var(--tt-text-xs); direction: ltr; unicode-bidi: isolate; }
    .exact { display: flex; flex-direction: column; gap: var(--tt-space-1); }
    .exact input { text-align: start; direction: ltr; }

    /* --- The quote ---------------------------------------------------------- */
    .quote {
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-3);
      padding: var(--tt-space-4);
      border: 1px solid var(--tt-gold-500);
      border-radius: var(--tt-radius-lg);
      background: linear-gradient(180deg, var(--tt-gold-tint), transparent 50%), var(--tt-surface);
      box-shadow: var(--tt-shadow-2);
    }
    .quote__stage { display: grid; place-items: center; }
    .quote__art { inline-size: 132px; }
    .quote__head { display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }
    .quote__qty { font-size: var(--tt-text-3xl); font-weight: 900; line-height: 1; letter-spacing: -0.03em; }
    .quote__unit { font-size: var(--tt-text-sm); color: var(--tt-text-muted); font-weight: 600; }

    .quote__rounded {
      display: flex;
      align-items: flex-start;
      gap: var(--tt-space-2);
      margin: 0;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-xs);
      line-height: var(--tt-leading-snug);
    }
    .quote__rounded tt-icon { flex: none; margin-block-start: 1px; }
    .quote__lines { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--tt-space-1); }
    .quote__lines li { display: flex; justify-content: space-between; gap: var(--tt-space-3); font-size: var(--tt-text-sm); color: var(--tt-text-muted); }

    .quote__total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--tt-space-3);
      padding-block-start: var(--tt-space-3);
      border-block-start: 1px solid var(--tt-border);
    }
    .quote__label { font-weight: 700; }
    .quote__rate { margin: calc(var(--tt-space-2) * -1) 0 0; color: var(--tt-text-faint); font-size: var(--tt-text-xs); text-align: end; }
    .quote__assure { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--tt-text-faint); font-size: 11px; }
  `],
})
export class AmountSelectorComponent {
  @Input({ required: true }) set detail(detail: ProductDetail | null | undefined) {
    if (!detail) {
      this.offers = [];
      this.variants = [];
      this.tiers = [];
      return;
    }

    // One platform and region, so the plan cannot mix a PC price with a PS5 one.
    const first = detail.offers[0];
    this.offers = first
      ? detail.offers.filter(
        (offer) => offer.platformId === first.platformId && offer.regionId === first.regionId,
      )
      : [];
    this.variants = detail.product.variants;
    this.reset();
  }

  /** Set while the caller is adding the plan to the cart. */
  @Input() busy = false;

  /** The block's own heading, omitted when the page already asks the question. */
  @Input() heading?: string;

  @Output() readonly confirm = new EventEmitter<CoinPlan>();

  private offers: readonly Offer[] = [];
  private variants: readonly ProductVariant[] = [];

  readonly requested = signal(0);
  readonly customOpen = signal(false);
  range = { min: 0, max: 0, step: 1 };
  tiers: readonly Tier[] = [];

  readonly plan = computed<CoinPlan | null>(
    () => planForQuantity(this.offers, this.variants, this.requested()),
  );

  /** The figure in the field, grouped for reading. */
  readonly display = computed(() => this.requested().toLocaleString('he-IL'));

  /**
   * Drives the artwork. Keyed to the amount itself: the thresholds match the
   * tiers the catalogue sells, and a plan built from more than one bundle
   * earns a step.
   */
  readonly artSteps = computed(() => {
    const current = this.plan();
    if (!current) {
      return 1;
    }
    const provided = current.provided;
    const base = provided <= 100_000 ? 1
      : provided <= 250_000 ? 2
        : provided <= 500_000 ? 3
          : provided <= 1_000_000 ? 4
            : 5;
    const units = current.lines.reduce((count, line) => count + line.count, 0);
    return Math.min(5, base + (units > 1 ? 1 : 0));
  });

  private reset(): void {
    const range = coinRange(this.offers, this.variants);
    if (!range) {
      return;
    }
    this.range = range;
    this.tiers = this.buildTiers();

    // Opens on the best-value bundle when there is one, otherwise the largest:
    // the tier the value argument is about.
    const opening = this.tiers.find((tier) => tier.best) ?? this.tiers[this.tiers.length - 1];
    this.requested.set(opening?.quantity ?? range.min);
  }

  /** Every bundle the shop sells, smallest first, with its real figures. */
  private buildTiers(): readonly Tier[] {
    return rankByValue(this.offers, this.variants)
      .filter((row) => row.perUnitMinor !== undefined && (row.variant.quantityValue ?? 0) > 0)
      .sort((a, b) => (a.variant.quantityValue ?? 0) - (b.variant.quantityValue ?? 0))
      .map((row): Tier => ({
        quantity: row.variant.quantityValue ?? 0,
        label: formatQuantity(row.variant.quantityValue) || row.variant.name.he,
        price: row.offer.price.current,
        perMillion: { amountMinor: row.perUnitMinor ?? 0, currency: row.offer.price.current.currency },
        best: row.isBestValue,
      }));
  }

  setAmount(value: number): void {
    const clamped = Math.min(this.range.max, Math.max(this.range.min, Math.round(value)));
    this.requested.set(clamped);
  }

  onSlide(event: Event): void {
    this.setAmount(Number((event.target as HTMLInputElement).value));
  }

  onCustomToggle(event: Event): void {
    this.customOpen.set((event.target as HTMLDetailsElement).open);
  }

  /** Accepts "2,000,000", "2000000" and "2m", because people type all three. */
  onType(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.trim().toLowerCase().replace(/[,\s]/g, '');
    const match = /^(\d+(?:\.\d+)?)([km])?$/.exec(raw);

    if (match) {
      const scale = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1;
      this.setAmount(Number(match[1]) * scale);
    }

    // Always rewrite the field from the accepted value, so a rejected or
    // clamped entry cannot leave the box disagreeing with the price beside it.
    input.value = this.display();
  }

  /** The breakdown is only worth space when it is more than one bundle. */
  showsLines(plan: CoinPlan): boolean {
    return plan.lines.length > 1 || plan.lines.some((line) => line.count > 1);
  }

  label(value: number): string {
    return formatQuantity(value) || value.toLocaleString('he-IL');
  }

  lineTotal(offer: Offer, count: number): Money {
    return { amountMinor: offer.price.current.amountMinor * count, currency: offer.price.current.currency };
  }
}
