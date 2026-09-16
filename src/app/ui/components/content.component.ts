import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LocalizePipe } from '../../core/i18n';
import {
  CoinTradeInstruction, FaqEntry, Fulfillment, FulfillmentStatus, ORDER_STATUS_FLOW, OrderStatus, Review,
} from '../../domain';
import { IconComponent, IconName } from './icon.component';
import { StarRatingComponent } from './star-rating.component';

@Component({
  selector: 'tt-review-card',
  standalone: true,
  imports: [CommonModule, StarRatingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="tt-panel">
      <header>
        <strong>{{ review.authorDisplayName }}</strong>
        <span class="tt-badge tt-badge--success" *ngIf="review.verifiedPurchase">רכישה מאומתת</span>
      </header>
      <tt-star-rating [rating]="review.rating"></tt-star-rating>
      <h3 *ngIf="review.title">{{ review.title }}</h3>
      <p class="tt-muted">{{ review.body }}</p>
      <time class="tt-faint" [attr.datetime]="review.createdAt">{{ review.createdAt | date:'d MMM yyyy' }}</time>
    </article>
  `,
  styles: [`
    article { display: flex; flex-direction: column; gap: var(--tt-space-2); }
    header { display: flex; align-items: center; gap: var(--tt-space-2); justify-content: space-between; }
    h3 { margin: 0; font-size: var(--tt-text-md); }
    p { margin: 0; font-size: var(--tt-text-sm); }
  `],
})
export class ReviewCardComponent {
  @Input({ required: true }) review!: Review;
}

/** Native disclosure widget — keyboard accessible without any JavaScript. */
@Component({
  selector: 'tt-faq-accordion',
  standalone: true,
  imports: [CommonModule, LocalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="faq-list">
      <details class="faq-item" *ngFor="let entry of entries">
        <summary>
          <span>{{ entry.question | t }}</span>
          <span class="faq-sign" aria-hidden="true"></span>
        </summary>
        <p class="tt-muted">{{ entry.answer | t }}</p>
      </details>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .faq-list { display: flex; flex-direction: column; gap: var(--tt-space-2); }
    .faq-item {
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface);
      padding: var(--tt-space-4);
      transition: border-color var(--tt-duration-fast) var(--tt-ease);
    }
    .faq-item[open] { border-color: var(--tt-border-brand); }
    summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--tt-space-3);
      cursor: pointer;
      font-weight: 600;
      font-size: var(--tt-text-sm);
      list-style: none;
    }
    /* The default triangle is replaced by a plus that becomes a minus, which
       reads the same in both directions and does not flip in RTL. */
    summary::-webkit-details-marker { display: none; }
    summary::marker { content: ''; }
    .faq-sign {
      position: relative;
      inline-size: 14px;
      block-size: 14px;
      flex: none;
      color: var(--tt-brand-400);
    }
    .faq-sign::before,
    .faq-sign::after {
      content: '';
      position: absolute;
      inset-block-start: 50%;
      inset-inline-start: 0;
      inline-size: 14px;
      block-size: 2px;
      border-radius: 2px;
      background: currentColor;
      transform: translateY(-50%);
      transition: transform var(--tt-duration) var(--tt-ease), opacity var(--tt-duration) var(--tt-ease);
    }
    .faq-sign::after { transform: translateY(-50%) rotate(90deg); }
    .faq-item[open] .faq-sign::after { transform: translateY(-50%) rotate(0deg); opacity: 0; }

    p { margin-block: var(--tt-space-3) 0; font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
  `],
})
export class FaqAccordionComponent {
  @Input() entries: readonly FaqEntry[] = [];
}

/**
 * Order lifecycle timeline. Terminal failure states are rendered as their own
 * step rather than being squeezed into the happy path.
 */
@Component({
  selector: 'tt-order-status-timeline',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="timeline">
      <li *ngFor="let step of steps" [class.done]="step.done" [class.current]="step.current">
        <span class="dot" aria-hidden="true"></span>
        <span class="label">{{ step.label }}</span>
      </li>
    </ol>
    <p class="tt-alert tt-alert--danger" *ngIf="isFailed">
      ההזמנה נעצרה. צוות התמיכה שלנו יצור איתכם קשר, ואפשר גם לפנות אלינו מדף התמיכה.
    </p>
  `,
  styles: [`
    .timeline {
      list-style: none;
      margin: 0 0 var(--tt-space-4);
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-4);
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      color: var(--tt-text-faint);
      position: relative;
    }
    li:not(:last-child)::after {
      content: '';
      position: absolute;
      inset-block-start: 22px;
      inset-inline-start: 7px;
      inline-size: 2px;
      block-size: calc(100% + var(--tt-space-4) - 22px);
      background: var(--tt-border);
    }
    .dot {
      inline-size: 16px;
      block-size: 16px;
      border-radius: 50%;
      border: 2px solid var(--tt-border-strong);
      background: var(--tt-surface);
      flex: none;
      z-index: 1;
    }
    li.done { color: var(--tt-text); }
    li.done .dot { background: var(--tt-success); border-color: var(--tt-success); }
    li.current { color: var(--tt-text); font-weight: 600; }
    li.current .dot { border-color: var(--tt-brand-500); box-shadow: 0 0 0 4px var(--tt-brand-tint); }
  `],
})
export class OrderStatusTimelineComponent {
  @Input() status: OrderStatus = OrderStatus.PendingPayment;

  private static readonly LABELS: Readonly<Record<string, string>> = {
    [OrderStatus.PendingPayment]: 'ממתין לתשלום',
    [OrderStatus.PaymentProcessing]: 'התשלום בעיבוד',
    [OrderStatus.Paid]: 'התשלום התקבל',
    [OrderStatus.FulfillmentProcessing]: 'ההזמנה בהכנה',
    [OrderStatus.Fulfilled]: 'ההזמנה סופקה',
  };

  get isFailed(): boolean {
    return this.status === OrderStatus.Failed || this.status === OrderStatus.Cancelled;
  }

  get steps(): readonly { label: string; done: boolean; current: boolean }[] {
    const currentIndex = ORDER_STATUS_FLOW.indexOf(this.status);
    return ORDER_STATUS_FLOW.map((status, index) => ({
      label: OrderStatusTimelineComponent.LABELS[status] ?? status,
      done: currentIndex >= 0 && index < currentIndex,
      current: index === currentIndex,
    }));
  }
}

/** Renders what a customer actually received for one order line. */
@Component({
  selector: 'tt-delivery-payload',
  standalone: true,
  imports: [CommonModule, LocalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-panel" *ngIf="fulfillment">
      <ng-container [ngSwitch]="fulfillment.delivery?.payload?.kind">
        <div *ngSwitchCase="'CODE'" class="code">
          <span class="tt-faint">הקוד שלכם</span>
          <code>{{ code }}</code>
          <span class="tt-hint">קוד הדגמה בסביבת פיתוח. אינו ניתן למימוש.</span>
        </div>
        <p *ngSwitchDefault class="tt-muted">{{ statusLabel }}</p>
      </ng-container>
      <p class="tt-error" *ngIf="fulfillment.failureReason">{{ fulfillment.failureReason | t }}</p>
    </div>
  `,
  styles: [`
    .code { display: flex; flex-direction: column; gap: var(--tt-space-1); }
    code {
      font-size: var(--tt-text-lg);
      letter-spacing: 0.08em;
      background: var(--tt-surface-3);
      padding: var(--tt-space-2) var(--tt-space-3);
      border-radius: var(--tt-radius-sm);
      direction: ltr;
      text-align: center;
    }
  `],
})
export class DeliveryPayloadComponent {
  @Input() fulfillment?: Fulfillment;

  get code(): string {
    const payload = this.fulfillment?.delivery?.payload;
    return payload?.kind === 'CODE' ? payload.code : '';
  }

  get statusLabel(): string {
    switch (this.fulfillment?.status) {
      case FulfillmentStatus.Processing:
        return 'ההזמנה בהכנה. נעדכן אתכם ברגע שתסופק.';
      case FulfillmentStatus.WaitingForCustomer:
        return 'ממתינים לפרטים מכם כדי להשלים את האספקה.';
      case FulfillmentStatus.Pending:
        return 'ממתין לאישור התשלום.';
      case FulfillmentStatus.Cancelled:
        return 'האספקה בוטלה.';
      case FulfillmentStatus.Refunded:
        return 'בוצע החזר כספי.';
      default:
        return 'סופק.';
    }
  }
}

/**
 * The customer's next step for a coin order: which card to list, at what price.
 *
 * This is the whole point of the "no password" method. The customer performs
 * the listing themselves, so they have to be told exactly what to do, and the
 * price has to be exact or our account cannot find the listing to buy it.
 */
@Component({
  selector: 'tt-delivery-instruction',
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ins" *ngIf="instruction as ins">
      <p class="ins__eyebrow"><tt-icon name="bolt" [size]="14"></tt-icon> הצעד הבא שלכם</p>
      <h3>מעלים קלף למכירה, ואנחנו קונים אותו</h3>
      <p class="ins__lede">
        כדי לקבל את הקוינס בלי למסור פרטי חשבון, מעלים במרקט קלף שאנחנו קונים מכם.
        הקוינס עוברים אליכם דרך המכירה.
      </p>

      <ol class="steps">
        <li>
          <span class="steps__n">1</span>
          <div>קנו במרקט את השחקן <strong>{{ ins.playerName }}</strong> (עולה כמה מאות קוינס בלבד).</div>
        </li>
        <li>
          <span class="steps__n">2</span>
          <div>
            העלו אותו למכירה
            <ng-container *ngIf="ins.trades.length === 1; else many">
              במחיר <strong>Buy Now מדויק</strong>:
              <span class="price">{{ ins.trades[0].binPrice | number }}</span>
            </ng-container>
            <ng-template #many>
              ב־{{ ins.trades.length }} מכירות נפרדות, כל אחת במחיר המדויק:
              <ul class="prices">
                <li *ngFor="let t of ins.trades">
                  מכירה {{ t.sequence }}: <span class="price">{{ t.binPrice | number }}</span>
                </li>
              </ul>
            </ng-template>
          </div>
        </li>
        <li>
          <span class="steps__n">3</span>
          <div>החשבון שלנו קונה את הקלף, והקוינס אצלכם. הסטטוס כאן יתעדכן ל"סופק".</div>
        </li>
      </ol>

      <p class="ins__total">סה״כ תקבלו: <strong>{{ ins.deliveredCoins | number }}</strong> קוינס</p>
      <p class="ins__note" *ngIf="ins.note">{{ ins.note }}</p>
      <p class="ins__safe"><tt-icon name="check" [size]="14"></tt-icon> לא נבקש סיסמה, קוד אימות או קודי גיבוי. אתם מבצעים הכל מהחשבון שלכם.</p>
    </div>
  `,
  styles: [`
    .ins { border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-lg); padding: var(--tt-space-5); background: linear-gradient(135deg, rgba(212, 180, 106, 0.14), transparent 55%), var(--tt-surface); }
    .ins__eyebrow { margin: 0 0 var(--tt-space-2); display: flex; align-items: center; gap: 6px; font-size: var(--tt-caption); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--tt-gold-400); }
    .ins h3 { margin: 0 0 var(--tt-space-2); font-size: var(--tt-text-lg); }
    .ins__lede { margin: 0 0 var(--tt-space-4); color: var(--tt-text-muted); line-height: var(--tt-leading); }
    .steps { list-style: none; margin: 0 0 var(--tt-space-4); padding: 0; display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .steps li { display: flex; gap: var(--tt-space-3); align-items: flex-start; }
    .steps__n { flex: none; inline-size: 26px; block-size: 26px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: var(--tt-text-sm); background: var(--tt-gold-metal); color: var(--tt-text-on-gold); }
    .steps div { line-height: var(--tt-leading); padding-block-start: 2px; }
    .price { display: inline-block; direction: ltr; font-weight: 800; font-size: var(--tt-text-md); background: var(--tt-surface-3); padding: 2px var(--tt-space-2); border-radius: var(--tt-radius-sm); letter-spacing: 0.04em; }
    .prices { list-style: none; margin: var(--tt-space-2) 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .ins__total { margin: 0 0 var(--tt-space-2); font-size: var(--tt-text-md); }
    .ins__note { margin: 0 0 var(--tt-space-2); color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .ins__safe { margin: 0; display: flex; align-items: center; gap: 6px; font-size: var(--tt-text-sm); color: var(--tt-text-muted); }
    .ins__safe tt-icon { color: var(--tt-success); }
  `],
})
export class DeliveryInstructionComponent {
  @Input() instruction?: CoinTradeInstruction;
}
