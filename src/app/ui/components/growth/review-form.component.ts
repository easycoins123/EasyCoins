import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { OrderId, toAppError } from '../../../domain';
import { GrowthFacade } from '../../../state/growth.facade';
import { IconComponent } from '../icon.component';

/**
 * A verified-purchase review, offered on a delivered order only.
 *
 * The server refuses anything else: an order that is not delivered, an order
 * that is not the caller's, a second review of the same order. What is
 * accepted is recorded as a verified purchase because a paid, delivered order
 * stands behind it, and it waits for an operator unless publishing is on.
 */
@Component({
  selector: 'tt-review-form',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="review tt-card tt-card--pad" *ngIf="!done(); else thanks">
      <header class="review__head">
        <span class="review__glyph" aria-hidden="true"><tt-icon name="star" [size]="18"></tt-icon></span>
        <div>
          <p class="tt-eyebrow">רכישה מאומתת</p>
          <h2>איך היה?</h2>
        </div>
      </header>
      <p class="tt-muted small">הביקורת נרשמת על ההזמנה הזו בלבד, ומסומנת כרכישה מאומתת כי היא באמת שולמה וסופקה. היא מתפרסמת אחרי בדיקה.</p>
      <form (submit)="submit($event)" novalidate>
        <div class="stars" role="radiogroup" aria-label="דירוג">
          <button type="button" class="star" *ngFor="let value of [1, 2, 3, 4, 5]" role="radio" [attr.aria-checked]="rating() === value" [class.star--on]="value <= rating()" (click)="rating.set(value)" [attr.aria-label]="value + ' מתוך 5'">
            <tt-icon name="star" [size]="24"></tt-icon>
          </button>
        </div>
        <label class="tt-field">
          <span class="tt-label" for="review-title">כותרת (אופציונלי)</span>
          <input id="review-title" class="tt-input" type="text" name="title" maxlength="80" [(ngModel)]="title" />
        </label>
        <label class="tt-field">
          <span class="tt-label" for="review-body">מה תרצו לספר?</span>
          <textarea id="review-body" class="tt-textarea" name="body" maxlength="1000" [(ngModel)]="body" required></textarea>
          <span class="tt-hint">לפחות 10 תווים. בלי פרטים אישיים, בלי שמות משתמש.</span>
        </label>
        <p class="tt-alert tt-alert--danger" role="alert" *ngIf="error()">{{ error() }}</p>
        <button type="submit" class="tt-btn tt-btn--buy" [disabled]="busy() || rating() === 0 || body.trim().length < 10" [class.tt-btn--loading]="busy()">שליחת הביקורת</button>
      </form>
    </section>
    <ng-template #thanks>
      <section class="review tt-card tt-card--pad review--done">
        <span class="review__glyph" aria-hidden="true"><tt-icon name="check" [size]="18"></tt-icon></span>
        <div><strong>תודה! הביקורת נשמרה כרכישה מאומתת.</strong><p class="tt-muted small">היא תופיע באתר אחרי בדיקה קצרה.</p></div>
      </section>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }
    .review { margin-block-start: var(--tt-space-5); }
    .review--done { display: flex; align-items: center; gap: var(--tt-space-3); }
    .review--done p { margin: 0; }
    .review__head { display: flex; align-items: center; gap: var(--tt-space-3); margin-block-end: var(--tt-space-2); }
    .review__head h2 { margin: 2px 0 0; font-size: var(--tt-text-xl); }
    .review__glyph { display: grid; place-items: center; flex: none; inline-size: 40px; block-size: 40px; border-radius: var(--tt-radius-md); border: 1px solid var(--tt-gold-600); background: var(--tt-surface-2); color: var(--tt-gold-400); transform: skewX(-9deg); }
    .review__glyph tt-icon { transform: skewX(9deg); }
    .small { font-size: var(--tt-text-sm); }
    form { display: flex; flex-direction: column; gap: var(--tt-space-3); align-items: flex-start; }
    .tt-field { inline-size: 100%; }
    .stars { display: flex; gap: 4px; }
    .star { display: grid; place-items: center; inline-size: 44px; block-size: 44px; border: 0; background: transparent; color: var(--tt-text-faint); cursor: pointer; }
    .star--on { color: var(--tt-gold-400); }
    .star:focus-visible { outline: 2px solid var(--tt-gold-400); border-radius: var(--tt-radius-sm); }
  `],
})
export class ReviewFormComponent {
  private readonly growth = inject(GrowthFacade);

  @Input({ required: true }) orderId!: OrderId;

  readonly rating = signal(0);
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal<string | null>(null);
  title = '';
  body = '';

  submit(event: Event): void {
    event.preventDefault();
    if (this.busy() || this.rating() === 0 || this.body.trim().length < 10) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.growth.submitReview({
      orderId: this.orderId,
      rating: this.rating() as 1 | 2 | 3 | 4 | 5,
      title: this.title.trim() || undefined,
      body: this.body.trim(),
    }).subscribe({
      next: () => {
        this.busy.set(false);
        this.done.set(true);
      },
      error: (cause: unknown) => {
        this.busy.set(false);
        this.error.set(toAppError(cause).userMessage.he);
      },
    });
  }
}
