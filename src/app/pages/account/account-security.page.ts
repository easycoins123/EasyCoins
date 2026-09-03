import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/analytics';
import { NotificationService } from '../../core/error';
import { CustomerApiService } from '../../data/api';
import { localized, toAppError } from '../../domain';
import { AuthFacade } from '../../state/customer.facade';
import { IconComponent } from '../../ui';

/**
 * Account security: changing the password.
 *
 * Reached only by a signed-in customer (the route is guarded). The current
 * password is asked for even though the session already proves identity: a
 * borrowed unlocked phone must not be enough to lock the owner out. An account
 * opened with Google has no password yet; the server accepts an empty current
 * password in that one case, and the hint says so.
 */
@Component({
  selector: 'tt-account-security-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section narrow">
      <a class="back" routerLink="/account"><tt-icon name="chevron" [size]="14"></tt-icon> החשבון שלי</a>
      <header class="head">
        <h1>אבטחת החשבון</h1>
        <p class="tt-muted">{{ auth.customer()?.email }}</p>
      </header>

      <form class="tt-card tt-card--pad form" (submit)="submit($event)" novalidate>
        <h2>שינוי סיסמה</h2>

        <label class="tt-field">
          <span class="tt-label" for="sec-current">הסיסמה הנוכחית</span>
          <input id="sec-current" class="tt-input" type="password" name="current" autocomplete="current-password"
                 [(ngModel)]="current" placeholder="השאירו ריק אם נרשמתם עם Google" />
        </label>

        <label class="tt-field">
          <span class="tt-label" for="sec-next">סיסמה חדשה</span>
          <input id="sec-next" class="tt-input" type="password" name="next" autocomplete="new-password"
                 [(ngModel)]="next" required minlength="8" placeholder="לפחות 8 תווים"
                 [attr.aria-invalid]="fieldError() ? 'true' : null" aria-describedby="sec-next-error" />
          <span id="sec-next-error" class="tt-error" *ngIf="fieldError()">{{ fieldError() }}</span>
        </label>

        <label class="tt-field">
          <span class="tt-label" for="sec-confirm">אימות הסיסמה החדשה</span>
          <input id="sec-confirm" class="tt-input" type="password" name="confirm" autocomplete="new-password"
                 [(ngModel)]="confirm" required />
        </label>

        <p class="tt-alert tt-alert--danger" role="alert" *ngIf="error()">{{ error() }}</p>

        <button type="submit" class="tt-btn tt-btn--primary tt-btn--lg" [disabled]="busy()">
          {{ busy() ? 'מעדכנים…' : 'עדכון הסיסמה' }}
        </button>
        <p class="tt-hint">שינוי סיסמה לא מנתק את המכשיר הזה. איפוס סיסמה דרך קישור במייל מנתק את כל המכשירים.</p>
      </form>
    </div>
  `,
  styles: [`
    .narrow { max-inline-size: 520px; }
    .back { display: inline-flex; align-items: center; gap: 4px; margin-block-end: var(--tt-space-4); color: var(--tt-text-muted); font-size: var(--tt-text-sm); font-weight: 600; }
    .back tt-icon { transform: rotate(180deg); }
    .head { margin-block-end: var(--tt-space-5); }
    .head h1 { margin: 0 0 var(--tt-space-1); font-size: var(--tt-text-2xl); }
    .head p { margin: 0; }
    .form { display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .form h2 { margin: 0 0 var(--tt-space-1); font-size: var(--tt-text-lg); }
    .tt-field { display: flex; flex-direction: column; gap: var(--tt-space-1); }
    .tt-input[aria-invalid='true'] { border-color: var(--tt-danger); }
    .tt-btn { align-self: flex-start; }
  `],
})
export class AccountSecurityPage {
  readonly auth = inject(AuthFacade);
  private readonly customerApi = inject(CustomerApiService);
  private readonly notifications = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly router = inject(Router);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldError = signal<string | null>(null);

  current = '';
  next = '';
  confirm = '';

  constructor() {
    this.analytics.pageView('/account/security', 'Account security');
  }

  submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    this.error.set(null);
    this.fieldError.set(null);

    if (this.next.length < 8) {
      this.fieldError.set('הסיסמה החדשה צריכה להיות באורך 8 תווים לפחות.');
      return;
    }
    if (this.next !== this.confirm) {
      this.fieldError.set('שתי הסיסמאות אינן זהות.');
      return;
    }

    this.busy.set(true);
    this.customerApi.changePassword(this.current, this.next).subscribe({
      next: () => {
        this.busy.set(false);
        this.current = this.next = this.confirm = '';
        this.notifications.success(localized('הסיסמה עודכנה.', 'Your password was updated.'));
        void this.router.navigate(['/account']);
      },
      error: (cause: unknown) => {
        this.busy.set(false);
        const failure = toAppError(cause);
        const password = failure.fieldErrors.find((entry) => entry.field === 'password');
        if (password) {
          this.fieldError.set(password.message.he);
        } else {
          this.error.set(failure.code === 'INVALID_CREDENTIALS' ? 'הסיסמה הנוכחית שגויה.' : failure.userMessage.he);
        }
      },
    });
  }
}
