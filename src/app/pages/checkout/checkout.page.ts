import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { launchBonusOf } from '../../core/commerce';
import { formatQuantity, itemsLabel } from '../../core/value';
import { LocalizePipe } from '../../core/i18n';
import {
  CheckoutFieldKey, CheckoutFieldValues, CheckoutRequirement, CheckoutValidationIssue, LocalizedText,
  PaymentProviderId, PaymentStatus, ProductVariant,
} from '../../domain';
import { CartFacade, CatalogFacade, CheckoutFacade, StorefrontFacade } from '../../state';
import {
  FulfillmentBadgeComponent, IconComponent, MoneyPipe, RegionBadgeComponent,
} from '../../ui';
import { BenefitsNoteComponent } from '../../ui/components/growth/benefits-note.component';
import { FIELD_HELP, validateLocally } from './checkout-validation';

/**
 * Checkout.
 *
 * The form is generated from `CheckoutFacade.requirements()`, which is the union
 * of the base fields and whatever the offers in the cart declare. A gift-card
 * order is never asked for a player handle, and a coin order is never asked to
 * confirm a store region it does not have.
 *
 * The screen is built for the person about to pay, who may not play the game:
 * the order is restated in words next to the form, every field says whether it
 * is needed and why, mistakes are named next to the field before anything is
 * sent, and the one thing to press is the button with the price on it.
 *
 * SECURITY: no field here can be a credential. The requirement vocabulary has no
 * password, verification-code or recovery-code member, so the form is incapable
 * of rendering one, and no value is ever written to storage.
 */
@Component({
  selector: 'tt-checkout-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LocalizePipe, MoneyPipe, RegionBadgeComponent, FulfillmentBadgeComponent, IconComponent, BenefitsNoteComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <h1>תשלום</h1>
      <ol class="progress" aria-label="שלבי התשלום">
        <li [class.on]="!checkout.orderId()" [class.done]="checkout.orderId()" [attr.aria-current]="!checkout.orderId() ? 'step' : null"><span aria-hidden="true">1</span> פרטים</li>
        <li [class.on]="checkout.orderId()" [attr.aria-current]="checkout.orderId() ? 'step' : null"><span aria-hidden="true">2</span> תשלום</li>
        <li><span aria-hidden="true">3</span> אישור</li>
      </ol>

      <div class="layout">
        <div class="main">
          <!-- The session could not be opened: say so, and offer the two ways out. -->
          <section class="tt-card tt-card--pad failed" *ngIf="failed()" role="alert">
            <h2>לא הצלחנו להתחיל את התשלום</h2>
            <p class="tt-muted">לא נוצרה הזמנה ולא בוצע חיוב. אפשר לנסות שוב, ואם זה חוזר, לכתוב לנו.</p>
            <div class="tt-row">
              <button type="button" class="tt-btn tt-btn--buy" (click)="restart()">נסו שוב</button>
              <a class="tt-btn tt-btn--ghost" routerLink="/cart">חזרה לעגלה</a>
              <a class="tt-btn tt-btn--quiet" routerLink="/support">לתמיכה</a>
            </div>
          </section>

          <!-- Step 1: details generated from the cart's requirements -->
          <section class="tt-card tt-card--pad" *ngIf="!checkout.orderId() && !failed()">
            <h2>פרטים לאספקה</h2>
            <p class="tt-muted intro">רק מה שצריך כדי לספק את ההזמנה ולשלוח אישור. בלי סיסמאות, אף פעם.</p>

            <!-- The session is opened by the server, which can take a few seconds
                 on a cold start. The form's shape is shown at once, and after a
                 moment the wait is explained rather than left silent. -->
            <div class="waiting" *ngIf="checkout.busy() && checkout.requirements().length === 0" role="status" aria-live="polite">
              <div class="waiting__plate">
                <span class="waiting__glyph" aria-hidden="true">
                  <span class="waiting__ring"></span>
                  <tt-icon name="shield" [size]="22"></tt-icon>
                </span>
                <span class="waiting__text">
                  <strong>מכינים את הטופס…</strong>
                  <span>עוד רגע. ההזמנה נוצרת רק אחרי שתאשרו את הפרטים, ולא בוצע חיוב.</span>
                </span>
              </div>
              <p class="tt-alert waiting__slow" *ngIf="slow()">
                השרת מתעורר, זה יכול לקחת עוד כמה שניות. עדיין לא נוצרה הזמנה ולא בוצע חיוב.
              </p>
              <div class="waiting__form" aria-hidden="true">
                <span class="tt-skeleton waiting__label"></span><span class="tt-skeleton waiting__input"></span>
                <span class="tt-skeleton waiting__label"></span><span class="tt-skeleton waiting__input"></span>
                <span class="tt-skeleton waiting__label"></span><span class="tt-skeleton waiting__input"></span>
              </div>
            </div>

            <form class="fields" (submit)="submit($event)" novalidate *ngIf="checkout.requirements().length > 0">
              <p class="tt-alert tt-alert--danger summary-errors" role="alert" *ngIf="submitted() && allIssues().length > 0">
                <tt-icon name="alert" [size]="16"></tt-icon>
                <span>{{ allIssues().length === 1 ? 'יש שדה אחד שצריך לתקן.' : 'יש ' + allIssues().length + ' שדות שצריך לתקן.' }} הסימון מופיע ליד כל שדה.</span>
              </p>

              <ng-container *ngFor="let requirement of checkout.requirements()">
                <div class="tt-field" *ngIf="requirement.control !== 'checkbox'">
                  <label class="tt-label label" [for]="fieldId(requirement.key)">
                    <span>{{ requirement.label | t }}</span>
                    <span class="label__optional" *ngIf="!requirement.required && !saysOptional(requirement)">(לא חובה)</span>
                  </label>

                  <textarea *ngIf="requirement.control === 'textarea'"
                            class="tt-textarea"
                            [id]="fieldId(requirement.key)"
                            [attr.name]="requirement.key"
                            [attr.maxlength]="requirement.maxLength"
                            [attr.aria-invalid]="issueFor(requirement.key) ? 'true' : null"
                            [attr.aria-describedby]="describedBy(requirement)"
                            [attr.aria-required]="requirement.required ? 'true' : null"
                            [ngModel]="text(requirement.key)"
                            (ngModelChange)="setValue(requirement.key, $event)"
                            [name]="requirement.key"
                            rows="3"
                            [placeholder]="(requirement.placeholder | t) || ''"></textarea>

                  <input *ngIf="requirement.control !== 'textarea'"
                         class="tt-input"
                         [id]="fieldId(requirement.key)"
                         [type]="requirement.control"
                         [attr.name]="requirement.key"
                         [attr.autocomplete]="autocompleteFor(requirement.key)"
                         [attr.inputmode]="inputModeFor(requirement.key)"
                         [attr.enterkeyhint]="'next'"
                         [attr.maxlength]="requirement.maxLength"
                         [attr.aria-invalid]="issueFor(requirement.key) ? 'true' : null"
                         [attr.aria-describedby]="describedBy(requirement)"
                         [attr.aria-required]="requirement.required ? 'true' : null"
                         [ngModel]="text(requirement.key)"
                         (ngModelChange)="setValue(requirement.key, $event)"
                         (blur)="touch(requirement)"
                         [name]="requirement.key"
                         [placeholder]="(requirement.placeholder | t) || ''" />

                  <span class="tt-hint" [id]="hintId(requirement.key)" *ngIf="requirement.hint">
                    {{ requirement.hint | t }}
                  </span>
                  <span class="tt-error error" [id]="errorId(requirement.key)" *ngIf="issueFor(requirement.key) as issue">
                    <tt-icon name="alert" [size]="13"></tt-icon> {{ issue | t }}
                  </span>

                  <!-- Plain-language help, opened only by the customer who needs it. -->
                  <ng-container *ngIf="helpFor(requirement.key) as help">
                    <button type="button" class="help" (click)="toggleHelp(requirement.key)"
                            [attr.aria-expanded]="helpOpen().has(requirement.key)" [attr.aria-controls]="helpId(requirement.key)">
                      <tt-icon name="info" [size]="13"></tt-icon> {{ help.question }}
                    </button>
                    <p class="help__text" [id]="helpId(requirement.key)" *ngIf="helpOpen().has(requirement.key)">{{ help.answer }}</p>
                  </ng-container>
                </div>

                <div class="tt-check-field" *ngIf="requirement.control === 'checkbox'" [class.tt-check-field--invalid]="issueFor(requirement.key)">
                  <label class="tt-check check" [for]="fieldId(requirement.key)">
                    <input type="checkbox"
                           [id]="fieldId(requirement.key)"
                           [attr.name]="requirement.key"
                           [attr.aria-invalid]="issueFor(requirement.key) ? 'true' : null"
                           [attr.aria-describedby]="describedBy(requirement)"
                           [attr.aria-required]="requirement.required ? 'true' : null"
                           [ngModel]="flag(requirement.key)"
                           (ngModelChange)="setValue(requirement.key, $event)"
                           [name]="requirement.key" />
                    <span>
                      <span class="check__label">{{ requirement.label | t }}<ng-container *ngIf="requirement.key === termsKey"> (<a routerLink="/terms" target="_blank" rel="noopener">תנאי השימוש</a> · <a routerLink="/refund-policy" target="_blank" rel="noopener">מדיניות ההחזרים</a>)</ng-container></span>
                      <span class="tt-hint" [id]="hintId(requirement.key)" *ngIf="requirement.hint">
                        {{ requirement.hint | t }}
                      </span>
                    </span>
                  </label>
                  <span class="tt-error error" [id]="errorId(requirement.key)" *ngIf="issueFor(requirement.key) as issue">
                    <tt-icon name="alert" [size]="13"></tt-icon> {{ issue | t }}
                  </span>
                  <ng-container *ngIf="helpFor(requirement.key) as help">
                    <button type="button" class="help" (click)="toggleHelp(requirement.key)"
                            [attr.aria-expanded]="helpOpen().has(requirement.key)" [attr.aria-controls]="helpId(requirement.key)">
                      <tt-icon name="info" [size]="13"></tt-icon> {{ help.question }}
                    </button>
                    <p class="help__text" [id]="helpId(requirement.key)" *ngIf="helpOpen().has(requirement.key)">{{ help.answer }}</p>
                  </ng-container>
                </div>
              </ng-container>

              <button type="submit" class="tt-btn tt-btn--buy tt-btn--lg tt-btn--block pay"
                      [class.tt-btn--loading]="checkout.busy()"
                      [attr.aria-busy]="checkout.busy() ? 'true' : null"
                      [disabled]="checkout.busy()">
                <span>המשך לתשלום</span>
                <span class="pay__sum tt-numeric">{{ cart.totals().total | money }}</span>
              </button>
              <p class="tt-hint pay__note">בלחיצה נוצרת ההזמנה ועוברים לשלב התשלום. החיוב מתבצע רק שם.</p>

              <!-- What happens next, after the action, for whoever wants to know. -->
              <ol class="next" aria-label="מה קורה אחרי התשלום">
                <li><span class="next__glyph" aria-hidden="true"><tt-icon name="shield" [size]="18"></tt-icon></span><span><strong>תשלום מאובטח</strong><span class="tt-faint">פרטי האשראי עוברים לספק הסליקה ולא נשמרים אצלנו.</span></span></li>
                <li><span class="next__glyph" aria-hidden="true"><tt-icon name="truck" [size]="18"></tt-icon></span><span><strong>דף מעקב אישי</strong><span class="tt-faint">נפתח מיד אחרי התשלום, עם מספר הזמנה, ונשלח גם למייל.</span></span></li>
                <li><span class="next__glyph" aria-hidden="true"><tt-icon name="coins" [size]="18"></tt-icon></span><span><strong>אספקה ועדכון</strong><span class="tt-faint">הסטטוס מתעדכן בדף ההזמנה עד שהקוינס אצלכם.</span></span></li>
              </ol>
            </form>
          </section>

          <!-- Step 2: provider-agnostic payment -->
          <section class="tt-card tt-card--pad" *ngIf="checkout.orderId()">
            <h2>אמצעי תשלום</h2>
            <p class="tt-muted intro">ההזמנה נוצרה. נשאר רק לשלם.</p>

            <div class="tt-alert tt-alert--warning">
              <tt-icon name="flask" [size]="18"></tt-icon>
              <span>
                <strong>סימולציית תשלום</strong>
                <span class="tt-faint">
                  האתר בפיתוח. לא מתבצע חיוב, לא נאספים פרטי כרטיס אשראי, והקוד שיתקבל הוא קוד הדגמה.
                </span>
              </span>
            </div>

            <div class="providers" role="radiogroup" aria-label="בחירת אמצעי תשלום">
              <button type="button"
                      class="provider"
                      role="radio"
                      *ngFor="let provider of checkout.providers()"
                      [class.on]="providerId() === provider.id"
                      [attr.aria-checked]="providerId() === provider.id"
                      [disabled]="!provider.enabled || checkout.busy()"
                      (click)="selectProvider(provider.id)">
                <span class="provider__text">
                  <strong>{{ provider.name | t }}</strong>
                  <span class="tt-faint">{{ provider.description | t }}</span>
                </span>
                <span class="provider__check" aria-hidden="true"><tt-icon name="check" [size]="12"></tt-icon></span>
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

            <p class="tt-alert tt-alert--danger" role="alert" *ngIf="checkout.paymentFailure() as failure">
              <tt-icon name="alert" [size]="16"></tt-icon>
              <span>{{ failure | t }}</span>
            </p>

            <button type="button" class="tt-btn tt-btn--buy tt-btn--lg tt-btn--block pay"
                    [class.tt-btn--loading]="checkout.busy()"
                    [attr.aria-busy]="checkout.busy() ? 'true' : null"
                    [disabled]="checkout.busy() || checkout.paymentPending()"
                    (click)="pay()">
              <ng-container *ngIf="checkout.busy()">מעבד…</ng-container>
              <ng-container *ngIf="!checkout.busy()">
                <span>{{ checkout.canRetryPayment() ? 'ניסיון תשלום נוסף' : (checkout.intent() ? 'אישור התשלום' : 'תשלום') }}</span>
                <span class="pay__sum tt-numeric">{{ cart.totals().total | money }}</span>
              </ng-container>
            </button>

            <!-- Stated next to the action, where the hesitation actually is. -->
            <p class="assure">
              <tt-icon name="lock" [size]="15"></tt-icon>
              פרטי האשראי עוברים ישירות לספק הסליקה ולא נשמרים אצלנו.
            </p>

            <ng-container *ngIf="checkout.paymentPending()">
              <p class="tt-alert" role="status">התשלום עדיין בעיבוד אצל ספק הסליקה. אפשר לבדוק שוב, או לבטל ולנסות מחדש.</p>
              <button type="button" class="tt-btn tt-btn--ghost tt-btn--block"
                      (click)="checkStatus()">
                בדיקת מצב התשלום
              </button>
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
          <p class="tt-ticket__eyebrow"><span>ההזמנה שלך</span><span>{{ countLabel() }}</span></p>
          <h2>מה קונים</h2>
          <ul>
            <li *ngFor="let item of cart.items()">
              <span class="line">
                <span class="line__name">{{ item.displayVariantName | t }}<span class="tt-faint" *ngIf="item.quantity > 1"> × {{ item.quantity }}</span></span>
                <span class="line__meta">
                  <span class="line__platform"><tt-icon name="gamepad" [size]="12"></tt-icon> {{ lookups.platforms.get(item.platformId)?.name | t }}</span>
                  <tt-region-badge *ngIf="lookups.regions.get(item.regionId)?.isRegionFree === false" [region]="lookups.regions.get(item.regionId)"></tt-region-badge>
                </span>
              </span>
              <span class="tt-numeric">{{ item.totalPrice | money }}</span>
            </li>
          </ul>
          <div class="row row--coins" *ngIf="totalCoins() as coins">
            <span>סה״כ קוינס שתקבלו</span><span class="tt-numeric coins">{{ coins }}</span>
          </div>
          <div class="row" *ngIf="cart.totals().discount.amountMinor > 0">
            <span>הנחה / הטבה</span><span class="tt-numeric">−{{ cart.totals().discount | money }}</span>
          </div>
          <div class="row total">
            <span>לתשלום</span>
            <span class="tt-price tt-numeric">{{ cart.totals().total | money }}</span>
          </div>
          <!-- Which benefit is on this order and which is not, in the server's words. -->
          <tt-benefits-note class="benefits" [benefits]="cart.benefits()"></tt-benefits-note>

          <a class="back" routerLink="/cart" *ngIf="!checkout.orderId()">
            <tt-icon name="edit" [size]="14"></tt-icon>שינוי ההזמנה
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
      .summary { position: sticky; inset-block-start: calc(var(--tt-header-height) + var(--tt-space-4)); }
    }
    /* Below the two-column breakpoint the summary leads. A customer should know
       what they are buying and what it costs before filling anything in. */
    @media (max-width: 899px) {
      .summary { order: -1; }
    }

    .intro { margin: calc(var(--tt-space-3) * -1) 0 var(--tt-space-4); font-size: var(--tt-text-sm); }
    .failed { display: grid; gap: var(--tt-space-2); }
    .failed h2 { margin: 0; }

    .pay { justify-content: space-between; padding-inline: var(--tt-space-4); }
    .pay__sum { font-weight: 800; font-variant-numeric: tabular-nums; }
    .pay__note { margin: calc(var(--tt-space-2) * -1) 0 0; text-align: center; }
    .summary__main { display: grid; gap: var(--tt-space-3); padding: var(--tt-space-5); }
    .next { display: grid; gap: var(--tt-space-2); margin: var(--tt-space-3) 0 0; padding: var(--tt-space-3) 0 0; border-block-start: 1px solid var(--tt-border); list-style: none; }
    .next li { display: flex; align-items: center; gap: var(--tt-space-3); font-size: var(--tt-text-sm); }
    .next li strong { display: block; }
    .next li .tt-faint { display: block; line-height: var(--tt-leading-snug); font-size: var(--tt-text-xs); }
    .next__glyph { display: grid; place-items: center; inline-size: 34px; block-size: 34px; flex: none; border-radius: var(--tt-radius-md); background: var(--tt-surface-3); border: 1px solid var(--tt-gold-600); color: var(--tt-gold-400); }

    .progress { display: flex; gap: var(--tt-space-2); margin: calc(var(--tt-space-2) * -1) 0 var(--tt-space-5); padding: 0; list-style: none; font-size: var(--tt-text-xs); font-weight: 700; color: var(--tt-text-faint); }
    .progress li { display: inline-flex; align-items: center; gap: 6px; padding: 0.3rem 0.7rem 0.3rem 0.4rem; border: 1px solid var(--tt-border); border-radius: var(--tt-radius-pill); }
    .progress li span { display: grid; place-items: center; inline-size: 20px; block-size: 20px; border-radius: 50%; background: var(--tt-surface-3); font-family: var(--tt-font-display); font-size: var(--tt-text-sm); color: var(--tt-text); }
    .progress li.on { color: var(--tt-text); border-color: var(--tt-border-brand); background: var(--tt-brand-tint); }
    .progress li.on span { background: var(--tt-brand-500); color: var(--tt-text-on-brand); }
    .progress li.done { color: var(--tt-success); border-color: rgba(67, 209, 138, 0.4); }
    .progress li.done span { background: var(--tt-success); color: #062814; }

    .assure { display: flex; align-items: center; gap: var(--tt-space-2); margin: var(--tt-space-3) 0 0; color: var(--tt-text-faint); font-size: var(--tt-text-xs); line-height: var(--tt-leading-snug); }
    .assure tt-icon { flex: none; }

    .eta { display: flex; align-items: center; gap: var(--tt-space-2); margin: 0 0 var(--tt-space-3); }

    .back { display: inline-flex; align-items: center; gap: 6px; min-block-size: 40px; color: var(--tt-gold-400); font-size: var(--tt-text-sm); font-weight: 700; }
    h2 { font-size: var(--tt-text-lg); margin-block-end: var(--tt-space-4); }
    .fields { display: grid; gap: var(--tt-space-4); }
    .summary-errors { align-items: center; margin: 0; }
    .label { display: flex; align-items: baseline; gap: 6px; }
    .label__optional { font-weight: 500; color: var(--tt-text-faint); font-size: var(--tt-text-xs); }
    .error { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
    .help { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; min-block-size: 32px; padding: 0 var(--tt-space-1); border: 0; background: none; color: var(--tt-gold-400); font: inherit; font-size: var(--tt-text-xs); font-weight: 700; cursor: pointer; text-decoration: underline; }
    .help[aria-expanded='true'] { text-decoration: none; }
    .help__text { margin: 0; padding: var(--tt-space-3) var(--tt-space-4); border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); background: var(--tt-surface-2); color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
    .check { align-items: flex-start; }
    .check input { inline-size: 20px; block-size: 20px; flex: none; }
    .check__label { display: block; line-height: var(--tt-leading-snug); }
    .check a { text-decoration: underline; }
    .tt-check-field { display: flex; flex-direction: column; gap: var(--tt-space-2); padding: var(--tt-space-3); border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); }
    .tt-check-field--invalid { border-color: var(--tt-danger); }
    .tt-check .tt-hint { display: block; }

    .providers { display: grid; gap: var(--tt-space-2); margin-block: var(--tt-space-4); }
    .provider {
      display: flex; align-items: center; justify-content: space-between; gap: var(--tt-space-3);
      min-block-size: 56px; padding: var(--tt-space-3) var(--tt-space-4); border-radius: var(--tt-radius-md);
      border: 1px solid var(--tt-border-strong); background: var(--tt-surface-2);
      color: var(--tt-text); font: inherit; text-align: start; cursor: pointer;
    }
    .provider__text { display: flex; flex-direction: column; gap: 2px; }
    .provider__check { display: grid; place-items: center; flex: none; inline-size: 20px; block-size: 20px; border-radius: 50%; background: var(--tt-gold-500); color: var(--tt-text-on-gold); opacity: 0; }
    .provider.on { border-color: var(--tt-gold-500); background: var(--tt-gold-tint); box-shadow: inset 0 0 0 1px var(--tt-gold-500); }
    .provider.on .provider__check { opacity: 1; }
    .provider:focus-visible { outline: 2px solid var(--tt-gold-400); outline-offset: 2px; }
    .provider:disabled { opacity: 0.5; cursor: not-allowed; }
    .instruments { border: 0; margin: 0 0 var(--tt-space-4); padding: 0; display: grid; gap: var(--tt-space-2); }
    .instruments legend { padding: 0; margin-block-end: var(--tt-space-2); }
    .instrument {
      display: flex; gap: var(--tt-space-3); align-items: flex-start; min-block-size: 44px;
      padding: var(--tt-space-3); border-radius: var(--tt-radius-md);
      border: 1px solid var(--tt-border); background: var(--tt-surface-2); cursor: pointer;
    }
    .instrument.on { border-color: var(--tt-brand-500); }
    .instrument input { margin-block-start: 0.2rem; accent-color: var(--tt-brand-500); }
    .tt-alert { display: flex; gap: var(--tt-space-2); align-items: flex-start; }
    .instrument span span, .tt-alert span span { display: block; }

    .summary ul { list-style: none; margin: 0 0 var(--tt-space-3); padding: 0; display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .summary li { display: flex; justify-content: space-between; gap: var(--tt-space-3); font-size: var(--tt-text-sm); }
    .line { display: flex; flex-direction: column; gap: 4px; min-inline-size: 0; }
    .line__name { font-weight: 700; }
    .line__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: var(--tt-text-xs); color: var(--tt-text-muted); }
    .line__platform { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: var(--tt-radius-pill); border: 1px solid var(--tt-border-strong); color: var(--tt-text); font-weight: 700; }
    .line__platform tt-icon { color: var(--tt-gold-400); }
    .row { display: flex; justify-content: space-between; font-size: var(--tt-text-sm); }
    .row--coins { padding: var(--tt-space-2) var(--tt-space-3); margin-block-end: var(--tt-space-2); border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-md); background: var(--tt-gold-tint); font-weight: 700; }
    .row--coins .coins { color: var(--tt-gold-400); font-size: var(--tt-text-lg); font-weight: 900; }
    .row.total { font-weight: 700; padding-block-start: var(--tt-space-2); border-block-start: 1px solid var(--tt-border); margin-block-end: var(--tt-space-3); }
    .benefits { margin-block-end: var(--tt-space-2); }

    .waiting { display: flex; flex-direction: column; gap: var(--tt-space-3); margin-block-end: var(--tt-space-4); }
    .waiting__plate { display: flex; align-items: center; gap: var(--tt-space-3); padding: var(--tt-space-3) var(--tt-space-4); border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-md);
      background: linear-gradient(90deg, var(--tt-gold-tint), transparent 60%), var(--tt-surface-2); }
    .waiting__glyph { position: relative; display: grid; place-items: center; inline-size: 48px; block-size: 48px; flex: none; border-radius: 50%; color: var(--tt-gold-400); background: var(--tt-surface-3); }
    .waiting__ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--tt-gold-500); border-inline-start-color: transparent; animation: tt-spin 1.1s linear infinite; }
    .waiting__text { display: flex; flex-direction: column; gap: 2px; }
    .waiting__text strong { font-size: var(--tt-text-md); }
    .waiting__text span { color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading-snug); }
    @media (prefers-reduced-motion: reduce) { .waiting__ring { animation: none; border-inline-start-color: var(--tt-gold-500); } }
    .waiting__form { display: flex; flex-direction: column; gap: var(--tt-space-2); }
    .waiting__label { inline-size: 32%; block-size: 14px; }
    .waiting__input { block-size: 44px; margin-block-end: var(--tt-space-2); }
  `],
})
export class CheckoutPage implements OnDestroy {
  readonly checkout = inject(CheckoutFacade);
  readonly cart = inject(CartFacade);
  private readonly catalog = inject(CatalogFacade);
  private readonly storefront = inject(StorefrontFacade);
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly lookups$ = this.catalog.lookups$;
  readonly providerId = signal<PaymentProviderId>(PaymentProviderId.Mock);
  readonly instrumentToken = signal<string>('sim_success');
  readonly termsKey = CheckoutFieldKey.TermsAcceptance;

  /** Answers live in component memory for the length of the flow and nowhere else. */
  private readonly values = signal<CheckoutFieldValues>({});
  /** Mistakes found in the browser, per field, before anything is sent. */
  private readonly localIssues = signal<readonly CheckoutValidationIssue[]>([]);
  /** Fields the customer has left, so a mistake is shown once they move on, not while typing. */
  private readonly touched = signal<ReadonlySet<CheckoutFieldKey>>(new Set());
  readonly submitted = signal(false);
  readonly helpOpen = signal<ReadonlySet<CheckoutFieldKey>>(new Set());
  /** True when the session could not be opened at all. */
  readonly failed = signal(false);

  /** Everything wrong right now: local findings first, then the server's. */
  readonly allIssues = computed<readonly CheckoutValidationIssue[]>(() => {
    const server = this.checkout.issues();
    const local = this.localIssues().filter((issue) => !server.some((other) => other.field === issue.field));
    return [...local, ...server];
  });

  /** The coin product's variants by id, so the ticket can total the coins. */
  private readonly variants = toSignal(
    this.storefront.focusProductSlug$.pipe(
      switchMap((slug) => this.catalog.productBySlug(slug)),
      map((detail) => new Map(detail.product.variants.map((variant) => [variant.id, variant]))),
      catchError(() => of(new Map<string, ProductVariant>())),
    ),
    { initialValue: new Map<string, ProductVariant>() },
  );

  readonly totalCoins = computed<string | undefined>(() => {
    // The server states each line's coins and any reward coins; a line from
    // older storage falls back to the catalog variant.
    const fromServer = this.cart.totalCoins();
    if (fromServer !== undefined) {
      return formatQuantity(fromServer);
    }
    let sum = 0;
    let any = false;
    for (const item of this.cart.items()) {
      const variant = this.variants().get(item.variantId);
      if (variant?.quantityValue) {
        any = true;
        sum += (variant.quantityValue + launchBonusOf(variant)) * item.quantity;
      }
    }
    return any ? formatQuantity(sum + (this.cart.benefits()?.rewardCoins ?? 0)) : undefined;
  });

  readonly countLabel = computed(() => itemsLabel(this.cart.items().length));

  /** True once opening the session has taken longer than a customer expects. */
  readonly slow = signal(false);
  private slowTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.analytics.pageView('/checkout', 'Checkout');
    this.open();
  }

  ngOnDestroy(): void {
    this.settle();
  }

  /**
   * Opens (or resumes) the session. No reset here: start() resumes an
   * unfinished session for this tab, so a refresh after submitting details
   * does not create a second order.
   */
  private open(): void {
    this.failed.set(false);
    this.slowTimer = setTimeout(() => this.slow.set(true), 4000);
    this.checkout.start().subscribe({
      next: (session) => {
        if (!session && !this.checkout.orderId()) {
          this.failed.set(true);
        }
      },
      complete: () => this.settle(),
      error: () => {
        this.settle();
        this.failed.set(true);
      },
    });
  }

  restart(): void {
    this.open();
  }

  private settle(): void {
    if (this.slowTimer) {
      clearTimeout(this.slowTimer);
      this.slowTimer = undefined;
    }
    this.slow.set(false);
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
    // Correcting a field clears its mark at once; the next check happens on blur or submit.
    if (this.localIssues().some((issue) => issue.field === key)) {
      this.revalidate();
    }
  }

  /** A field the customer has left is checked from then on. */
  touch(requirement: CheckoutRequirement): void {
    this.touched.set(new Set([...this.touched(), requirement.key]));
    this.revalidate();
  }

  private revalidate(): void {
    const scope = this.submitted()
      ? this.checkout.requirements()
      : this.checkout.requirements().filter((requirement) => this.touched().has(requirement.key));
    this.localIssues.set(validateLocally(scope, this.values()));
  }

  issueFor(key: CheckoutFieldKey): LocalizedText | undefined {
    return this.allIssues().find((issue) => issue.field === key)?.message;
  }

  /** True when the label already says the field is optional, so it is not said twice. */
  saysOptional(requirement: CheckoutRequirement): boolean {
    return /אופציונלי|לא חובה|optional/i.test(requirement.label.he + (requirement.label.en ?? ''));
  }

  helpFor(key: CheckoutFieldKey): { readonly question: string; readonly answer: string } | undefined {
    return FIELD_HELP[key];
  }

  toggleHelp(key: CheckoutFieldKey): void {
    const next = new Set(this.helpOpen());
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.helpOpen.set(next);
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

  helpId(key: CheckoutFieldKey): string {
    return `${this.fieldId(key)}-help`;
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

  /** The right keyboard on a phone. */
  inputModeFor(key: CheckoutFieldKey): string | null {
    switch (key) {
      case CheckoutFieldKey.Email:
        return 'email';
      case CheckoutFieldKey.Phone:
        return 'tel';
      default:
        return null;
    }
  }

  submit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    const issues = validateLocally(this.checkout.requirements(), this.values());
    this.localIssues.set(issues);
    if (issues.length > 0) {
      this.focusFirstInvalid();
      return;
    }
    this.checkout.submitDetails(this.values()).subscribe((orderId) => {
      if (orderId) {
        // Opening the gateway session as soon as the order exists is what a real
        // integration does, and it lets the customer see and choose a payment
        // method before committing rather than after.
        this.checkout.startPayment(this.providerId()).subscribe();
      } else if (this.checkout.issues().length > 0) {
        this.focusFirstInvalid();
      }
    });
  }

  /** Puts the keyboard on the first field that needs attention. */
  private focusFirstInvalid(): void {
    setTimeout(() => {
      const field = this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]');
      field?.focus();
      field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 0);
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
