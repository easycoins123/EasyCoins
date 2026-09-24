import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { EasyDrop, OrderId, toAppError } from '../../../domain';
import { GrowthFacade } from '../../../state/growth.facade';
import { AuthFacade } from '../../../state/customer.facade';
import { IconComponent } from '../icon.component';
import { RewardCardComponent } from './reward-card.component';

type Phase = 'loading' | 'none' | 'closed' | 'opening' | 'open';

/**
 * EASYDROP on the success page: three closed cards, one pick, one reward.
 *
 * The cards are decorative until the server answers. Which card the customer
 * taps is sent as an index; what was behind it comes back from the ledger,
 * where it was drawn when the order was paid. A refresh finds the drop
 * already open and shows the same reward, so nothing here can be re-rolled.
 *
 * Built for a phone: three cards across, a flip in CSS, no modal, no canvas,
 * no library. Under reduced motion the cards simply change state.
 */
@Component({
  selector: 'tt-easydrop-reveal',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent, RewardCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="drop" *ngIf="phase() !== 'none' && phase() !== 'loading'" [class.drop--open]="phase() === 'open'" aria-live="polite">
      <header class="drop__head">
        <span class="drop__eyebrow"><tt-icon name="gift" [size]="14"></tt-icon> EASYDROP · {{ drop()?.tierName?.he }}</span>
        <h2>{{ phase() === 'open' ? 'ההטבה שלכם' : 'פתחת EASYDROP' }}</h2>
        <p class="drop__lede">
          <ng-container *ngIf="phase() !== 'open'">בחרו קלף אחד. מאחורי כל קלף יש הטבה אמיתית, אין קלף ריק. הבחירה נשמרת פעם אחת.</ng-container>
          <ng-container *ngIf="phase() === 'open'">{{ usageLine }}</ng-container>
        </p>
      </header>

      <div class="cards" role="group" aria-label="קלפי EASYDROP">
        <button type="button" class="card" *ngFor="let index of indexes(); trackBy: trackByIndex"
                [class.card--picked]="drop()?.pickedIndex === index"
                [class.card--other]="phase() === 'open' && drop()?.pickedIndex !== index"
                [class.card--busy]="phase() === 'opening' && picking() === index"
                [disabled]="phase() !== 'closed'"
                [attr.aria-label]="'קלף ' + (index + 1) + (drop()?.pickedIndex === index ? ', נבחר' : '')"
                (click)="pick(index)">
          <span class="card__inner">
            <span class="card__face card__face--front">
              <span class="card__emblem" aria-hidden="true"><tt-icon name="mark" [size]="34"></tt-icon></span>
              <span class="card__label">EASYDROP</span>
              <span class="card__n tt-figure">{{ index + 1 }}</span>
            </span>
            <span class="card__face card__face--back">
              <ng-container *ngIf="drop()?.pickedIndex === index && drop()?.reward as reward">
                <span class="card__value tt-figure">{{ valueOf(reward) }}</span>
                <span class="card__title" dir="auto">{{ reward.title.he }}</span>
              </ng-container>
            </span>
          </span>
        </button>
      </div>

      <p class="tt-alert tt-alert--danger" role="alert" *ngIf="error()">{{ error() }}</p>

      <div class="drop__result" *ngIf="phase() === 'open' && drop()?.reward as reward">
        <tt-reward-card [reward]="reward"></tt-reward-card>
        <div class="drop__actions">
          <a class="tt-btn tt-btn--buy" routerLink="/store" *ngIf="reward.usage === 'checkout'"><tt-icon name="coin" [size]="16"></tt-icon> להשתמש בהזמנה הבאה</a>
          <a class="tt-btn tt-btn--ghost" [routerLink]="auth.isAuthenticated() ? '/account/club' : '/account'" [queryParams]="auth.isAuthenticated() ? null : { mode: 'register', returnTo: '/account/club' }">
            {{ auth.isAuthenticated() ? 'ל־EASYCLUB' : 'פתחו חשבון כדי לשמור את ההטבה' }}
          </a>
        </div>
        <p class="drop__fine tt-faint" *ngIf="!auth.isAuthenticated()">ההטבה שמורה לדפדפן הזה. חשבון שומר אותה מכל מכשיר, ומעביר אליו גם את ההזמנה הזו.</p>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .drop { margin-block-end: var(--tt-space-6); padding: var(--tt-space-5); border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-lg); background: radial-gradient(70% 60% at 50% 0%, rgba(212, 180, 106, 0.16), transparent 70%), linear-gradient(180deg, #17161A, var(--tt-surface) 70%); }
    .drop__head { display: flex; flex-direction: column; gap: var(--tt-space-1); align-items: center; text-align: center; margin-block-end: var(--tt-space-4); }
    .drop__eyebrow { display: inline-flex; align-items: center; gap: 6px; font-size: var(--tt-caption); font-weight: 800; letter-spacing: 0.1em; color: var(--tt-gold-400); text-transform: uppercase; }
    .drop h2 { margin: 0; font-size: var(--tt-display-3); }
    .drop__lede { margin: 0; max-inline-size: 46ch; color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading-snug); }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--tt-space-3); max-inline-size: 560px; margin-inline: auto; perspective: 1000px; }
    .card { position: relative; aspect-ratio: 3 / 4; padding: 0; border: 0; background: transparent; cursor: pointer; font: inherit; color: inherit; transition: transform var(--tt-duration) var(--tt-ease); }
    .card:disabled { cursor: default; }
    .card:not(:disabled):hover { transform: translateY(-4px); }
    .card:focus-visible { outline: 2px solid var(--tt-gold-400); outline-offset: 4px; border-radius: var(--tt-radius-md); }
    .card__inner { position: relative; display: block; inline-size: 100%; block-size: 100%; transform-style: preserve-3d; transition: transform 640ms var(--tt-ease-out); }
    .card--picked .card__inner { transform: rotateY(180deg); }
    .card--busy .card__inner { animation: tt-drop-shake 600ms var(--tt-ease) infinite alternate; }
    @keyframes tt-drop-shake { from { transform: rotateY(-8deg); } to { transform: rotateY(8deg); } }
    .card--other { opacity: 0.35; filter: saturate(0.4); transform: scale(0.94); }
    .card__face { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--tt-space-2); padding: var(--tt-space-3); border-radius: var(--tt-radius-md); backface-visibility: hidden; -webkit-backface-visibility: hidden; }
    .card__face--front { border: 1px solid var(--tt-gold-600); background: linear-gradient(160deg, #1B1912, #0F0D0A 60%); box-shadow: inset 0 1px 0 rgba(255, 248, 235, 0.08), 0 14px 30px rgba(0, 0, 0, 0.5); }
    .card__face--front::after { content: ''; position: absolute; inset: 6px; border: 1px dashed rgba(212, 180, 106, 0.35); border-radius: calc(var(--tt-radius-md) - 4px); pointer-events: none; }
    .card__face--back { transform: rotateY(180deg); border: 1px solid var(--tt-gold-400); background: var(--tt-gold-metal); color: var(--tt-text-on-gold); text-align: center; }
    .card__emblem { color: var(--tt-gold-400); }
    .card__label { font-size: 10px; font-weight: 800; letter-spacing: 0.18em; color: var(--tt-gold-400); }
    .card__n { position: absolute; inset-block-start: 8px; inset-inline-start: 10px; font-size: var(--tt-text-md); color: var(--tt-text-faint); }
    .card__value { font-size: clamp(1.4rem, 6vw, 2.2rem); }
    .card__title { font-size: var(--tt-caption); font-weight: 800; line-height: var(--tt-leading-snug); }
    .drop__result { display: flex; flex-direction: column; gap: var(--tt-space-3); max-inline-size: 560px; margin: var(--tt-space-5) auto 0; }
    .drop__actions { display: flex; flex-wrap: wrap; gap: var(--tt-space-2); }
    .drop__actions .tt-btn { flex: 1 1 200px; }
    .drop__fine { margin: 0; font-size: var(--tt-caption); }
    .tt-alert { margin: var(--tt-space-3) auto 0; max-inline-size: 560px; }
    @media (prefers-reduced-motion: reduce) {
      .card, .card__inner { transition: none; }
      .card--busy .card__inner { animation: none; }
    }
    @media (max-width: 360px) { .cards { gap: var(--tt-space-2); } .drop { padding: var(--tt-space-4); } }
  `],
})
export class EasyDropRevealComponent implements OnInit {
  private readonly growth = inject(GrowthFacade);
  readonly auth = inject(AuthFacade);

  @Input({ required: true }) orderId!: OrderId;

  readonly phase = signal<Phase>('loading');
  readonly drop = signal<EasyDrop | undefined>(undefined);
  readonly picking = signal<number | null>(null);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.growth.easyDrop(this.orderId).subscribe((drop) => {
      this.drop.set(drop);
      this.phase.set(!drop ? 'none' : drop.status === 'REVEALED' ? 'open' : 'closed');
    });
  }

  indexes(): number[] {
    return Array.from({ length: this.drop()?.cardCount ?? 3 }, (_, index) => index);
  }

  trackByIndex(index: number): number {
    return index;
  }

  pick(index: number): void {
    if (this.phase() !== 'closed') {
      return;
    }
    this.phase.set('opening');
    this.picking.set(index);
    this.error.set(null);
    this.growth.reveal(this.orderId, index).subscribe({
      next: (drop) => {
        this.drop.set(drop);
        this.picking.set(null);
        this.phase.set(drop.status === 'REVEALED' ? 'open' : 'closed');
      },
      error: (cause: unknown) => {
        this.picking.set(null);
        this.phase.set('closed');
        this.error.set(toAppError(cause).userMessage.he);
      },
    });
  }

  valueOf(reward: NonNullable<EasyDrop['reward']>): string {
    return RewardCardComponent.valueLabel(reward);
  }

  /** When the reward takes effect, said once, plainly. */
  get usageLine(): string {
    const reward = this.drop()?.reward;
    if (!reward) {
      return '';
    }
    switch (reward.usage) {
      case 'checkout':
        return 'להזמנה הבאה. ההטבה מחכה בעגלה ובחשבון, ומצטרפת לבונוס ההשקה. הטבה אחת מהסוג הזה להזמנה.';
      case 'automatic':
        return 'חל מעצמו על ההזמנה הבאה ששולמה. לא צריך לעשות דבר.';
      default:
        return 'נכנס לחשבון עכשיו. רואים את זה ב־EASYCLUB.';
    }
  }
}
