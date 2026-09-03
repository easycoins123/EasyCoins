import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  CoinPlan, coinRange, formatQuantity, planForQuantity, rankByValue,
} from '../../core/value';
import { Money, Offer, ProductDetail, ProductVariant } from '../../domain';
import { MoneyPipe } from '../money.pipe';
import { Material, materialForStep } from '../materials';
import { CoinPackComponent } from './coin-pack.component';
import { IconComponent } from './icon.component';

/** One purchasable bundle, as the picker presents it. */
interface Tier {
  readonly quantity: number;
  readonly label: string;
  readonly price: Money;
  readonly perMillion: Money;
  readonly best: boolean;
  readonly material: Material;
}

/**
 * "How many coins do you want?"
 *
 * Answered with the five bundles the shop sells, each its own object in its
 * own material, with its price and its price per million so the value
 * argument is read off the row. Choosing one is one press; the chosen bundle
 * is drawn large beside the total and the action.
 *
 * Anyone who needs an amount between or beyond the bundles opens the second
 * step: a slider and a field. Whatever the number, it is filled from bundles
 * the server priced and the breakdown is shown. Nothing here computes a
 * price: it adds up prices that already exist.
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
                  [style.--mat]="tier.material.color"
                  [style.--mat-glow]="tier.material.glow"
                  (click)="setAmount(tier.quantity)">
            <span class="tier__flag" *ngIf="tier.best">
              <tt-icon name="lightning" [size]="11"></tt-icon> הכי משתלם
            </span>
            <tt-coin-pack class="tier__art" [steps]="i + 1"></tt-coin-pack>
            <span class="tier__text">
              <span class="tier__qty tt-figure">{{ tier.label }}</span>
              <span class="tier__mat">{{ tier.material.labelHe }}</span>
              <span class="tier__rate tt-numeric">{{ tier.perMillion | money }} למיליון</span>
            </span>
            <span class="tier__price">{{ tier.price | money }}</span>
            <span class="tier__check" aria-hidden="true"><tt-icon name="check" [size]="12"></tt-icon></span>
          </button>
        </div>

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
                     [min]="range.min" [max]="range.max" [step]="range.step"
                     [value]="requested()" (input)="onSlide($event)"
                     [attr.aria-valuetext]="display() + ' קוינס'" />
              <span class="slider__ends tt-numeric">
                <span>{{ label(range.min) }}</span>
                <span>{{ label(range.max) }}</span>
              </span>
            </label>
            <label class="exact">
              <span class="tt-label">כמות מדויקת</span>
              <input class="tt-input tt-numeric" type="text" inputmode="numeric" autocomplete="off"
                     [value]="display()" (change)="onType($event)" aria-label="כמות קוינס מדויקת" />
            </label>
          </div>
        </details>
      </div>

      <!-- The quote: the one bordered surface in the module, because this is
           the part that takes money and should look like it. -->
      <aside class="quote tt-plate" [style.--mat]="currentMaterial().color" [style.--mat-glow]="currentMaterial().glow">
        <div class="quote__stage">
          <tt-coin-pack class="quote__art" [steps]="artSteps()"></tt-coin-pack>
        </div>

        <div class="quote__head">
          <span class="quote__qty tt-figure">{{ label(current.provided) }}</span>
          <span class="quote__unit">קוינס ל־<span dir="ltr">Ultimate Team</span> · {{ currentMaterial().labelHe }}</span>
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
          <span class="tt-price tt-price--xl">{{ current.total | money }}</span>
        </div>
        <p class="quote__rate tt-numeric">
          {{ { amountMinor: current.perMillionMinor, currency: current.total.currency } | money }}
          <span>למיליון קוינס</span>
        </p>

        <button type="button" class="tt-btn tt-btn--buy tt-btn--lg tt-btn--block"
                [class.tt-btn--loading]="busy"
                [attr.aria-busy]="busy ? 'true' : null"
                [disabled]="busy"
                (click)="confirm.emit(current)">
          <tt-icon name="cart" [size]="18"></tt-icon>
          <span>הוספה לסל</span>
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

    .picker { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--tt-stack); align-items: start; }
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
      border-radius: var(--tt-radius-lg);
      background:
        radial-gradient(70% 50% at 50% 30%, var(--mat-glow), transparent 70%),
        var(--tt-surface);
      color: var(--tt-text);
      font: inherit;
      cursor: pointer;
      transition: border-color var(--tt-duration-fast) var(--tt-ease),
                  transform var(--tt-duration-fast) var(--tt-ease),
                  box-shadow var(--tt-duration) var(--tt-ease);
    }
    .tier:hover { border-color: var(--tt-border-strong); transform: translateY(-2px); }
    .tier:focus-visible { outline: 2px solid var(--tt-brand-400); outline-offset: 3px; }
    .tier.on {
      border-color: var(--mat);
      box-shadow: 0 0 0 1px var(--mat), 0 12px 32px rgba(0, 0, 0, 0.4);
      transform: translateY(-2px);
    }
    .tier__art { inline-size: 68px; filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.45)); }
    .tier__text { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .tier__qty { font-size: 1.9rem; }
    .tier__mat { font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--mat); }
    .tier__rate { font-size: 11px; color: var(--tt-text-faint); white-space: nowrap; }
    .tier__price { font-family: var(--tt-font-display); font-size: 1.35rem; font-weight: 700; color: var(--tt-gold-400); }
    .tier__flag {
      position: absolute;
      inset-block-start: 8px;
      inset-inline-start: 8px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0.1rem 0.5rem;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-gold-500);
      color: var(--tt-text-on-gold);
      font-size: 10px;
      font-weight: 800;
      white-space: nowrap;
      transform: skewX(-8deg);
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
      background: var(--mat);
      color: #14110D;
      opacity: 0;
      transform: scale(0.6);
      transition: opacity var(--tt-duration-fast) var(--tt-ease), transform var(--tt-duration-fast) var(--tt-ease-out);
    }
    .tier.on .tier__check { opacity: 1; transform: scale(1); }

    @media (max-width: 640px) {
      .tiers { grid-template-columns: minmax(0, 1fr); gap: var(--tt-space-2); }
      .tier { flex-direction: row; gap: var(--tt-space-3); min-block-size: 68px; padding: var(--tt-space-2) var(--tt-space-3); padding-inline-end: 44px; text-align: start; }
      .tier__art { inline-size: 50px; flex: none; }
      .tier__text { flex: 1; min-inline-size: 0; align-items: flex-start; }
      .tier__rate { white-space: normal; }
      .tier__price { flex: none; }
      .tier__qty { font-size: 1.6rem; }
      .tier__price { font-size: 1.35rem; }
      .tier__flag { inset-block-start: 6px; inset-inline-start: auto; inset-inline-end: 40px; }
      .tier__check { inset-block-start: 50%; transform: translateY(-50%) scale(0.6); }
      .tier.on .tier__check { transform: translateY(-50%) scale(1); }
      .tier.on { transform: none; }
    }

    /* --- The second step ---------------------------------------------------- */
    .custom { border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); background: var(--tt-surface); }
    .custom > summary { display: flex; align-items: center; gap: var(--tt-space-2); min-block-size: 48px; padding-inline: var(--tt-space-3); cursor: pointer; list-style: none; color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .custom > summary::-webkit-details-marker { display: none; }
    .custom__title { font-weight: 700; color: var(--tt-text); }
    .custom__hint { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--tt-text-xs); }
    .custom__sign { flex: none; transform: rotate(90deg); transition: transform var(--tt-duration) var(--tt-ease); }
    .custom[open] .custom__sign { transform: rotate(-90deg); }
    .custom__body { display: grid; gap: var(--tt-space-4); padding: var(--tt-space-2) var(--tt-space-3) var(--tt-space-4); border-block-start: 1px solid var(--tt-border); }
    @media (min-width: 640px) { .custom__body { grid-template-columns: minmax(0, 1fr) 11rem; align-items: end; } }
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
      border-radius: var(--tt-radius-xl);
      border-color: var(--mat);
      box-shadow: inset 0 1px 0 rgba(255, 248, 235, 0.06), var(--tt-shadow-2);
    }
    .quote__stage {
      display: grid;
      place-items: center;
      margin: calc(var(--tt-space-4) * -1) calc(var(--tt-space-4) * -1) 0;
      padding-block: var(--tt-space-3) 0;
      background: radial-gradient(60% 70% at 50% 60%, var(--mat-glow), transparent 70%);
    }
    .quote__art { inline-size: 150px; filter: drop-shadow(0 16px 24px rgba(0, 0, 0, 0.5)); }
    .quote__head { display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }
    .quote__qty { font-size: 3rem; }
    .quote__unit { font-size: var(--tt-text-sm); color: var(--tt-text-muted); font-weight: 600; }
    .quote__rounded { display: flex; align-items: flex-start; gap: var(--tt-space-2); margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-xs); line-height: var(--tt-leading-snug); }
    .quote__rounded tt-icon { flex: none; margin-block-start: 1px; }
    .quote__lines { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--tt-space-1); }
    .quote__lines li { display: flex; justify-content: space-between; gap: var(--tt-space-3); font-size: var(--tt-text-sm); color: var(--tt-text-muted); }
    .quote__total { display: flex; justify-content: space-between; align-items: baseline; gap: var(--tt-space-3); padding-block-start: var(--tt-space-3); border-block-start: 1px solid var(--tt-border); }
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
    const first = detail.offers[0];
    this.offers = first
      ? detail.offers.filter((offer) => offer.platformId === first.platformId && offer.regionId === first.regionId)
      : [];
    this.variants = detail.product.variants;
    this.reset();
  }

  @Input() busy = false;
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

  readonly display = computed(() => this.requested().toLocaleString('he-IL'));

  /** Drives the artwork: the tier the amount lands in, plus one for a mix. */
  readonly artSteps = computed(() => {
    const current = this.plan();
    if (!current) {
      return 1;
    }
    const provided = current.provided;
    const base = provided <= 100_000 ? 1 : provided <= 250_000 ? 2 : provided <= 500_000 ? 3 : provided <= 1_000_000 ? 4 : 5;
    const units = current.lines.reduce((count, line) => count + line.count, 0);
    return Math.min(5, base + (units > 1 ? 1 : 0));
  });

  readonly currentMaterial = computed<Material>(() => materialForStep(this.artSteps()));

  private reset(): void {
    const range = coinRange(this.offers, this.variants);
    if (!range) {
      return;
    }
    this.range = range;
    this.tiers = this.buildTiers();
    const opening = this.tiers.find((tier) => tier.best) ?? this.tiers[this.tiers.length - 1];
    this.requested.set(opening?.quantity ?? range.min);
  }

  private buildTiers(): readonly Tier[] {
    return rankByValue(this.offers, this.variants)
      .filter((row) => row.perUnitMinor !== undefined && (row.variant.quantityValue ?? 0) > 0)
      .sort((a, b) => (a.variant.quantityValue ?? 0) - (b.variant.quantityValue ?? 0))
      .map((row, index): Tier => ({
        quantity: row.variant.quantityValue ?? 0,
        label: formatQuantity(row.variant.quantityValue) || row.variant.name.he,
        price: row.offer.price.current,
        perMillion: { amountMinor: row.perUnitMinor ?? 0, currency: row.offer.price.current.currency },
        best: row.isBestValue,
        material: materialForStep(index + 1),
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

  onType(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.trim().toLowerCase().replace(/[,\s]/g, '');
    const match = /^(\d+(?:\.\d+)?)([km])?$/.exec(raw);
    if (match) {
      const scale = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1;
      this.setAmount(Number(match[1]) * scale);
    }
    input.value = this.display();
  }

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
