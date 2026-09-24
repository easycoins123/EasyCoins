import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ClubSummary } from '../../../domain';
import { IconComponent } from '../icon.component';

/**
 * Tier, points and the road to the next tier, from the server's summary.
 *
 * The ladder shows every tier with its threshold; the bar shows how far the
 * customer is between the current threshold and the next. Nothing here is a
 * projection: points are what paid orders earned, the percentage is the
 * server's, and a boosted tier is marked as such with its end date.
 */
@Component({
  selector: 'tt-club-progress',
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="progress">
      <div class="progress__now">
        <span class="progress__crown" aria-hidden="true"><tt-icon name="crown" [size]="22"></tt-icon></span>
        <span class="progress__text">
          <span class="tt-eyebrow">הדרגה שלכם</span>
          <strong class="progress__tier">{{ club.tier.name.he }}</strong>
          <span class="progress__boost tt-faint" *ngIf="club.boost as boost">כולל קפיצת דרגה{{ boost.until ? ' עד ' + (boost.until | date:'d.M.yyyy') : '' }}</span>
        </span>
        <span class="progress__points">
          <span class="tt-figure">{{ club.points.total }}</span>
          <span class="tt-faint">EasyPoints</span>
        </span>
      </div>

      <ol class="ladder" aria-label="דרגות EASYCLUB">
        <li class="rung" *ngFor="let tier of club.tiers; let i = index" [class.rung--done]="i <= club.tier.index" [class.rung--now]="i === club.tier.index">
          <span class="rung__dot" aria-hidden="true"></span>
          <span class="rung__name">{{ tier.name.he }}</span>
          <span class="rung__min tt-numeric">{{ tier.minPoints }}</span>
        </li>
      </ol>

      <div class="bar" *ngIf="club.nextTier as next; else top" role="progressbar" [attr.aria-valuenow]="next.percent" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="'התקדמות ל־' + next.name.he">
        <span class="bar__fill" [style.inline-size.%]="next.percent"></span>
      </div>
      <p class="bar__note tt-muted" *ngIf="club.nextTier as next">עוד <strong class="tt-numeric">{{ next.pointsToGo }}</strong> נקודות ל־{{ next.name.he }}. נקודה על כל שקל ששולם{{ club.points.perShekel !== 1 ? ' ×' + club.points.perShekel : '' }}.</p>
      <ng-template #top><p class="bar__note tt-muted">הגעתם לדרגה הגבוהה ביותר.</p></ng-template>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .progress { display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .progress__now { display: flex; align-items: center; gap: var(--tt-space-3); }
    .progress__crown { display: grid; place-items: center; flex: none; inline-size: 52px; block-size: 52px; border-radius: 50%; background: var(--tt-gold-metal); color: var(--tt-text-on-gold); }
    .progress__text { display: flex; flex-direction: column; flex: 1; min-inline-size: 0; }
    .progress__tier { font-family: var(--tt-font-display); font-weight: 900; font-size: var(--tt-text-2xl); letter-spacing: 0.02em; line-height: 1.1; }
    .progress__boost { font-size: var(--tt-caption); }
    .progress__points { display: flex; flex-direction: column; align-items: flex-end; }
    .progress__points .tt-figure { font-size: 1.9rem; color: var(--tt-gold-400); }
    .ladder { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; margin: 0; padding: 0; list-style: none; }
    .rung { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: var(--tt-space-2) 4px; border-radius: var(--tt-radius-sm); border: 1px solid var(--tt-border); background: var(--tt-surface-2); color: var(--tt-text-faint); font-size: var(--tt-caption); font-weight: 800; }
    .rung__dot { inline-size: 8px; block-size: 8px; border-radius: 50%; background: currentColor; }
    .rung--done { color: var(--tt-text); border-color: var(--tt-gold-600); }
    .rung--now { background: var(--tt-gold-tint); color: var(--tt-gold-400); box-shadow: var(--tt-ring-gold); }
    .rung__min { font-weight: 600; color: var(--tt-text-faint); }
    .bar { block-size: 8px; border-radius: var(--tt-radius-pill); background: var(--tt-surface-3); overflow: hidden; }
    .bar__fill { display: block; block-size: 100%; border-radius: inherit; background: var(--tt-gold-metal); transition: inline-size var(--tt-duration-slow) var(--tt-ease-out); }
    .bar__note { margin: 0; font-size: var(--tt-text-sm); }
  `],
})
export class ClubProgressComponent {
  @Input({ required: true }) club!: ClubSummary;
}
