import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IconComponent, IconName } from './icon.component';

export interface ValuePoint {
  readonly icon: IconName;
  readonly title: string;
  readonly note: string;
  /** Gold marks money; blue marks everything else. */
  readonly money?: boolean;
}

/**
 * The value strip.
 *
 * Each promise gets a real object: the glyph on a plate cut at the brand's
 * nine degrees, with a title and one line under it. Only claims the shop can
 * keep; there is no order count, no rating and no delivery statistic because
 * none exists as data.
 */
@Component({
  selector: 'tt-value-strip',
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="strip" [class.strip--compact]="compact">
      <li class="point" *ngFor="let point of points">
        <span class="plate" [class.plate--money]="point.money" aria-hidden="true">
          <span class="plate__face"></span>
          <tt-icon [name]="point.icon" [size]="compact ? 20 : 24"></tt-icon>
        </span>
        <span class="point__text">
          <strong>{{ point.title }}</strong>
          <span>{{ point.note }}</span>
        </span>
      </li>
    </ul>
  `,
  styles: [`
    :host { display: block; }
    .strip { display: grid; gap: var(--tt-space-4); grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); margin: 0; padding: 0; list-style: none; }
    .point { display: flex; align-items: flex-start; gap: var(--tt-space-3); }

    /* A solid plate cut on the brand's nine degrees. The colour is in the glyph
       and the hairline; the plate itself is the same surface as a card. */
    .plate { position: relative; display: grid; place-items: center; inline-size: 52px; block-size: 52px; flex: none; color: var(--tt-brand-300); }
    .plate__face {
      position: absolute;
      inset: 0;
      transform: skewX(-9deg);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface-2);
      border: 1px solid var(--tt-border-strong);
      box-shadow: inset 0 1px 0 rgba(255, 248, 235, 0.06);
    }
    .plate tt-icon { position: relative; }
    .plate--money { color: var(--tt-gold-400); }
    .plate--money .plate__face { border-color: var(--tt-gold-600); }

    .point__text { display: flex; flex-direction: column; gap: 3px; min-inline-size: 0; }
    .point__text strong { font-size: var(--tt-text-md); font-weight: 800; }
    .point__text span { color: var(--tt-text-muted); font-size: var(--tt-text-xs); line-height: var(--tt-leading-snug); }

    .strip--compact { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: max-content; justify-content: start; gap: var(--tt-space-6); }
    .strip--compact .point { flex-direction: row; align-items: center; gap: var(--tt-space-2); }
    .strip--compact .plate { inline-size: 40px; block-size: 40px; }
    .strip--compact .point__text strong { font-size: var(--tt-text-sm); }
    .strip--compact .point__text span { display: none; }

    @media (max-width: 900px) { .strip:not(.strip--compact) { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 620px) {
      .strip--compact { grid-auto-flow: row; grid-template-columns: repeat(3, minmax(0, 1fr)); justify-content: stretch; gap: var(--tt-space-2); }
      .strip--compact .point { flex-direction: column; text-align: center; }
      .strip:not(.strip--compact) { gap: var(--tt-space-3); }
      .strip:not(.strip--compact) .plate { inline-size: 42px; block-size: 42px; }
      .strip:not(.strip--compact) .point { gap: var(--tt-space-2); }
      .strip:not(.strip--compact) .point__text strong { font-size: var(--tt-text-sm); }
    }
  `],
})
export class ValueStripComponent {
  @Input() compact = false;

  @Input() points: readonly ValuePoint[] = [
    { icon: 'tag', title: 'מחיר סופי', note: 'מה שרואים לפני התשלום זה מה שמשלמים.', money: true },
    { icon: 'lock', title: 'תשלום מאובטח', note: 'פרטי האשראי עוברים לספק הסליקה.' },
    { icon: 'delivery', title: 'מעקב הזמנה', note: 'דף סטטוס לכל הזמנה, מהתשלום ועד האספקה.' },
    { icon: 'support', title: 'תמיכה בעברית', note: 'שאלה על הזמנה או על מוצר, אנחנו כאן.' },
  ];
}
