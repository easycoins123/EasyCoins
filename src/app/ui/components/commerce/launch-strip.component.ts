import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { bonusPercent } from '../../../core/commerce';
import { formatQuantity } from '../../../core/value';
import { CoinProduct } from '../../../domain';
import { IconComponent } from '../icon.component';

interface StripTier {
  readonly amount: string;
  readonly total: string;
  readonly percent: number;
}

/**
 * The launch value, in one line under the hero.
 *
 * Not a banner: a compact strip that turns the bonus into numbers a player
 * can read in a second. Three steps of the ladder, base to received, and the
 * way to the full ladder. It renders nothing when the catalog carries no
 * bonus, so it can never announce a campaign that is not running.
 */
@Component({
  selector: 'tt-launch-strip',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="strip tt-container" *ngIf="tiers.length > 0">
      <div class="strip__inner">
        <p class="strip__lead">
          <span class="strip__glyph" aria-hidden="true"><tt-icon name="coins" [size]="18"></tt-icon></span>
          <span class="strip__text">
            <strong>בונוס השקה</strong>
            <span>קונים עכשיו, מקבלים יותר קוינס. הבונוס נכנס להזמנה ומגיע עם הקוינס.</span>
          </span>
        </p>
        <ul class="strip__tiers" aria-label="דוגמאות לבונוס ההשקה">
          <li class="tier" *ngFor="let tier of tiers">
            <span class="tier__base tt-numeric">{{ tier.amount }}</span>
            <svg class="tier__arrow" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="tier__total tt-numeric">{{ tier.total }}</span>
            <span class="tier__pct tt-numeric">+{{ tier.percent }}%</span>
          </li>
        </ul>
        <a class="strip__cta" routerLink="/store">
          לכל {{ ladderSize }} החבילות <tt-icon name="chevron" [size]="14" dir="auto"></tt-icon>
        </a>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .strip { padding-block: var(--tt-space-4) 0; }
    .strip__inner {
      display: flex; align-items: center; gap: var(--tt-space-4); flex-wrap: wrap;
      padding: var(--tt-space-3) var(--tt-space-4);
      border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-lg);
      background: linear-gradient(90deg, rgba(212, 180, 106, 0.16), rgba(212, 180, 106, 0.04) 45%, transparent), var(--tt-surface);
      box-shadow: inset 0 1px 0 rgba(255, 248, 235, 0.06);
    }
    .strip__lead { display: flex; align-items: center; gap: var(--tt-space-3); margin: 0; flex: 1 1 320px; min-inline-size: 0; }
    .strip__glyph { display: grid; place-items: center; flex: none; inline-size: 40px; block-size: 40px; border-radius: 50%; background: var(--tt-gold-metal); color: var(--tt-text-on-gold); }
    .strip__text { display: flex; flex-direction: column; gap: 1px; line-height: var(--tt-leading-snug); }
    .strip__text strong { font-size: var(--tt-text-md); color: var(--tt-gold-400); letter-spacing: 0.02em; }
    .strip__text span { font-size: var(--tt-text-sm); color: var(--tt-text-muted); }
    .strip__tiers { display: flex; gap: var(--tt-space-2); margin: 0; padding: 0; list-style: none; flex-wrap: wrap; }
    .tier { display: inline-flex; align-items: baseline; gap: 6px; padding: 6px 12px; border-radius: var(--tt-radius-md); border: 1px solid var(--tt-border-strong); background: var(--tt-surface-2); font-weight: 800; font-size: var(--tt-text-sm); direction: ltr; }
    .tier__base { color: var(--tt-text-muted); }
    .tier__arrow { color: var(--tt-text-faint); align-self: center; flex: none; }
    .tier__total { color: var(--tt-text); font-size: var(--tt-text-md); }
    .tier__pct { color: var(--tt-gold-400); font-size: var(--tt-caption); }
    .strip__cta { display: inline-flex; align-items: center; gap: 4px; margin-inline-start: auto; font-weight: 700; font-size: var(--tt-text-sm); color: var(--tt-gold-400); white-space: nowrap; }
    @media (max-width: 760px) {
      .strip { padding-block-start: var(--tt-space-3); }
      .strip__inner { gap: var(--tt-space-3); padding: var(--tt-space-3); }
      .strip__text span { display: none; }
      .strip__tiers { inline-size: 100%; }
      .tier { flex: 1 1 0; justify-content: center; padding-inline: 8px; }
      .strip__cta { margin-inline-start: 0; }
    }
  `],
})
export class LaunchStripComponent {
  tiers: readonly StripTier[] = [];
  ladderSize = 0;

  /** The full ladder; the strip picks three representative steps with a bonus. */
  @Input() set products(list: readonly CoinProduct[] | null | undefined) {
    const withBonus = (list ?? []).filter((product) => product.bonus > 0);
    this.ladderSize = (list ?? []).length;
    const picks = [500_000, 1_000_000, 2_000_000]
      .map((amount) => withBonus.find((product) => product.amount === amount))
      .filter((product): product is CoinProduct => product !== undefined);
    const chosen = picks.length === 3 ? picks : withBonus.slice(-3);
    this.tiers = chosen.map((product) => ({
      amount: formatQuantity(product.amount),
      total: formatQuantity(product.totalCoins),
      percent: bonusPercent(product.amount, product.bonus),
    }));
  }
}
