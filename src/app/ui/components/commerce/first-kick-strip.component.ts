import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { formatQuantity } from '../../../core/value';
import { LaunchOffer } from '../../../domain';
import { IconComponent } from '../icon.component';

/**
 * The launch welcome benefit, in one line under the hero.
 *
 * Rendered only while the server says the offer is live, with the server's
 * own numbers and terms. It states the condition next to the benefit, so a
 * returning customer is not surprised in the cart: first order only, paid in
 * coins, not combinable with a code. Whether it applies is decided when the
 * cart is priced, never here.
 */
@Component({
  selector: 'tt-first-kick-strip',
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="strip tt-container" *ngIf="launch?.live">
      <div class="strip__inner">
        <p class="strip__lead">
          <span class="strip__glyph" aria-hidden="true"><tt-icon name="bolt" [size]="18"></tt-icon></span>
          <span class="strip__text">
            <strong>{{ launch!.name.he }}</strong>
            <span>הזמנה ראשונה? מקבלים <b class="tt-numeric">+{{ percent }}%</b> קוינס מתנה, עד {{ cap }}, יחד עם ההזמנה.</span>
          </span>
        </p>
        <details class="strip__terms">
          <summary><tt-icon name="info" [size]="14"></tt-icon> התנאים</summary>
          <ul>
            <li *ngFor="let term of launch!.terms">{{ term.he }}</li>
            <li *ngIf="launch!.minOrderMinor > 0">מהזמנה של {{ minOrder }} ₪ ומעלה.</li>
            <li *ngIf="launch!.endsAt">בתוקף עד {{ launch!.endsAt | date: 'dd.MM.yyyy' }}.</li>
          </ul>
        </details>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .strip { padding-block: var(--tt-space-4) 0; }
    .strip__inner {
      display: flex; align-items: center; justify-content: space-between; gap: var(--tt-space-4); flex-wrap: wrap;
      padding: var(--tt-space-3) var(--tt-space-4);
      border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-lg);
      background: linear-gradient(90deg, rgba(212, 180, 106, 0.16), rgba(212, 180, 106, 0.04) 45%, transparent), var(--tt-surface);
    }
    .strip__lead { display: flex; align-items: center; gap: var(--tt-space-3); margin: 0; min-inline-size: 0; flex: 1; }
    .strip__glyph { display: grid; place-items: center; flex: none; inline-size: 40px; block-size: 40px; border-radius: var(--tt-radius-md); background: var(--tt-gold-metal); color: var(--tt-text-on-gold); }
    .strip__text { display: flex; flex-direction: column; gap: 2px; font-size: var(--tt-text-sm); }
    .strip__text strong { font-size: var(--tt-text-md); }
    .strip__text b { color: var(--tt-gold-400); }
    .strip__terms { position: relative; font-size: var(--tt-text-xs); color: var(--tt-text-muted); }
    .strip__terms > summary { display: inline-flex; align-items: center; gap: 4px; min-block-size: 40px; padding: 0 var(--tt-space-2); cursor: pointer; list-style: none; color: var(--tt-gold-400); font-weight: 700; }
    .strip__terms > summary::-webkit-details-marker { display: none; }
    .strip__terms ul { margin: var(--tt-space-1) 0 0; padding-inline-start: var(--tt-space-4); display: flex; flex-direction: column; gap: 2px; max-inline-size: 60ch; }
    @media (max-width: 600px) { .strip__inner { padding: var(--tt-space-3); } }
  `],
})
export class FirstKickStripComponent {
  @Input() launch: LaunchOffer | null = null;

  get percent(): number {
    return Math.round((this.launch?.percentBps ?? 0) / 100);
  }

  get cap(): string {
    return formatQuantity(this.launch?.capCoins ?? 0);
  }

  get minOrder(): string {
    return Math.round((this.launch?.minOrderMinor ?? 0) / 100).toLocaleString('he-IL');
  }
}
