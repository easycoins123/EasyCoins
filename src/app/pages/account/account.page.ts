import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/analytics';
import { NotificationService } from '../../core/error';
import { environment } from '../../../environments/environment';
import { AuthMethods, CustomerApiService } from '../../data/api';
import { localized, toAppError } from '../../domain';
import { AuthFacade } from '../../state/customer.facade';
import { IconComponent } from '../../ui';

type Mode = 'signIn' | 'register' | 'forgot';

/** Only same-site paths are followed after sign-in. */
function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }
  return value;
}

/**
 * The account screen: sign in, open an account, or manage the account.
 *
 * One screen with a mode toggle rather than three routes and a wizard. The
 * audience arrives from a phone, often from a social link, and every extra step
 * between them and a purchase costs conversions. Google first for the people who
 * do not want another password, email and password underneath for those who do.
 *
 * Nothing about identity is decided here. The screen asks `AuthFacade`, which
 * asks the server; until the answer arrives it shows a quiet skeleton rather
 * than a form that might be wrong. `returnTo` brings a customer back to what
 * they were doing, and only ever to a path on this site.
 */
@Component({
  selector: 'tt-account-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section narrow" [ngSwitch]="auth.status()">

      <!-- Not known yet. The same shape as the form, so nothing jumps. -->
      <div *ngSwitchCase="'checking'" class="skeleton" aria-busy="true" aria-label="בודקים את החיבור">
        <span class="tt-skeleton sk-title"></span>
        <span class="tt-skeleton sk-line"></span>
        <span class="tt-skeleton sk-card"></span>
      </div>

      <!-- Signed out -->
      <ng-container *ngSwitchCase="'anonymous'">
        <header class="head">
          <h1>{{ mode() === 'register' ? 'פתיחת חשבון' : mode() === 'forgot' ? 'איפוס סיסמה' : 'כניסה לחשבון' }}</h1>
          <p class="tt-muted">
            {{ mode() === 'register'
              ? 'חשבון שומר את ההזמנות שלכם ומאפשר לעקוב אחרי האספקה מכל מכשיר.'
              : mode() === 'forgot'
                ? 'נשלח לכתובת שלכם קישור לבחירת סיסמה חדשה.'
                : 'כדי לראות את ההזמנות שלכם ואת סטטוס האספקה.' }}
          </p>
        </header>

        <div class="tt-card tt-card--pad panel">
          <p class="tt-alert tt-alert--warning" *ngIf="googleOutcome() as outcome" role="status">
            {{ outcome === 'cancelled'
              ? 'הכניסה עם Google בוטלה. אפשר לנסות שוב או להיכנס עם אימייל וסיסמה.'
              : 'הכניסה עם Google לא הושלמה. אפשר לנסות שוב או להיכנס עם אימייל וסיסמה.' }}
          </p>

          <!-- Google, only when the server actually has credentials. -->
          <ng-container *ngIf="methods() as available">
            <ng-container *ngIf="available.google && mode() !== 'forgot'">
              <a class="google" [href]="googleUrl()">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6Z"/>
                  <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 21.4 7.6 24 12 24Z"/>
                  <path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3Z"/>
                  <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.6 0 3.7 2.6 1.8 6.1l3.8 3C6.5 6.7 9 4.8 12 4.8Z"/>
                </svg>
                {{ mode() === 'register' ? 'הרשמה עם Google' : 'המשך עם Google' }}
              </a>
              <div class="divider"><span>או</span></div>
            </ng-container>

            <p class="config-note" *ngIf="!available.google && showConfigHint">
              כניסה עם Google לא מוגדרת בסביבה הזו.
              <span class="config-note__keys">GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET · GOOGLE_REDIRECT_URI</span>
            </p>
          </ng-container>

          <form (submit)="submit($event)" novalidate>
            <label class="tt-field" *ngIf="mode() === 'register'">
              <span class="tt-label" for="acc-name">שם</span>
              <input id="acc-name" class="tt-input" type="text" name="name" autocomplete="given-name"
                     [(ngModel)]="displayName" maxlength="80" placeholder="איך לפנות אליכם" />
            </label>

            <label class="tt-field">
              <span class="tt-label" for="acc-email">אימייל</span>
              <input id="acc-email" class="tt-input" type="email" name="email" autocomplete="email"
                     inputmode="email" [(ngModel)]="email" required placeholder="you@example.com"
                     [attr.aria-invalid]="fieldErrors().email ? 'true' : null"
                     aria-describedby="acc-email-error" />
              <span id="acc-email-error" class="tt-error" *ngIf="fieldErrors().email">{{ fieldErrors().email }}</span>
            </label>

            <label class="tt-field" *ngIf="mode() !== 'forgot'">
              <span class="tt-label" for="acc-password">סיסמה</span>
              <span class="secret">
                <input id="acc-password" class="tt-input" name="password"
                       [type]="revealed() ? 'text' : 'password'"
                       [attr.autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'"
                       [(ngModel)]="password" required minlength="8" placeholder="לפחות 8 תווים"
                       [attr.aria-invalid]="fieldErrors().password ? 'true' : null"
                       aria-describedby="acc-password-error" />
                <button type="button" class="secret__toggle" (click)="revealed.set(!revealed())"
                        [attr.aria-pressed]="revealed()"
                        [attr.aria-label]="revealed() ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'">
                  {{ revealed() ? 'הסתרה' : 'הצגה' }}
                </button>
              </span>
              <span id="acc-password-error" class="tt-error" *ngIf="fieldErrors().password">{{ fieldErrors().password }}</span>
              <span class="tt-hint" *ngIf="mode() === 'register' && !fieldErrors().password">לפחות 8 תווים.</span>
            </label>

            <p class="tt-alert tt-alert--danger" role="alert" *ngIf="error()">{{ error() }}</p>
            <p class="tt-alert tt-alert--success" role="status" *ngIf="sent()">{{ sent() }}</p>

            <button type="submit" class="tt-btn tt-btn--primary tt-btn--lg tt-btn--block" [disabled]="busy()" [attr.aria-busy]="busy()">
              <span class="spinner" *ngIf="busy()" aria-hidden="true"></span>
              {{ busy() ? busyLabel : submitLabel }}
            </button>
          </form>

          <div class="switch">
            <button type="button" class="link" *ngIf="mode() !== 'register'" (click)="setMode('register')">
              אין לכם חשבון? פתחו חשבון
            </button>
            <button type="button" class="link" *ngIf="mode() !== 'signIn'" (click)="setMode('signIn')">
              כבר יש לכם חשבון? התחברו
            </button>
            <ng-container *ngIf="mode() === 'signIn'">
              <button type="button" class="link" *ngIf="methods()?.passwordReset !== false" (click)="setMode('forgot')">
                שכחתי סיסמה
              </button>
              <a class="link" routerLink="/support" *ngIf="methods()?.passwordReset === false">
                שכחתם סיסמה? פנו לתמיכה
              </a>
            </ng-container>
          </div>
        </div>

        <p class="fine tt-faint">
          אנחנו לא מבקשים סיסמה של חשבון המשחק, קוד אימות או קודי גיבוי. לעולם.
        </p>
      </ng-container>

      <!-- Signed in -->
      <ng-container *ngSwitchCase="'authenticated'">
        <header class="head head--in">
          <span class="avatar" aria-hidden="true">{{ auth.initials() }}</span>
          <div>
            <h1>שלום, {{ auth.displayName() }}</h1>
            <p class="tt-muted">{{ auth.customer()?.email }}</p>
          </div>
        </header>

        <nav class="tiles">
          <a class="tile" routerLink="/account/orders">
            <tt-icon name="box" [size]="20"></tt-icon>
            <span><strong>ההזמנות שלי</strong><span class="tt-faint">סטטוס תשלום ואספקה</span></span>
            <tt-icon name="chevron" [size]="16" dir="auto"></tt-icon>
          </a>
          <a class="tile" routerLink="/account/security">
            <tt-icon name="lock" [size]="20"></tt-icon>
            <span><strong>אבטחת החשבון</strong><span class="tt-faint">שינוי סיסמה</span></span>
            <tt-icon name="chevron" [size]="16" dir="auto"></tt-icon>
          </a>
          <a class="tile" routerLink="/support">
            <tt-icon name="shield" [size]="20"></tt-icon>
            <span><strong>תמיכה</strong><span class="tt-faint">שאלה על הזמנה או על מוצר</span></span>
            <tt-icon name="chevron" [size]="16" dir="auto"></tt-icon>
          </a>
        </nav>

        <section class="tt-card tt-card--pad">
          <h2>פרטיות</h2>
          <p class="tt-muted small">
            אפשר לבקש מחיקה של החשבון. הזמנות שבוצעו נשמרות כרשומה חשבונאית,
            ולכן המחיקה מטופלת ידנית ולא מוחקת אותן אוטומטית.
          </p>
          <div class="tt-row">
            <a class="tt-btn tt-btn--ghost" routerLink="/privacy">מדיניות הפרטיות</a>
            <button type="button" class="tt-btn tt-btn--quiet danger" (click)="requestDeletion()">בקשת מחיקת חשבון</button>
          </div>
          <p class="tt-alert tt-alert--danger" role="alert" *ngIf="error()">{{ error() }}</p>
        </section>

        <button type="button" class="tt-btn tt-btn--ghost" (click)="signOut()">
          <tt-icon name="logout" [size]="16"></tt-icon> התנתקות
        </button>
      </ng-container>
    </div>
  `,
  styles: [`
    .narrow { max-inline-size: 520px; }
    .head { margin-block-end: var(--tt-space-5); }
    .head h1 { margin: 0 0 var(--tt-space-1); font-size: var(--tt-display-3); }
    .head p { margin: 0; font-size: var(--tt-text-md); line-height: var(--tt-leading-snug); }
    .head--in { display: flex; align-items: center; gap: var(--tt-space-3); }
    .avatar {
      display: grid;
      place-items: center;
      inline-size: 52px;
      block-size: 52px;
      flex: none;
      border-radius: 50%;
      background: linear-gradient(160deg, var(--tt-brand-400), var(--tt-brand-700));
      color: var(--tt-text-on-brand);
      font-size: var(--tt-text-lg);
      font-weight: 800;
    }

    .skeleton { display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .sk-title { block-size: 28px; inline-size: 55%; }
    .sk-line { block-size: 16px; inline-size: 80%; }
    .sk-card { block-size: 360px; inline-size: 100%; border-radius: var(--tt-radius-lg); }

    .panel { display: flex; flex-direction: column; gap: var(--tt-space-4); }
    .google {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--tt-space-2);
      min-block-size: 48px;
      border-radius: var(--tt-radius-md);
      background: #ffffff;
      color: #1f1f1f;
      font-weight: 600;
      text-decoration: none;
    }
    .google:hover { text-decoration: none; filter: brightness(0.96); }

    .secret { position: relative; display: block; }
    .secret .tt-input { inline-size: 100%; padding-inline-end: 4.2rem; }
    .secret__toggle {
      position: absolute;
      inset-inline-end: var(--tt-space-2);
      inset-block-start: 50%;
      transform: translateY(-50%);
      min-block-size: 32px;
      padding-inline: var(--tt-space-2);
      border: 0;
      border-radius: var(--tt-radius-sm);
      background: transparent;
      color: var(--tt-text-muted);
      font: inherit;
      font-size: var(--tt-text-xs);
      font-weight: 600;
      cursor: pointer;
    }
    .secret__toggle:hover { color: var(--tt-text); background: var(--tt-surface-3); }
    .tt-input[aria-invalid='true'] { border-color: var(--tt-danger); }

    .config-note {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin: 0;
      padding: var(--tt-space-3);
      border: 1px dashed var(--tt-border-strong);
      border-radius: var(--tt-radius-md);
      color: var(--tt-text-muted);
      font-size: var(--tt-text-xs);
      line-height: var(--tt-leading-snug);
    }
    .config-note__keys { font-family: var(--tt-font-numeric); color: var(--tt-text-faint); direction: ltr; unicode-bidi: isolate; text-align: start; }

    .divider { display: flex; align-items: center; gap: var(--tt-space-3); color: var(--tt-text-faint); font-size: var(--tt-text-xs); }
    .divider::before, .divider::after { content: ''; flex: 1; block-size: 1px; background: var(--tt-border); }

    form { display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .tt-field { display: flex; flex-direction: column; gap: var(--tt-space-1); }
    .spinner {
      inline-size: 16px;
      block-size: 16px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-block-start-color: #fff;
      border-radius: 50%;
      animation: tt-spin 0.8s linear infinite;
    }
    @keyframes tt-spin { to { transform: rotate(360deg); } }

    .switch { display: flex; flex-direction: column; gap: var(--tt-space-2); align-items: flex-start; }
    .link { background: none; border: 0; padding: 0; color: var(--tt-brand-300); font: inherit; font-size: var(--tt-text-sm); cursor: pointer; text-align: start; }
    .link:hover { text-decoration: underline; }
    .fine { margin-block-start: var(--tt-space-4); text-align: center; }

    .tiles { display: flex; flex-direction: column; gap: var(--tt-space-2); margin-block-end: var(--tt-space-5); }
    .tile {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      min-block-size: 64px;
      padding-inline: var(--tt-space-4);
      border-radius: var(--tt-radius-lg);
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      color: inherit;
    }
    .tile:hover { border-color: var(--tt-border-strong); text-decoration: none; }
    .tile > span { display: flex; flex-direction: column; flex: 1; }
    .tile strong { font-size: var(--tt-text-sm); }
    .tile tt-icon:first-child { color: var(--tt-brand-400); }

    section { margin-block-end: var(--tt-space-4); }
    section h2 { margin: 0 0 var(--tt-space-2); font-size: var(--tt-text-lg); }
    .small { font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
    .danger { color: var(--tt-danger); }
  `],
})
export class AccountPage {
  readonly auth = inject(AuthFacade);
  private readonly customerApi = inject(CustomerApiService);
  private readonly notifications = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly methods = signal<AuthMethods | null>(null);
  readonly mode = signal<Mode>('signIn');
  readonly busy = signal(false);
  readonly revealed = signal(false);
  readonly error = signal<string | null>(null);
  readonly sent = signal<string | null>(null);
  readonly fieldErrors = signal<{ email?: string; password?: string }>({});

  /** Where to go after a successful sign-in, if the visitor came from somewhere. */
  readonly returnTo = safeReturnPath(this.route.snapshot.queryParamMap.get('returnTo'));

  /** Set when Google bounced the customer back here without signing them in. */
  readonly googleOutcome = signal<'failed' | 'cancelled' | null>(null);

  readonly showConfigHint = !environment.production;

  displayName = '';
  email = '';
  password = '';

  constructor() {
    this.analytics.pageView('/account', 'Account');

    const params = this.route.snapshot.queryParamMap;
    if (params.get('mode') === 'register') {
      this.mode.set('register');
    }
    const outcome = params.get('auth');
    if (outcome === 'failed' || outcome === 'cancelled') {
      this.googleOutcome.set(outcome);
    }

    this.auth.loadMethods().subscribe((methods) => this.methods.set(methods));
  }

  googleUrl(): string {
    return this.auth.googleStartUrl(this.returnTo ?? '/account');
  }

  get submitLabel(): string {
    if (this.mode() === 'register') {
      return 'פתיחת חשבון';
    }
    return this.mode() === 'forgot' ? 'שליחת קישור איפוס' : 'כניסה';
  }

  get busyLabel(): string {
    if (this.mode() === 'register') {
      return 'פותחים חשבון…';
    }
    return this.mode() === 'forgot' ? 'שולחים…' : 'נכנסים…';
  }

  setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.sent.set(null);
    this.fieldErrors.set({});
    this.googleOutcome.set(null);
  }

  submit(event: Event): void {
    event.preventDefault();
    if (this.busy() || !this.validate()) {
      return;
    }

    this.error.set(null);
    this.sent.set(null);
    this.googleOutcome.set(null);
    this.busy.set(true);

    const fail = (cause: unknown) => {
      this.busy.set(false);
      const error = toAppError(cause);
      const password = error.fieldErrors.find((entry) => entry.field === 'password');
      if (password) {
        this.fieldErrors.set({ password: password.message.he });
      }
      this.error.set(password ? null : error.userMessage.he);
    };

    if (this.mode() === 'forgot') {
      this.customerApi.requestPasswordReset(this.email.trim()).subscribe({
        next: () => {
          this.busy.set(false);
          // Says nothing about whether the address exists.
          this.sent.set('אם הכתובת רשומה אצלנו, נשלח אליה קישור לאיפוס הסיסמה.');
        },
        error: fail,
      });
      return;
    }

    if (this.mode() === 'register') {
      this.auth.register(this.email.trim(), this.password, this.displayName).subscribe({
        next: ({ signedIn }) => {
          this.busy.set(false);
          this.password = '';
          if (signedIn) {
            this.notifications.success(localized('החשבון נפתח. ברוכים הבאים ל־EASYCOINS!', 'Your account is open. Welcome to EASYCOINS!'));
            this.continueAfterSignIn();
            return;
          }
          // The server never says whether the address is taken, and neither
          // do we; the wording covers the two ways this can happen.
          this.error.set('לא הצלחנו לפתוח חשבון עם הכתובת הזו. אם כבר יש לכם חשבון, היכנסו או אפסו את הסיסמה.');
        },
        error: fail,
      });
      return;
    }

    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => {
        this.busy.set(false);
        this.password = '';
        this.notifications.success(localized(`ברוכים הבאים, ${this.auth.firstName()}`, `Welcome back, ${this.auth.firstName()}`));
        this.continueAfterSignIn();
      },
      error: fail,
    });
  }

  /** Client-side checks, so a form with an obvious mistake never hits the server. */
  private validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    const email = this.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      errors.email = 'כתובת האימייל לא נראית תקינה.';
    }
    if (this.mode() !== 'forgot') {
      if (this.password.length === 0) {
        errors.password = 'הזינו סיסמה.';
      } else if (this.mode() === 'register' && this.password.length < 8) {
        errors.password = 'הסיסמה צריכה להיות באורך 8 תווים לפחות.';
      }
    }
    this.fieldErrors.set(errors);
    return Object.keys(errors).length === 0;
  }

  /** Back to what the customer was doing, or on to the account itself. */
  private continueAfterSignIn(): void {
    if (this.returnTo) {
      void this.router.navigateByUrl(this.returnTo);
    } else {
      // Drop the query string so a stale `?auth=failed` or `?mode=register`
      // does not outlive the sign-in.
      void this.router.navigate(['/account'], { replaceUrl: true });
    }
  }

  requestDeletion(): void {
    if (!confirm('לשלוח בקשה למחיקת החשבון? תנותקו מכל המכשירים.')) {
      return;
    }
    this.customerApi.requestAccountDeletion().subscribe({
      next: () => {
        this.auth.refresh();
        this.notifications.info(localized('בקשת המחיקה נרשמה. נחזור אליכם במייל.', 'Your deletion request was recorded. We will email you.'));
      },
      error: (cause: unknown) => this.error.set(toAppError(cause).userMessage.he),
    });
  }

  signOut(): void {
    this.auth.logout().subscribe();
    this.notifications.info(localized('התנתקתם. להתראות!', 'Signed out. See you soon!'));
  }
}
