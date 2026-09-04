import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { formatQuantity } from '../../../core/value';
import { CoinProduct, Offer } from '../../../domain';
import { MoneyPipe } from '../../money.pipe';
import { IconComponent } from '../icon.component';
import { parseCoins } from './custom-coins.component';

/**
 * "כמה חסר לי?": the player goal calculator, honest edition.
 *
 * The customer types the price of the card or squad they want and what they
 * already have; the gap is arithmetic. The recommendation is the smallest
 * bundle whose coins (bonus included) cover it, or a custom amount handed to
 * the custom-coins box. There is no live player-price source connected, and
 * the screen says so rather than showing a number it does not have.
 */
@Component({
  selector: 'tt-player-goal',
  standalone: true,
  imports: [CommonModule, MoneyPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="goal tt-plate" id="goal">
      <header class="goal__head">
        <span class="tt-eyebrow">PLAYER GOAL</span>
        <h2>כמה חסר לי?</h2>
        <p class="tt-muted">מזינים את המחיר של השחקן או ההרכב שאתם רוצים ואת היתרה שיש לכם. נגיד כמה חסר ומה הקנייה הקטנה ביותר שסוגרת את הפער.</p>
      </header>

      <div class="goal__grid">
        <div class="inputs">
          <label class="tt-field">
            <span class="tt-label" for="goal-target">מחיר היעד בקוינס</span>
            <input id="goal-target" class="tt-input tt-numeric" type="text" inputmode="numeric" autocomplete="off" placeholder="לדוגמה 850K" [value]="targetText()" (input)="targetText.set(read($event))" />
          </label>
          <label class="tt-field">
            <span class="tt-label" for="goal-balance">היתרה שלכם היום</span>
            <input id="goal-balance" class="tt-input tt-numeric" type="text" inputmode="numeric" autocomplete="off" placeholder="לדוגמה 210K" [value]="balanceText()" (input)="balanceText.set(read($event))" />
          </label>
          <p class="soon tt-faint">
            <tt-icon name="info" [size]="13"></tt-icon>
            חיפוש מחיר שחקן חי לא מחובר עדיין. מזינים את המחיר מהמשחק ידנית; כשיהיה מקור נתונים חוקי, החיפוש יופיע כאן.
          </p>
        </div>

        <div class="answer" aria-live="polite">
          <ng-container *ngIf="gap() as gap; else waiting">
            <p class="answer__gap"><span class="tt-eyebrow">חסרים לכם</span><span class="tt-figure answer__n">{{ label(gap) }}</span></p>
            <ng-container *ngIf="recommendation() as pick; else customOnly">
              <p class="answer__line">החבילה הקטנה ביותר שסוגרת את הפער: <strong>{{ label(pick.amount) }}</strong><ng-container *ngIf="pick.bonus > 0"> + {{ label(pick.bonus) }} בונוס</ng-container> = <strong>{{ label(pick.totalCoins) }}</strong> ב־<strong class="tt-price">{{ pick.offer.price.current | money }}</strong></p>
              <p class="answer__spare tt-faint" *ngIf="pick.totalCoins - gap > 0">נשארים לכם {{ label(pick.totalCoins - gap) }} קוינס עודפים.</p>
              <div class="answer__actions">
                <button type="button" class="tt-btn tt-btn--buy" [disabled]="busy" (click)="buy.emit(pick.offer)"><tt-icon name="cart" [size]="16"></tt-icon> הוספת {{ label(pick.amount) }} לסל</button>
                <button type="button" class="tt-btn tt-btn--ghost" (click)="custom.emit(customAmount())">כמות מדויקת: {{ label(customAmount()) }}</button>
              </div>
            </ng-container>
            <ng-template #customOnly>
              <p class="answer__line">הפער גדול מהחבילה הגדולה ביותר. כמות מותאמת של <strong>{{ label(customAmount()) }}</strong> תסגור אותו.</p>
              <div class="answer__actions">
                <button type="button" class="tt-btn tt-btn--buy" (click)="custom.emit(customAmount())">לכמות מותאמת</button>
              </div>
            </ng-template>
          </ng-container>
          <ng-template #waiting>
            <p class="answer__empty tt-muted">{{ covered() ? 'היתרה שלכם כבר מכסה את היעד.' : 'הזינו יעד ויתרה, החישוב יופיע כאן.' }}</p>
          </ng-template>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .goal { padding: var(--tt-space-5); border-radius: var(--tt-radius-lg); scroll-margin-block-start: calc(var(--tt-header-height) + var(--tt-space-4)); }
    .goal__head { display: flex; flex-direction: column; gap: var(--tt-space-1); margin-block-end: var(--tt-space-4); }
    .goal__head h2 { margin: 0; }
    .goal__head p { margin: 0; max-inline-size: 60ch; font-size: var(--tt-text-sm); }
    .goal__grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: var(--tt-space-5); align-items: start; }
    .inputs { display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .tt-input { direction: ltr; text-align: start; }
    .soon { display: flex; gap: 6px; align-items: flex-start; margin: 0; font-size: var(--tt-caption); line-height: var(--tt-leading-snug); }
    .soon tt-icon { flex: none; margin-block-start: 2px; color: var(--tt-gold-400); }
    .answer { display: flex; flex-direction: column; gap: var(--tt-space-3); padding: var(--tt-space-4); border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-md); background: radial-gradient(70% 60% at 100% 0%, var(--tt-energy-soft), transparent 70%), var(--tt-surface-2); min-block-size: 160px; }
    .answer__gap { display: flex; flex-direction: column; gap: 2px; margin: 0; }
    .answer__n { font-size: 2.4rem; color: var(--tt-gold-400); }
    .answer__line { margin: 0; font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
    .answer__spare { margin: 0; font-size: var(--tt-caption); }
    .answer__actions { display: flex; flex-wrap: wrap; gap: var(--tt-space-2); }
    .answer__empty { margin: auto 0; text-align: center; font-size: var(--tt-text-sm); }
    @media (max-width: 860px) { .goal__grid { grid-template-columns: 1fr; } .goal { padding: var(--tt-space-4); } }
  `],
})
export class PlayerGoalComponent {
  @Input() products: readonly CoinProduct[] = [];
  @Input() stepCoins = 10_000;
  @Input() busy = false;
  @Output() readonly buy = new EventEmitter<Offer>();
  @Output() readonly custom = new EventEmitter<number>();

  readonly targetText = signal('');
  readonly balanceText = signal('');

  readonly gap = computed<number | undefined>(() => {
    const target = parseCoins(this.targetText());
    const balance = parseCoins(this.balanceText()) ?? (this.balanceText().trim() === '' ? 0 : undefined);
    if (!target || balance === undefined) {
      return undefined;
    }
    const gap = target - balance;
    return gap > 0 ? gap : undefined;
  });

  readonly covered = computed(() => {
    const target = parseCoins(this.targetText());
    const balance = parseCoins(this.balanceText());
    return target !== undefined && balance !== undefined && balance >= target;
  });

  /** The smallest bundle whose received coins cover the gap. */
  readonly recommendation = computed<CoinProduct | undefined>(() => {
    const gap = this.gap();
    if (!gap) {
      return undefined;
    }
    return [...this.products]
      .filter((product) => product.inStock)
      .sort((a, b) => a.totalCoins - b.totalCoins)
      .find((product) => product.totalCoins >= gap);
  });

  /** The gap on the custom step grid, rounded up. */
  readonly customAmount = computed(() => {
    const gap = this.gap() ?? 0;
    return Math.ceil(gap / this.stepCoins) * this.stepCoins;
  });

  read(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  label(value: number): string {
    return formatQuantity(value) || value.toLocaleString('he-IL');
  }
}
