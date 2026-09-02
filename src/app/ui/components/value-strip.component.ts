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
 * The three promises under the hero were a row of small grey glyphs with a line
 * of text each, which is the shape of a footer, not of a reason to buy. Here
 * each point gets a real object: the glyph sits on a sheared plate cut at the
 * brand's nine degrees, lit from behind, with a title and one line under it.
 *
 * Only claims the shop can actually keep. There is no order count, no rating
 * and no delivery statistic, because none of those exist as data.
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
          <tt-icon [name]="point.icon" [size]="22"></tt-icon>
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

    .strip {
      display: grid;
      gap: var(--tt-space-4);
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      margin: 0;
      padding: 0;
      list-style: none;
    }

    /* No card. The plate is the object; the text sits beside it on the page. */
    .point {
      display: flex;
      align-items: flex-start;
      gap: var(--tt-space-3);
    }

    .plate {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 46px;
      block-size: 46px;
      flex: none;
      color: var(--tt-brand-300);
    }
    /* The lit face, sheared. Sits behind the glyph rather than around it, so
       the glyph is never boxed. */
    .plate__face {
      position: absolute;
      inset: 0;
      transform: skewX(-9deg);
      border-radius: var(--tt-radius-md);
      background: linear-gradient(160deg, var(--tt-brand-tint-strong), transparent 70%),
                  var(--tt-surface-2);
      border: 1px solid var(--tt-border-brand);
    }
    .plate tt-icon { position: relative; }

    /* Gold is money, and only the money point gets it. */
    .plate--money { color: var(--tt-gold-400); }
    .plate--money .plate__face {
      background: linear-gradient(160deg, var(--tt-gold-tint), transparent 70%),
                  var(--tt-surface-2);
      border-color: var(--tt-gold-500);
    }

    .point__text { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
    .point__text strong { font-size: var(--tt-text-sm); font-weight: 700; }
    .point__text span {
      color: var(--tt-text-muted);
      font-size: var(--tt-text-xs);
      line-height: var(--tt-leading-snug);
    }

    /* A row of facts sized to their content, not stretched across the page.
       At full width three equal columns put four hundred pixels between each
       glyph and read as three unrelated things. */
    .strip--compact {
      grid-template-columns: none;
      grid-auto-flow: column;
      grid-auto-columns: max-content;
      justify-content: start;
      gap: var(--tt-space-7);
    }
    @media (max-width: 620px) {
      .strip--compact {
        grid-auto-flow: row;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        justify-content: stretch;
        gap: var(--tt-space-3);
      }
    }
    .strip--compact .point { flex-direction: column; align-items: center; text-align: center; gap: var(--tt-space-2); }
    .strip--compact .plate { inline-size: 38px; block-size: 38px; }
    .strip--compact .point__text span { display: none; }

    @media (max-width: 900px) {
      .strip:not(.strip--compact) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    /* Two across on a phone rather than one: four full-width rows of a glyph
       and two words is a lot of screen for very little. */
    @media (max-width: 620px) {
      .strip:not(.strip--compact) { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--tt-space-3); }
      .strip:not(.strip--compact) .plate { inline-size: 38px; block-size: 38px; }
      .strip:not(.strip--compact) .point { gap: var(--tt-space-2); }
    }
  `],
})
export class ValueStripComponent {
  /**
   * Tighter layout for a page header rather than a section of its own.
   *
   * Three points in the default two-column grid leave an orphan on the second
   * row. Compact lays them out as equal columns with the glyph above the text,
   * which reads as one row of facts instead of a broken grid.
   */
  @Input() compact = false;

  @Input() points: readonly ValuePoint[] = [
    { icon: 'tag', title: 'מחיר סופי', note: 'מה שרואים לפני התשלום זה מה שמשלמים.', money: true },
    { icon: 'lock', title: 'תשלום מאובטח', note: 'פרטי האשראי עוברים לספק הסליקה.' },
    { icon: 'truck', title: 'מעקב הזמנה', note: 'דף סטטוס לכל הזמנה, מהתשלום ועד האספקה.' },
    { icon: 'headset', title: 'תמיכה בעברית', note: 'שאלה על הזמנה או על מוצר, אנחנו כאן.' },
  ];
}
