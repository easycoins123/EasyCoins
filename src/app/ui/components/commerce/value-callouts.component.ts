import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { bonusPercent } from '../../../core/commerce';
import { formatQuantity } from '../../../core/value';
import { CoinProduct } from '../../../domain';
import { IconComponent, IconName } from '../icon.component';

interface Callout {
  readonly icon: IconName;
  readonly figure: string;
  readonly unit?: string;
  readonly title: string;
  readonly note: string;
}

/**
 * Why this deal is better, in four numbers the catalog can back.
 *
 * Every figure is computed from the shelf being shown: the cheapest price
 * per million received, the largest bonus, the size of the ladder. The one
 * statement without a number is the shop's own rule, that the price on the
 * page is the price at the end.
 */
@Component({
  selector: 'tt-value-callouts',
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="callouts" *ngIf="callouts.length > 0">
      <li class="callout" *ngFor="let callout of callouts">
        <span class="callout__glyph" aria-hidden="true"><tt-icon [name]="callout.icon" [size]="18"></tt-icon></span>
        <p class="callout__figure">
          <span class="tt-figure">{{ callout.figure }}</span>
          <span class="callout__unit" *ngIf="callout.unit">{{ callout.unit }}</span>
        </p>
        <strong>{{ callout.title }}</strong>
        <span class="callout__note">{{ callout.note }}</span>
      </li>
    </ul>
  `,
  styles: [`
    :host { display: block; }
    .callouts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--tt-space-3); margin: 0; padding: 0; list-style: none; }
    .callout { display: flex; flex-direction: column; gap: 4px; padding: var(--tt-space-4); border-radius: var(--tt-radius-lg); border: 1px solid var(--tt-border); background: linear-gradient(180deg, #17161A, var(--tt-surface) 70%); }
    .callout__glyph { display: grid; place-items: center; inline-size: 36px; block-size: 36px; border-radius: var(--tt-radius-md); border: 1px solid var(--tt-gold-600); background: var(--tt-surface-2); color: var(--tt-gold-400); margin-block-end: var(--tt-space-2); }
    .callout__figure { display: flex; align-items: baseline; gap: 6px; margin: 0; line-height: 1; }
    .callout__figure .tt-figure { font-size: 2rem; color: var(--tt-gold-400); }
    .callout__unit { font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text-muted); }
    .callout strong { font-size: var(--tt-text-md); }
    .callout__note { font-size: var(--tt-caption); color: var(--tt-text-muted); line-height: var(--tt-leading-snug); }
    @media (max-width: 900px) { .callouts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 420px) { .callout { padding: var(--tt-space-3); } .callout__figure .tt-figure { font-size: 1.7rem; } }
  `],
})
export class ValueCalloutsComponent {
  callouts: readonly Callout[] = [];

  @Input() set products(list: readonly CoinProduct[] | null | undefined) {
    const shelf = list ?? [];
    if (shelf.length === 0) {
      this.callouts = [];
      return;
    }
    const cheapest = shelf.reduce((best, product) => (
      product.effectivePerMillionIls !== undefined && (best === undefined || product.effectivePerMillionIls < (best.effectivePerMillionIls ?? Infinity)) ? product : best
    ), undefined as CoinProduct | undefined);
    const richest = shelf.reduce((best, product) => (bonusPercent(product.amount, product.bonus) > bonusPercent(best.amount, best.bonus) ? product : best), shelf[0]);
    const smallest = shelf[0];
    const largest = shelf[shelf.length - 1];
    const anyBonus = shelf.some((product) => product.bonus > 0);

    const callouts: Callout[] = [];
    if (cheapest?.effectivePerMillionIls !== undefined) {
      callouts.push({
        icon: 'tag',
        figure: `₪${Math.round(cheapest.effectivePerMillionIls)}`,
        unit: 'למיליון',
        title: `בחבילת ${formatQuantity(cheapest.amount)}`,
        note: anyBonus ? 'המחיר לכל מיליון קוינס שמתקבלים, כולל בונוס ההשקה.' : 'המחיר לכל מיליון קוינס.',
      });
    }
    if (anyBonus) {
      callouts.push({
        icon: 'coins',
        figure: `+${bonusPercent(richest.amount, richest.bonus)}%`,
        unit: 'בקוינס',
        title: 'בונוס השקה, לא הנחה על נייר',
        note: `עד ${formatQuantity(richest.bonus)} קוינס נוספים בחבילת ${formatQuantity(richest.amount)}. נכנס להזמנה.`,
      });
    }
    callouts.push({
      icon: 'package',
      figure: String(shelf.length),
      unit: 'גדלים',
      title: `מ־${formatQuantity(smallest.amount)} עד ${formatQuantity(largest.amount)}`,
      note: 'כמות מדויקת לכל תקציב, וככל שהחבילה גדולה המחיר לקוין יורד.',
    });
    callouts.push({
      icon: 'shield',
      figure: '0',
      unit: 'הפתעות',
      title: 'המחיר בדף הוא המחיר בסוף',
      note: 'פלטפורמה, אזור ובונוס מוצגים לפני התשלום. אין תוספות בקופה.',
    });
    this.callouts = callouts;
  }
}
