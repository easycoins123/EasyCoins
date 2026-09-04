import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { formatQuantity } from '../../../core/value';
import { AppliedBenefit, CartBenefits, RejectedBenefit } from '../../../domain';
import { MoneyPipe } from '../../money.pipe';
import { IconComponent } from '../icon.component';

/**
 * Which benefits are on this order, and which were set aside and why.
 *
 * Repeats the server's stacking decision word for word: the reason a coupon
 * or a reward is not applying comes from the same answer that priced the
 * cart, so the cart, the checkout and the order can never disagree.
 */
@Component({
  selector: 'tt-benefits-note',
  standalone: true,
  imports: [CommonModule, IconComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="note" *ngIf="benefits && (benefits.applied.length > 0 || benefits.rejected.length > 0)">
      <li class="note__row note__row--on" *ngFor="let benefit of benefits.applied">
        <tt-icon name="check" [size]="13"></tt-icon>
        <span class="note__text"><strong>{{ benefit.label.he }}</strong> {{ effectOf(benefit) }}</span>
      </li>
      <li class="note__row note__row--off" *ngFor="let benefit of benefits.rejected">
        <tt-icon name="info" [size]="13"></tt-icon>
        <span class="note__text"><strong>{{ benefit.label.he }}</strong> {{ reasonOf(benefit) }}</span>
      </li>
    </ul>
  `,
  styles: [`
    :host { display: block; }
    .note { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .note__row { display: flex; align-items: flex-start; gap: 8px; font-size: var(--tt-caption); line-height: var(--tt-leading-snug); }
    .note__row tt-icon { flex: none; margin-block-start: 2px; }
    .note__row--on tt-icon { color: var(--tt-energy); }
    .note__row--off { color: var(--tt-text-muted); }
    .note__row--off tt-icon { color: var(--tt-gold-400); }
    .note__text strong { font-weight: 800; }
  `],
})
export class BenefitsNoteComponent {
  @Input() benefits: CartBenefits | null | undefined;

  effectOf(benefit: AppliedBenefit): string {
    const parts: string[] = [];
    if (benefit.effect.coins > 0) {
      parts.push(`+${formatQuantity(benefit.effect.coins)} קוינס בהזמנה הזו`);
    }
    if (benefit.effect.discount.amountMinor > 0) {
      parts.push(`−${new MoneyPipe().transform(benefit.effect.discount)} מהסכום`);
    }
    return parts.length > 0 ? `· ${parts.join(' · ')}` : '· בהזמנה';
  }

  reasonOf(benefit: RejectedBenefit): string {
    return `· ${benefit.reason.he}`;
  }
}
