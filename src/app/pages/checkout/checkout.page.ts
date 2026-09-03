import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/analytics';
import { LocalizePipe } from '../../core/i18n';
import {
  CheckoutFieldKey, CheckoutFieldValues, CheckoutRequirement, PaymentProviderId, PaymentStatus,
} from '../../domain';
import { CartFacade, CatalogFacade, CheckoutFacade } from '../../state';
import {
  FulfillmentBadgeComponent, IconComponent, MoneyPipe, RegionBadgeComponent, SquadComponent,
} from '../../ui';

/**
 * Checkout.
 *
 * The form is generated from `CheckoutFacade.requirements()`, which is the union
 * of the base fields and whatever the offers in the cart declare. A gift-card
 * order is never asked for a player handle, and a coin order is never asked to
 * confirm a store region it does not have.
 *
 * SECURITY: no field here can be a credential. The requirement vocabulary has no
 * password, verification-code or recovery-code member, so the form is incapable
 * of rendering one, and no value is ever written to storage.
 */
@Component({
  selector: 'tt-checkout-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LocalizePipe, MoneyPipe, RegionBadgeComponent, FulfillmentBadgeComponent, IconComponent, SquadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <h1>תשלום</h1>
      <ol class="progress" aria-label="שלבי התשלום">
        <li [class.on]="!checkout.orderId()" [class.done]="checkout.orderId()"><span>1</span> פרטים</li>
        <li [class.on]="checkout.orderId()"><span>2</span> תשלום</li>
        <li><span>3</span> אישור</li>
      </ol>

      <div class="layout">
        <div class="main">
          <!-- Step 1: details generated from the cart's requirements -->
          <section class="tt-card tt-card--pad" *ngIf="!checkout.orderId()">
            <h2>פרטים לאספקה</h2>

            <p class="tt-alert" *ngIf="checkout.busy() && checkout.requirements().length === 0">
              טוענים את פרטי ההזמנה…
            </p>

            <form class="fields" (submit)="submit($event)">
              <ng-container *ngFor="let requirement of checkout.requirements()">
                <div class="tt-field" *ngIf="requirement.control !== 'checkbox'">
                  <label class="tt-label" [for]="fieldId(requirement.key)">{{ requirement.label | t }}</label>

                  <textarea *ngIf="requirement.control === 'textarea'"
                            class="tt-textarea"
                            [id]="fieldId(requirement.key)"
                            [attr.name]="requirement.key"
                            [attr.maxlength]="requirement.maxLength"
                            [attr.aria-invalid]="issueFor(requirement.key) ? 'true' : null"
                            [attr.aria-describedby]="describedBy(requirement)"
                            [ngModel]="text(requirement.key)"
                            (ngModelChange)="setValue(requirement.key, $event)"
                            [name]="requirement.key"
                            [placeholder]="(requirement.placeholder | t) || ''"></textarea>

                  <input *ngIf="requirement.control !== 'textarea'"
                         class="tt-input"
                         [id]="fieldId(requirement.key)"
                         [type]="requirement.control"
                         [attr.name]="requirement.key"
                         [attr.autocomplete]="autocompleteFor(requirement.key)"
                         [attr.maxlength]="requirement.maxLength"
                         [attr.aria-invalid]="issueFor(requirement.key) ? 'true' : null"
                         [attr.aria-describedby]="describedBy(requirement)"
                         [ngModel]="text(requirement.key)"
                         (ngModelChange)="setValue(requirement.key, $event)"
                         [name]="requirement.key"
                         [placeholder]="(requirement.placeholder | t) || ''" />

                  <span class="tt-hint" [id]="hintId(requirement.key)" *ngIf="requirement.hint">
                    {{ requirement.hint | t }}
                  </span>
                  <span class="tt-error" [id]="errorId(requirement.key)"
                        *ngIf="issueFor(requirement.key) as issue">{{ issue | t }}</span>
                </div>

                <div class="tt-check-field" *ngIf="requirement.control === 'checkbox'">
                  <label class="tt-check" [for]="fieldId(requirement.key)">
                    <input type="checkbox"
                           [id]="fieldId(requirement.key)"
                           [attr.name]="requirement.key"
                           [attr.aria-invalid]="issueFor(requirement.key) ? 'true' : null"
                           [attr.aria-describedby]="describedBy(requirement)"
                           [ngModel]="flag(requirement.key)"
                           (ngModelChange)="setValue(requirement.key, $event)"
                           [name]="requirement.key" />
                    <span>
                      {{ requirement.label | t }}
                      <span class="tt-hint" [id]="hintId(requirement.key)" *ngIf="requirement.hint">
                        {{ requirement.hint | t }}
                      </span>
                    </span>
                  </label>
                  <span class="tt-error" [id]="errorId(requirement.key)"
                        *ngIf="issueFor(requirement.key) as issue">{{ issue | t }}</span>
                </div>
              </ng-container>

              <!-- What happens next, in the world's language: the squad walks
                   the customer from payment to delivery before they commit. -->
              <ol class="next" aria-label="מה קורה אחרי התשלום">
                <li><span class="next__figure" aria-hidden="true"><tt-squad pose="keeper"></tt-squad></span><span><strong>תשלום מאובטח</strong><span class="tt-faint">פרטי האשראי עוברים לספק הסליקה ולא נשמרים אצלנו.</span></span></li>
                <li><span class="next__figure" aria-hidden="true"><tt-squad pose="walk"></tt-squad></span><span><strong>דף מעקב אישי</strong><span class="tt-faint">נפתח מיד אחרי התשלום, עם מספר הזמנה.</span></span></li>
                <li><span class="next__figure" aria-hidden="true"><tt-squad pose="celebrate"></tt-squad></span><span><strong>אספקה ועדכון</strong><span class="tt-faint">הסטטוס מתעדכן בדף ההזמנה עד שהקוינס אצלכם.</span></span></li>
              </ol>

              <p class="tt-hint">
                אנחנו לעולם לא מבקשים סיסמה, קוד אימות או קודי גיבוי, בשום שלב.
              </p>

              <button type="submit" class="tt-btn tt-btn--buy tt-btn--lg tt-btn--block pay"
                      [class.tt-btn--loading]="checkout.busy()"
                      [attr.aria-busy]="checkout.busy() ? 'true' : null"
                      [disabled]="checkout.busy()">
                <span>המשך לתשלום</span>
                <span class="pay__sum tt-numeric">{{ cart.totals().total | money }}</span>
              </button>
            </form>
          </section>

          <!-- Step 2: provider-agnostic payment -->
          <section class="tt-card tt-card--pad" *ngIf="checkout.orderId()">
            <h2>אמצעי תשלום</h2>

            <div class="tt-alert tt-alert--warning">
              <tt-icon name="flask" [size]="18"></tt-icon>
              <span>
                <strong>סימולציית תשלום</strong>
                <span class="tt-faint">
                  האתר בפיתוח. לא מתבצע חיוב, לא נאספים פרטי כרטיס אשראי, והקוד שיתקבל הוא קוד הדגמה.
                </span>
              </span>
            </div>

            <div class="providers">
              <button type="button"
                      class="provider"
                      *ngFor="let provider of checkout.providers()"
                      [class.on]="providerId() === provider.id"
                      [disabled]="!provider.enabled || checkout.busy()"
                      (click)="selectProvider(provider.id)">
                <strong>{{ provider.name | t }}</strong>
                <span class="tt-faint">{{ provider.description | t }}</span>
              </button>
            </div>

            <!-- Test instruments, shown only for a simulated provider. -->
            <fieldset class="instruments" *ngIf="checkout.instruments().length > 0">
              <legend class="tt-label">תרחיש לבדיקה</legend>
              <label class="instrument"
                     *ngFor="let instrument of checkout.instruments()"
                     [class.on]="instrumentToken() === instrument.token">
                <input type="radio"
                       name="instrument"
                       [id]="'instrument-' + instrument.token"
                       [attr.value]="instrument.token"
                       [checked]="instrumentToken() === instrument.token"
                       (change)="instrumentToken.set(instrument.token)" />
                <span>
                  <strong>{{ instrument.label | t }}</strong>
                  <span class="tt-faint">{{ instrument.description | t }}</span>
                </span>
              </label>
            </fieldset>

            <p class="tt-alert tt-alert--danger" *ngIf="checkout.paymentFailure() as failure">
              {{ failure | t }}
            </p>

            <button type="button" class="tt-btn tt-btn--primary tt-btn--block"
                    [class.tt-btn--loading]="checkout.busy()"
                    [attr.aria-busy]="checkout.busy() ? 'true' : null"
                    [disabled]="checkout.busy() || checkout.paymentPending()"
                    (click)="pay()">
              <ng-container *ngIf="checkout.busy()">מעבד…</ng-container>
              <ng-container *ngIf="!checkout.busy()">
                <span>{{ checkout.canRetryPayment() ? 'ניסיון תשלום נוסף' : (checkout.intent() ? 'אישור התשלום' : 'התחלת תשלום') }}</span>
                <span class="pay__sum tt-numeric">{{ cart.totals().total | money }}</span>
              </ng-container>
            </button>

            <!-- Stated next to the action, where the hesitation actually is. -->
            <p class="assure">
              <tt-icon name="lock" [size]="15"></tt-icon>
              פרטי האשראי עוברים ישירות לספק הסליקה ולא נשמרים אצלנו.
            </p>

            <ng-container *ngIf="checkout.paymentPending()">
              <button type="button" class="tt-btn tt-btn--quiet tt-btn--block"
                      (click)="checkStatus()">
                בדיקת מצב התשלום
              </button>
              <!-- A way out. Without this the timeout branch is a dead end: the
                   pay button is disabled, the status never moves, and the only
                   escape is closing the tab. -->
              <button type="button" class="tt-btn tt-btn--quiet tt-btn--block"
                      [disabled]="checkout.busy()"
                      (click)="cancelPayment()">
                ביטול התשלום
              </button>
            </ng-container>

            <p class="tt-hint">
              מספר ההזמנה נוצר פעם אחת בלבד. גם אם תלחצו שוב או תרעננו את הדף, לא תיווצר הזמנה כפולה.
            </p>
          </section>
        </div>

        <aside class="summary tt-ticket tt-ticket--gold" *ngIf="lookups$ | async as lookups">
          <div class="tt-ticket__main summary__main">
          <p class="tt-ticket__eyebrow"><span>כרטיס · ההזמנה שלך</span><span>{{ cart.items().length }} פריטים</span></p>
          <h2>מה קונים</h2>
          <ul>
            <li *ngFor="let item of cart.items()">
              <span class="line">
                <span class="line__name">{{ item.displayName | t }}</span>
                <span class="line__meta">
                  {{ item.displayVariantName | t }}
                  <span class="tt-faint">× {{ item.quantity }}</span>
                  <tt-region-badge [region]="lookups.regions.get(item.regionId)"></tt-region-badge>
                </span>
              </span>
              <span class="tt-numeric">{{ item.totalPrice | money }}</span>
            </li>
          </ul>
          <div class="row total">
            <span>לתשלום</span>
            <span class="tt-price tt-numeric">{{ cart.totals().total | money }}</span>
          </div>

          <a class="back" routerLink="/cart">
            <tt-icon name="chevron" [size]="14" dir="auto"></tt-icon>חזרה לעגלה
          </a>
          </div>
          <div class="tt-ticket__stub">
            <span class="tt-ticket__tally"></span>
            <span class="eta" *ngIf="cart.items()[0] as first">
              <tt-fulfillment-badge [descriptor]="lookups.fulfillment.get(first.fulfillmentMethod)">
              </tt-fulfillment-badge>
            </span>
          </div>
        </aside>
      </div>
    </div>
  `,
  styles: [`
    h1 { margin-block-end: var(--tt-space-5); }
    .layout { display: grid; gap: var(--tt-space-5); align-items: start; }
    @media (min-width: 900px) {
      .layout { grid-template-columns: 1fr 340px; }
      /* Follows the customer down a long form. */
      .summary { position: sticky; inset-block-start: calc(var(--tt-header-height) + var(--tt-space-4)); }
    }
    /* Below the two-column breakpoint the summary leads. A customer should know
       what they are buying and what it costs before filling anything in. */
    @media (max-width: 899px) {
      .summary { order: -1; }
    }

    /* The amount lives on the action. */
    .pay { justify-content: space-between; padding-inline: var(--tt-space-4); }
    .summary__main { display: flex; flex-direction: column; gap: var(--tt-space-3); padding: var(--tt-space-5); }
    .next { display: grid; gap: var(--tt-space-3); grid-template-columns: repeat(3, minmax(0, 1fr)); margin: var(--tt-space-2) 0 var(--tt-space-4); padding: 0; list-style: none; }
    .next li { display: flex; flex-direction: column; gap: var(--tt-space-2); padding: var(--tt-space-3); border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); background: var(--tt-surface-2); font-size: var(--tt-text-sm); }
    .next li strong { display: block; margin-block-end: 2px; }
    .next li .tt-faint { display: block; line-height: var(--tt-leading-snug); }
    .next__figure { display: block; inline-size: 44px; margin-inline-start: -4px; }
    @media (max-width: 640px) { .next { grid-template-columns: 1fr; } .next li { flex-direction: row; align-items: center; } }
    .progress { display: flex; gap: var(--tt-space-2); margin: calc(var(--tt-space-2) * -1) 0 var(--tt-space-5); padding: 0; list-style: none; font-size: var(--tt-text-xs); font-weight: 700; color: var(--tt-text-faint); }
    .progress li { display: inline-flex; align-items: center; gap: 6px; padding: 0.3rem 0.7rem 0.3rem 0.4rem; border: 1px solid var(--tt-border); border-radius: var(--tt-radius-pill); }
    .progress li span { display: grid; place-items: center; inline-size: 20px; block-size: 20px; border-radius: 50%; background: var(--tt-surface-3); font-family: var(--tt-font-display); font-size: var(--tt-text-sm); color: var(--tt-text); }
    .progress li.on { color: var(--tt-text); border-color: var(--tt-border-brand); background: var(--tt-brand-tint); }
    .progress li.on span { background: var(--tt-brand-500); color: #fff; }
    .progress li.done { color: var(--tt-success); border-color: rgba(67, 209, 138, 0.4); }
    .progress li.done span { background: var(--tt-success); color: #062814; }
    .pay__sum { font-weight: 800; font-variant-numeric: tabular-nums; }

    .assure {
      display: flex;
      align-items: center;
      gap: var(--tt-space-2);
      margin: var(--tt-space-3) 0 0;
      color: var(--tt-text-faint);
      font-size: var(--tt-text-xs);
      line-height: var(--tt-leading-snug);
    }
    .assure tt-icon { flex: none; }

    .eta {
      display: flex;
      align-items: center;
      gap: var(--tt-space-2);
      margin: 0 0 var(--tt-space-3);
      color: var(--tt-text-muted);
      font-size: var(--tt-text-xs);
    }
    .eta tt-icon { flex: none; color: var(--tt-accent-500); }

    .back {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
      font-weight: 600;
    }
    h2 { font-size: var(--tt-text-lg); margin-block-end: var(--tt-space-4); }
    .fields { display: flex; flex-direction: column; gap: var(--tt-space-4); }
    .providers { display: flex; flex-direction: column; gap: var(--tt-space-2); margin-block: var(--tt-space-4); }
    .provider {
      display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
      padding: var(--tt-space-3) var(--tt-space-4); border-radius: var(--tt-radius-md);
      border: 1px solid var(--tt-border-strong); background: var(--tt-surface-2);
      color: var(--tt-text); font: inherit; text-align: start; cursor: pointer;
    }
    .provider.on { border-color: var(--tt-brand-500); background: var(--tt-brand-tint); }
    .instruments { border: 0; margin: 0 0 var(--tt-space-4); padding: 0; display: flex; flex-direction: column; gap: var(--tt-space-2); }
    .instruments legend { padding: 0; margin-block-end: var(--tt-space-2); }
    .instrument {
      display: flex; gap: var(--tt-space-3); align-items: flex-start;
      padding: var(--tt-space-3); border-radius: var(--tt-radius-md);
      border: 1px solid var(--tt-border); background: var(--tt-surface-2); cursor: pointer;
    }
    .instrument.on { border-color: var(--tt-brand-500); }
    .instrument input { margin-block-start: 0.2rem; accent-color: var(--tt-brand-500); }
    .instrument span span { display: block; }
    .tt-alert span span { display: block; }
    .provider:disabled { opacity: 0.5; cursor: not-allowed; }
    .summary ul { list-style: none; margin: 0 0 var(--tt-space-3); padding: 0; display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .summary li { display: flex; justify-content: space-between; gap: var(--tt-space-3); font-size: var(--tt-text-sm); }
    .line { display: flex; flex-direction: column; gap: 3px; min-inline-size: 0; }
    .line__name { font-weight: 600; }
    .line__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; font-size: var(--tt-text-xs); color: var(--tt-text-muted); }
    .row.total { display: flex; justify-content: space-between; font-weight: 700; padding-block-start: var(--tt-space-2); border-block-start: 1px solid var(--tt-border); margin-block-end: var(--tt-space-3); }
    .tt-check .tt-hint { display: block; }
    .tt-check-field { display: flex; flex-direction: column; gap: var(--tt-space-2); }
  `],
})
export class CheckoutPage {
  readonly checkout = inject(CheckoutFacade);
  readonly cart = inject(CartFacade);
  private readonly catalog = inject(CatalogFacade);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);

  readonly lookups$ = this.catalog.lookups$;
  readonly providerId = signal<PaymentProviderId>(PaymentProviderId.Mock);
  readonly instrumentToken = signal<string>('sim_success');

  /** Answers live in component memory for the length of the flow and nowhere else. */
  private readonly values = signal<CheckoutFieldValues>({});

  constructor() {
    this.analytics.pageView('/checkout', 'Checkout');
    // No reset here. start() resumes an unfinished session for this tab and
    // opens a new one otherwise; resetting first threw the session away, so a
    // refresh after submitting details created a second one, and against a real
    // backend that means a second order.
    this.checkout.start().subscribe();
  }

  text(key: CheckoutFieldKey): string {
    const value = this.values()[key];
    return typeof value === 'string' ? value : '';
  }

  flag(key: CheckoutFieldKey): boolean {
    return this.values()[key] === true;
  }

  setValue(key: CheckoutFieldKey, value: string | boolean): void {
    this.values.set({ ...this.values(), [key]: value });
  }

  issueFor(key: CheckoutFieldKey): { he: string; en?: string } | undefined {
    return this.checkout.issues().find((issue) => issue.field === key)?.message;
  }

  fieldId(key: CheckoutFieldKey): string {
    return `checkout-${key.toLowerCase()}`;
  }

  hintId(key: CheckoutFieldKey): string {
    return `${this.fieldId(key)}-hint`;
  }

  errorId(key: CheckoutFieldKey): string {
    return `${this.fieldId(key)}-error`;
  }

  /** Ties hint and error text to the control for screen readers. */
  describedBy(requirement: CheckoutRequirement): string | null {
    const ids: string[] = [];
    if (requirement.hint) {
      ids.push(this.hintId(requirement.key));
    }
    if (this.issueFor(requirement.key)) {
      ids.push(this.errorId(requirement.key));
    }
    return ids.length > 0 ? ids.join(' ') : null;
  }

  /**
   * Autofill hints, which matter because most traffic is mobile.
   *
   * Only non-sensitive tokens appear here: there is no credential field to
   * autofill, and payment autofill belongs to the provider's hosted form.
   */
  autocompleteFor(key: CheckoutFieldKey): string {
    switch (key) {
      case CheckoutFieldKey.FullName:
        return 'name';
      case CheckoutFieldKey.Email:
        return 'email';
      case CheckoutFieldKey.Phone:
        return 'tel';
      default:
        return 'off';
    }
  }

  submit(event: Event): void {
    event.preventDefault();
    this.checkout.submitDetails(this.values()).subscribe((orderId) => {
      // Opening the gateway session as soon as the order exists is what a real
      // integration does, and it is what lets the customer see and choose a
      // payment method before committing rather than after.
      if (orderId) {
        this.checkout.startPayment(this.providerId()).subscribe();
      }
    });
  }

  selectProvider(provider: PaymentProviderId): void {
    this.providerId.set(provider);
  }

  /**
   * One button drives the whole intent lifecycle: open an intent if there is
   * none (including after a decline, which spends the previous one), otherwise
   * confirm the open one. The facade guards against double submission.
   */
  pay(): void {
    // After a decline the previous intent is spent, so a retry opens a fresh one
    // against the same order before confirming.
    if (!this.checkout.intent()) {
      this.checkout.startPayment(this.providerId()).subscribe((intent) => {
        if (intent) {
          this.confirm();
        }
      });
      return;
    }
    this.confirm();
  }

  checkStatus(): void {
    this.checkout.refreshPaymentStatus().subscribe();
  }

  cancelPayment(): void {
    this.checkout.cancelPayment().subscribe();
  }

  private confirm(): void {
    this.checkout.confirmPayment({ token: this.instrumentToken() }).subscribe((result) => {
      if (result?.status === PaymentStatus.Succeeded) {
        void this.router.navigate(['/order', result.orderId, 'success']);
      }
    });
  }
}
