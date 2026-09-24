import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { formatQuantity } from '../../../core/value';
import { Reward } from '../../../domain';
import { IconComponent, IconName } from '../icon.component';

/**
 * One reward, as a card.
 *
 * Says what it is, what it does, when it applies and whether it is still
 * usable. The value is stated the way the customer will meet it: coins, a
 * shekel credit, points, a multiplier, a tier. Nothing here decides anything;
 * the status and the dates are the ledger's.
 */
@Component({
  selector: 'tt-reward-card',
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="reward" [class.reward--spent]="spent" [class.reward--on]="selected" [class.reward--compact]="compact">
      <span class="reward__glyph" aria-hidden="true"><tt-icon [name]="icon" [size]="compact ? 16 : 20"></tt-icon></span>
      <span class="reward__body">
        <strong class="reward__title" dir="auto">{{ reward.title.he }}</strong>
        <span class="reward__meta">{{ meta }}</span>
      </span>
      <span class="reward__side">
        <span class="chip" [class.chip--live]="reward.status === 'AVAILABLE'" [class.chip--held]="reward.status === 'RESERVED'">{{ statusLabel }}</span>
        <button type="button" class="tt-btn tt-btn--sm tt-btn--buy" *ngIf="action === 'use'" [disabled]="busy" (click)="use.emit(reward.id)">להזמנה הזו</button>
        <button type="button" class="tt-btn tt-btn--sm tt-btn--ghost" *ngIf="action === 'remove'" [disabled]="busy" (click)="remove.emit(reward.id)">הסרה</button>
      </span>
    </article>
  `,
  styles: [`
    :host { display: block; }
    .reward { display: flex; align-items: center; gap: var(--tt-space-3); padding: var(--tt-space-3) var(--tt-space-4); border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); background: linear-gradient(180deg, #17161A, var(--tt-surface) 70%); }
    .reward--on { border-color: var(--tt-gold-500); box-shadow: var(--tt-ring-gold); }
    .reward--spent { opacity: 0.62; }
    .reward--compact { padding: var(--tt-space-2) var(--tt-space-3); }
    .reward__glyph { display: grid; place-items: center; flex: none; inline-size: 40px; block-size: 40px; border-radius: var(--tt-radius-md); border: 1px solid var(--tt-gold-600); background: var(--tt-surface-2); color: var(--tt-gold-400); transform: skewX(-9deg); }
    .reward--compact .reward__glyph { inline-size: 32px; block-size: 32px; }
    .reward__glyph tt-icon { transform: skewX(9deg); }
    .reward__body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-inline-size: 0; }
    .reward__title { font-size: var(--tt-text-sm); line-height: var(--tt-leading-snug); }
    .reward__meta { font-size: var(--tt-caption); color: var(--tt-text-muted); }
    .reward__side { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }
    .chip { padding: 2px 8px; border-radius: var(--tt-radius-pill); border: 1px solid var(--tt-border-strong); color: var(--tt-text-muted); font-size: 10px; font-weight: 800; letter-spacing: 0.04em; white-space: nowrap; }
    .chip--live { color: var(--tt-energy); border-color: rgba(47, 211, 111, 0.4); }
    .chip--held { color: var(--tt-gold-400); border-color: var(--tt-gold-600); }
    @media (max-width: 420px) { .reward { flex-wrap: wrap; } .reward__side { flex-direction: row; align-items: center; inline-size: 100%; justify-content: space-between; } }
  `],
})
export class RewardCardComponent {
  @Input({ required: true }) reward!: Reward;
  @Input() compact = false;
  @Input() selected = false;
  @Input() busy = false;
  /** Which action the card offers, if any. */
  @Input() action: 'use' | 'remove' | null = null;
  @Output() readonly use = new EventEmitter<string>();
  @Output() readonly remove = new EventEmitter<string>();

  get spent(): boolean {
    return this.reward.status === 'REDEEMED' || this.reward.status === 'EXPIRED' || this.reward.status === 'REVOKED';
  }

  get icon(): IconName {
    switch (this.reward.kind) {
      case 'NEXT_ORDER_COINS':
      case 'EXTRA_COINS':
        return 'coins';
      case 'NEXT_ORDER_CREDIT':
        return 'tag';
      case 'POINTS_MULTIPLIER':
        return 'bolt';
      case 'TIER_BOOST':
        return 'crown';
      case 'OFFER_UNLOCK':
        return 'package';
      default:
        return 'star';
    }
  }

  get statusLabel(): string {
    switch (this.reward.status) {
      case 'AVAILABLE':
        return 'זמינה';
      case 'RESERVED':
        return 'בהזמנה פתוחה';
      case 'REDEEMED':
        return this.reward.usage === 'immediate' ? 'הופעלה' : 'נוצלה';
      case 'EXPIRED':
        return 'פג תוקף';
      default:
        return 'בוטלה';
    }
  }

  /** When and how it applies, in one line. */
  get meta(): string {
    const source = SOURCE_LABELS[this.reward.source] ?? '';
    if (this.reward.status === 'REDEEMED' && this.reward.usage !== 'immediate') {
      return `${source} · נוצלה בהזמנה`;
    }
    if (this.reward.usage === 'immediate') {
      return `${source} · נכנס לחשבון מיד`;
    }
    if (this.reward.usage === 'automatic') {
      return `${source} · חל מעצמו על ההזמנה הבאה ששולמה`;
    }
    const parts = [source, 'להזמנה הבאה, בוחרים בעגלה'];
    if (this.reward.minOrder) {
      parts.push(`מ־${Math.ceil(this.reward.minOrder.amountMinor / 100)} ₪`);
    }
    if (this.reward.expiresAt) {
      parts.push(`עד ${new Date(this.reward.expiresAt).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}`);
    }
    return parts.filter(Boolean).join(' · ');
  }

  /** The value, in the customer's units, for a caller that wants it big. */
  static valueLabel(reward: Reward): string {
    switch (reward.kind) {
      case 'NEXT_ORDER_COINS':
      case 'EXTRA_COINS':
        return `+${formatQuantity(reward.value)}`;
      case 'NEXT_ORDER_CREDIT':
        return `₪${Math.round(reward.value / 100)}`;
      case 'POINTS_BONUS':
        return `+${reward.value}`;
      case 'POINTS_MULTIPLIER':
        return `×${reward.value / 100}`;
      case 'TIER_BOOST':
        return `+${reward.value}`;
      default:
        return '';
    }
  }
}

const SOURCE_LABELS: Readonly<Record<Reward['source'], string>> = {
  EASYDROP: 'EASYDROP',
  EASYBACK: 'EASYBACK',
  REFERRAL_REFERRER: 'חבר מביא חבר',
  REFERRAL_FRIEND: 'הגעתם דרך חבר',
  STREAK: 'רצף הזמנות',
  FOUNDER: 'FIRST XI',
  CAMPAIGN: 'DROP ZONE',
};
