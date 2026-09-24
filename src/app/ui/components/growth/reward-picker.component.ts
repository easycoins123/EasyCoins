import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Reward } from '../../../domain';
import { IconComponent } from '../icon.component';
import { RewardCardComponent } from './reward-card.component';

/**
 * "ההטבות שלי" in the cart: the rewards a customer can put on this order.
 *
 * One at a time, chosen by the customer, priced by the server. A reward the
 * server set aside stays listed with its reason next to the total, so the
 * customer sees what would make it apply rather than a button that does
 * nothing.
 */
@Component({
  selector: 'tt-reward-picker',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent, RewardCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="picker" *ngIf="rewards.length > 0 || selectedId">
      <header class="picker__head">
        <span class="picker__glyph" aria-hidden="true"><tt-icon name="gift" [size]="16"></tt-icon></span>
        <span class="picker__title"><strong>ההטבות שלי</strong><span class="tt-faint">הטבה אחת להזמנה, מצטרפת לבונוס ההשקה</span></span>
        <a class="picker__all" routerLink="/account/club">כל ההטבות</a>
      </header>
      <ul class="picker__list">
        <li *ngFor="let reward of rewards; trackBy: trackById">
          <tt-reward-card [reward]="reward" [compact]="true" [busy]="busy"
                          [selected]="reward.id === selectedId"
                          [action]="reward.id === selectedId ? 'remove' : 'use'"
                          (use)="select.emit($event)" (remove)="clear.emit()"></tt-reward-card>
        </li>
      </ul>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .picker { display: flex; flex-direction: column; gap: var(--tt-space-2); }
    .picker__head { display: flex; align-items: center; gap: var(--tt-space-2); }
    .picker__glyph { display: grid; place-items: center; inline-size: 28px; block-size: 28px; border-radius: 50%; background: var(--tt-gold-metal); color: var(--tt-text-on-gold); }
    .picker__title { display: flex; flex-direction: column; flex: 1; min-inline-size: 0; font-size: var(--tt-text-sm); }
    .picker__title .tt-faint { font-size: var(--tt-caption); }
    .picker__all { font-size: var(--tt-caption); font-weight: 700; white-space: nowrap; }
    .picker__list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--tt-space-2); }
  `],
})
export class RewardPickerComponent {
  @Input() rewards: readonly Reward[] = [];
  @Input() selectedId?: string;
  @Input() busy = false;
  @Output() readonly select = new EventEmitter<string>();
  @Output() readonly clear = new EventEmitter<void>();

  trackById(_index: number, reward: Reward): string {
    return reward.id;
  }
}
