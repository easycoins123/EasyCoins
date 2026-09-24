import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, OnDestroy, Output, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';

import { LocalizePipe } from '../../../core/i18n';
import { formatQuantity } from '../../../core/value';
import { CustomCoinsQuote, CustomCoinsRules, Platform, toAppError } from '../../../domain';
import { GrowthFacade } from '../../../state/growth.facade';
import { MoneyPipe } from '../../money.pipe';
import { IconComponent } from '../icon.component';

type Mode = 'amount' | 'budget';

/**
 * Custom coins: "how many do I want?" and "I have a budget of…".
 *
 * Both questions go to the server, which answers with a priced offer. The
 * screen shows base, bonus, total received and price exactly as returned,
 * and adds that offer to the cart like any other. Nothing here multiplies a
 * rate: an amount typed in this box has no price until the server gives one.
 */
@Component({
  selector: 'tt-custom-coins',
  standalone: true,
  imports: [CommonModule, LocalizePipe, MoneyPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="custom tt-plate" id="custom" *ngIf="rules?.enabled">
      <header class="custom__head">
        <span class="tt-eyebrow">כמות מותאמת</span>
        <h2>לא בסולם? נתפור כמות.</h2>
        <p class="tt-muted">מ־{{ label(rules!.minCoins) }} עד {{ label(rules!.maxCoins) }}, בקפיצות של {{ label(rules!.stepCoins) }}. המחיר לפי הסולם: בין שתי חבילות משלמים את המחיר לקוין של החבילה שמתחת, אף פעם לא יותר יקר מהחבילה הבאה.</p>
      </header>

      <div class="custom__grid">
        <div class="ask">
          <div class="tabs" role="tablist" aria-label="איך לבחור כמות">
            <button type="button" role="tab" class="tab" [class.tab--on]="mode() === 'amount'" [attr.aria-selected]="mode() === 'amount'" (click)="setMode('amount')">כמה קוינס אני רוצה?</button>
            <button type="button" role="tab" class="tab" [class.tab--on]="mode() === 'budget'" [attr.aria-selected]="mode() === 'budget'" (click)="setMode('budget')">יש לי תקציב של…</button>
          </div>

          <label class="tt-field" *ngIf="mode() === 'amount'">
            <span class="tt-label" for="custom-amount">כמות קוינס</span>
            <input id="custom-amount" class="tt-input tt-numeric" type="text" inputmode="numeric" autocomplete="off" placeholder="לדוגמה 1.37M או 1370000"
                   [value]="amountText()" (input)="onAmount($event)" />
            <span class="tt-hint">אפשר לכתוב 1370000, 1370K או 1.37M</span>
          </label>

          <label class="tt-field" *ngIf="mode() === 'budget'">
            <span class="tt-label" for="custom-budget">תקציב בשקלים</span>
            <span class="money-input">
              <span class="money-input__sign" aria-hidden="true">₪</span>
              <input id="custom-budget" class="tt-input tt-numeric" type="text" inputmode="numeric" autocomplete="off" placeholder="לדוגמה 67"
                     [value]="budgetText()" (input)="onBudget($event)" />
            </span>
            <span class="tt-hint">נחזיר את הכמות הגדולה ביותר שנכנסת בתקציב.</span>
          </label>

          <div class="platforms" role="group" aria-label="פלטפורמה" *ngIf="platforms.length > 1">
            <button type="button" class="chip" *ngFor="let platform of platforms" [class.chip--on]="platformId() === platform.id" (click)="setPlatform(platform.id)">{{ platform.shortName | t }}</button>
          </div>

          <p class="tt-error" role="alert" *ngIf="error()">{{ error() }}</p>
        </div>

        <aside class="quote tt-ticket tt-ticket--gold" [class.quote--pending]="pending()" aria-live="polite">
          <div class="tt-ticket__main quote__main">
            <p class="tt-ticket__eyebrow"><span>כרטיס · כמות מותאמת</span><span *ngIf="quote() as q">{{ q.platformId === platformId() ? platformLabel() : '' }}</span></p>
            <ng-container *ngIf="quote() as q; else empty">
              <div class="quote__rows">
                <div class="row"><span>בסיס</span><span class="tt-numeric">{{ label(q.amount) }}</span></div>
                <div class="row row--bonus" *ngIf="q.bonus > 0"><span>בונוס השקה</span><span class="tt-numeric">+{{ label(q.bonus) }}</span></div>
                <div class="row row--total"><span>סה״כ מקבלים</span><span class="tt-numeric total">{{ label(q.totalCoins) }} קוינס</span></div>
              </div>
              <div class="quote__price">
                <span class="quote__label">לתשלום</span>
                <span class="tt-price tt-price--xl">{{ q.price | money }}</span>
              </div>
              <p class="quote__rate tt-numeric">{{ q.perMillion | money }} למיליון קוינס שמתקבלים · לפי חבילת {{ label(q.rungAmount) }}</p>
              <button type="button" class="tt-btn tt-btn--buy tt-btn--lg tt-btn--block" [disabled]="busy || pending()" [class.tt-btn--loading]="busy" (click)="add.emit(q)">
                <tt-icon name="cart" [size]="18"></tt-icon> הוספה לסל
              </button>
              <p class="quote__assure tt-faint">המחיר נכתב בשרת. מה שמופיע כאן הוא מה שמשלמים.</p>
            </ng-container>
            <ng-template #empty>
              <p class="quote__empty tt-muted">{{ pending() ? 'מתמחרים…' : 'הזינו כמות או תקציב, המחיר יופיע כאן.' }}</p>
            </ng-template>
          </div>
          <div class="tt-ticket__stub">
            <span class="tt-ticket__tally"></span>
            <span class="quote__stub tt-numeric">{{ quote() ? label(quote()!.totalCoins) + ' · Ultimate Team' : 'כמות מותאמת' }}</span>
          </div>
        </aside>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .custom { padding: var(--tt-space-5); border-radius: var(--tt-radius-lg); scroll-margin-block-start: calc(var(--tt-header-height) + var(--tt-space-4)); }
    .custom__head { display: flex; flex-direction: column; gap: var(--tt-space-1); margin-block-end: var(--tt-space-4); }
    .custom__head h2 { margin: 0; }
    .custom__head p { margin: 0; max-inline-size: 64ch; font-size: var(--tt-text-sm); }
    .custom__grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr); gap: var(--tt-space-5); align-items: start; }
    .ask { display: flex; flex-direction: column; gap: var(--tt-space-4); }
    .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 4px; border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); background: var(--tt-surface-2); }
    .tab { min-block-size: 44px; border: 0; border-radius: var(--tt-radius-sm); background: transparent; color: var(--tt-text-muted); font: inherit; font-weight: 700; font-size: var(--tt-text-sm); cursor: pointer; }
    .tab--on { background: var(--tt-gold-metal); color: var(--tt-text-on-gold); }
    .money-input { position: relative; display: block; }
    .money-input__sign { position: absolute; inset-inline-start: var(--tt-space-3); inset-block-start: 50%; transform: translateY(-50%); color: var(--tt-gold-400); font-weight: 800; }
    .money-input .tt-input { padding-inline-start: 2rem; }
    .tt-input { direction: ltr; text-align: start; }
    .platforms { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { min-block-size: 40px; padding: 6px 14px; border-radius: var(--tt-radius-pill); border: 1px solid var(--tt-border-strong); background: var(--tt-surface-2); color: var(--tt-text); font: inherit; font-weight: 700; font-size: var(--tt-text-sm); cursor: pointer; }
    .chip--on { border-color: var(--tt-gold-500); background: var(--tt-gold-tint); color: var(--tt-gold-400); }
    .quote__main { display: flex; flex-direction: column; gap: var(--tt-space-3); padding: var(--tt-space-4); transition: opacity var(--tt-duration) var(--tt-ease); }
    .quote--pending .quote__main { opacity: 0.6; }
    .quote__rows { display: flex; flex-direction: column; gap: 6px; }
    .row { display: flex; justify-content: space-between; gap: var(--tt-space-3); font-size: var(--tt-text-sm); color: var(--tt-text-muted); }
    .row--bonus span:last-child { color: var(--tt-gold-400); font-weight: 800; }
    .row--total { padding-block-start: var(--tt-space-2); border-block-start: 1px solid var(--tt-border); color: var(--tt-text); font-weight: 700; }
    .total { font-size: var(--tt-text-lg); font-weight: 900; }
    .quote__price { display: flex; justify-content: space-between; align-items: baseline; }
    .quote__label { font-weight: 700; }
    .quote__rate { margin: calc(var(--tt-space-2) * -1) 0 0; font-size: var(--tt-caption); color: var(--tt-text-faint); text-align: end; }
    .quote__assure { margin: 0; font-size: var(--tt-caption); }
    .quote__empty { margin: 0; padding-block: var(--tt-space-5); text-align: center; font-size: var(--tt-text-sm); }
    .quote__stub { font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text-muted); }
    @media (max-width: 860px) { .custom__grid { grid-template-columns: 1fr; } .custom { padding: var(--tt-space-4); } }
  `],
})
export class CustomCoinsComponent implements OnDestroy {
  private readonly growth = inject(GrowthFacade);

  @Input() rules: CustomCoinsRules | null | undefined;
  @Input() set platformOptions(list: readonly Platform[] | null | undefined) {
    this.platforms = list ?? [];
    if (!this.platformId() && this.platforms[0]) {
      this.platformId.set(this.platforms[0].id);
    }
  }
  @Input() busy = false;
  /** An amount set from outside, e.g. by the player goal calculator. */
  @Input() set presetAmount(value: number | null | undefined) {
    if (value && value > 0) {
      this.setMode('amount');
      this.amountText.set(value.toLocaleString('en-US'));
      this.requests.next();
    }
  }
  @Output() readonly add = new EventEmitter<CustomCoinsQuote>();

  platforms: readonly Platform[] = [];
  readonly mode = signal<Mode>('amount');
  readonly amountText = signal('');
  readonly budgetText = signal('');
  readonly platformId = signal<string>('');
  readonly quote = signal<CustomCoinsQuote | null>(null);
  readonly pending = signal(false);
  readonly error = signal<string | null>(null);

  private readonly requests = new Subject<void>();
  private readonly subscription: Subscription;

  constructor() {
    this.subscription = this.requests.pipe(
      debounceTime(350),
      switchMap(() => {
        const request = this.buildRequest();
        if (!request) {
          this.pending.set(false);
          this.quote.set(null);
          return [];
        }
        this.pending.set(true);
        return this.growth.quote(request).pipe();
      }),
    ).subscribe({
      next: (quote) => {
        this.pending.set(false);
        this.error.set(null);
        this.quote.set(quote);
      },
    });
    // Errors end a switchMap stream, so they are handled per request instead.
    this.subscription.add(this.requests.subscribe(() => this.error.set(null)));
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  label(value: number): string {
    return formatQuantity(value);
  }

  platformLabel(): string {
    return this.platforms.find((platform) => platform.id === this.platformId())?.shortName.he ?? '';
  }

  setMode(mode: Mode): void {
    if (this.mode() !== mode) {
      this.mode.set(mode);
      this.quote.set(null);
      this.error.set(null);
      this.requests.next();
    }
  }

  setPlatform(id: string): void {
    this.platformId.set(id);
    this.requests.next();
  }

  onAmount(event: Event): void {
    this.amountText.set((event.target as HTMLInputElement).value);
    this.ask();
  }

  onBudget(event: Event): void {
    this.budgetText.set((event.target as HTMLInputElement).value);
    this.ask();
  }

  /** Asks the server, handling the error of this request alone. */
  private ask(): void {
    const request = this.buildRequest();
    if (!request) {
      this.quote.set(null);
      this.error.set(null);
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    const started = ++this.sequence;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.growth.quote(request).subscribe({
        next: (quote) => {
          if (started !== this.sequence) {
            return;
          }
          this.pending.set(false);
          this.quote.set(quote);
        },
        error: (cause: unknown) => {
          if (started !== this.sequence) {
            return;
          }
          this.pending.set(false);
          this.quote.set(null);
          const appError = toAppError(cause);
          this.error.set(appError.fieldErrors[0]?.message.he ?? appError.userMessage.he);
        },
      });
    }, 350);
  }

  private sequence = 0;
  private timer?: ReturnType<typeof setTimeout>;

  private buildRequest() {
    const platformId = this.platformId();
    if (!platformId) {
      return null;
    }
    if (this.mode() === 'amount') {
      const amount = parseCoins(this.amountText());
      return amount ? { mode: 'amount' as const, amount, platformId } : null;
    }
    const shekels = Number(this.budgetText().replace(/[^\d.]/g, ''));
    return Number.isFinite(shekels) && shekels > 0
      ? { mode: 'budget' as const, budget: { amountMinor: Math.round(shekels * 100), currency: 'ILS' as const }, platformId }
      : null;
  }
}

/** 1370000, 1,370,000, 1370K, 1.37M → coins; anything else → undefined. */
export function parseCoins(raw: string): number | undefined {
  const cleaned = raw.trim().toLowerCase().replace(/[,\s]/g, '');
  const match = /^(\d+(?:\.\d+)?)([km])?$/.exec(cleaned);
  if (!match) {
    return undefined;
  }
  const scale = match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1_000 : 1;
  const value = Math.round(Number(match[1]) * scale);
  return value > 0 ? value : undefined;
}
