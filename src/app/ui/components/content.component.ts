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
      <!-- Header: how much is being delivered, and where things stand. -->
      <div class="ins__head">
        <div>
          <p class="ins__eyebrow"><tt-icon name="bolt" [size]="14"></tt-icon> אספקת הקוינס שלכם</p>
          <h3>{{ ins.deliveredCoins | number }} קוינס<span *ngIf="platform"> · {{ platform }}</span></h3>
        </div>
        <span class="ins__phase" [class.working]="isBuying">{{ phaseLabel }}</span>
      </div>

      <div class="bar" [attr.aria-label]="'התקדמות אספקה'">
        <span class="bar__fill" [style.inline-size.%]="percent"></span>
      </div>
      <p class="bar__meta">{{ deliveredSoFar | number }} / {{ ins.deliveredCoins | number }} ({{ percent }}%)</p>

      <!-- The three steps, side by side on desktop, stacked on phone. -->
      <ol class="grid">
        <li class="step" [class.active]="!isBuying">
          <div class="step__top"><span class="step__n">1</span><h4>קונים שחקן</h4></div>
          <p class="step__lede">קנו במרקט קלף מהסוג הבא (עולה כמה מאות קוינס):</p>
          <div class="card">
            <div class="card__art" aria-hidden="true"><tt-icon name="coin" [size]="26"></tt-icon></div>
            <div class="card__meta">
              <strong>{{ ins.playerName }}</strong>
              <span class="card__price">מחיר: עד <b>{{ vehicleBudget | number }}</b></span>
            </div>
          </div>
        </li>

        <li class="step" [class.active]="!isBuying">
          <div class="step__top"><span class="step__n">2</span><h4>מעלים למכירה</h4></div>
          <p class="step__lede">העלו אותו במרקט עם המחירים המדויקים:</p>
          <div class="params" *ngFor="let t of ins.trades">
            <span *ngIf="ins.trades.length > 1" class="params__seq">מכירה {{ t.sequence }}</span>
            <div class="param"><span>מחיר פתיחה</span><b class="num">{{ startPrice(t.binPrice) | number }}</b></div>
            <div class="param param--key"><span>Buy Now (מדויק)</span><b class="num">{{ t.binPrice | number }}</b></div>
            <div class="param"><span>משך המכירה</span><b>שעה אחת</b></div>
          </div>
        </li>

        <li class="step" [class.active]="isBuying">
          <div class="step__top"><span class="step__n">3</span><h4>אנחנו קונים</h4></div>
          <p class="step__lede" *ngIf="!isBuying">אחרי שהעליתם, נציג שלנו קונה את הקלף מהמרקט והקוינס אצלכם.</p>
          <div class="buying" *ngIf="isBuying">
            <span class="spinner" aria-hidden="true"></span>
            <p>הקלף נקנה כרגע. הסטטוס יתעדכן ל"סופק" בעוד רגע.</p>
          </div>
        </li>
      </ol>

      <p class="warn" *ngIf="!isBuying">
        <tt-icon name="bolt" [size]="14"></tt-icon>
        חשוב: המחיר המדויק הוא מה שמזהה את המכירה שלכם. העלו בדיוק במחיר ה-Buy Now שלמעלה, אחרת לא נוכל למצוא ולקנות את הקלף.
      </p>
      <p class="ins__note" *ngIf="ins.note">{{ ins.note }}</p>
      <p class="ins__safe"><tt-icon name="check" [size]="14"></tt-icon> לא נבקש סיסמה, קוד אימות או קודי גיבוי. אתם מבצעים הכל מהחשבון שלכם.</p>
    </div>
  `,
  styles: [`
    .ins { border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-lg); padding: var(--tt-space-5); background: linear-gradient(135deg, rgba(212, 180, 106, 0.14), transparent 55%), var(--tt-surface); }
    .ins__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--tt-space-3); }
    .ins__eyebrow { margin: 0 0 var(--tt-space-1); display: flex; align-items: center; gap: 6px; font-size: var(--tt-caption); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--tt-gold-400); }
    .ins h3 { margin: 0; font-size: var(--tt-text-xl); color: var(--tt-text); }
    .ins__phase { flex: none; font-size: var(--tt-text-sm); font-weight: 700; color: var(--tt-text-muted); border: 1px solid var(--tt-border); border-radius: 999px; padding: 2px var(--tt-space-3); }
    .ins__phase.working { color: var(--tt-text-on-gold); background: var(--tt-gold-metal); border-color: transparent; }
    .bar { margin: var(--tt-space-3) 0 6px; block-size: 8px; border-radius: 999px; background: var(--tt-surface-3); overflow: hidden; }
    .bar__fill { display: block; block-size: 100%; background: var(--tt-gold-metal); transition: inline-size .4s ease; }
    .bar__meta { margin: 0 0 var(--tt-space-4); font-size: var(--tt-caption); color: var(--tt-text-muted); direction: ltr; text-align: start; }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--tt-space-3); }
    @media (min-width: 760px) { .grid { grid-template-columns: repeat(3, 1fr); } }
    .step { border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md, 10px); padding: var(--tt-space-4); background: var(--tt-surface); }
    .step.active { border-color: var(--tt-gold-600); box-shadow: inset 0 0 0 1px var(--tt-gold-600); }
    .step__top { display: flex; align-items: center; gap: var(--tt-space-2); margin-block-end: var(--tt-space-2); }
    .step__n { flex: none; inline-size: 24px; block-size: 24px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; font-size: var(--tt-text-sm); background: var(--tt-gold-metal); color: var(--tt-text-on-gold); }
    .step h4 { margin: 0; font-size: var(--tt-text-md); color: var(--tt-text); }
    .step__lede { margin: 0 0 var(--tt-space-3); font-size: var(--tt-text-sm); color: var(--tt-text-muted); line-height: var(--tt-leading); }
    .card { display: flex; gap: var(--tt-space-3); align-items: center; padding: var(--tt-space-2); border: 1px solid var(--tt-border); border-radius: var(--tt-radius-sm); background: var(--tt-surface-3); }
    .card__art { flex: none; inline-size: 46px; block-size: 60px; border-radius: 6px; display: grid; place-items: center; background: linear-gradient(160deg, var(--tt-gold-600), #7a5c1f); color: var(--tt-text-on-gold); }
    .card__meta { display: flex; flex-direction: column; gap: 2px; min-inline-size: 0; }
    .card__price { font-size: var(--tt-text-sm); color: var(--tt-text-muted); }
    .params { display: flex; flex-direction: column; gap: 6px; padding-block: 6px; border-block-start: 1px dashed var(--tt-border); }
    .params:first-of-type { border-block-start: 0; }
    .params__seq { font-size: var(--tt-caption); font-weight: 800; color: var(--tt-gold-400); }
    .param { display: flex; justify-content: space-between; align-items: center; gap: var(--tt-space-2); font-size: var(--tt-text-sm); color: var(--tt-text-muted); }
    .param .num { direction: ltr; letter-spacing: 0.03em; }
    .param--key { color: var(--tt-text); }
    .param--key b { color: var(--tt-gold-400); font-size: var(--tt-text-md); }
    .buying { display: flex; align-items: center; gap: var(--tt-space-2); font-size: var(--tt-text-sm); color: var(--tt-text); }
    .buying p { margin: 0; }
    .spinner { flex: none; inline-size: 18px; block-size: 18px; border-radius: 50%; border: 2px solid var(--tt-border); border-block-start-color: var(--tt-gold-400); animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .warn { margin: var(--tt-space-4) 0 var(--tt-space-2); display: flex; gap: 8px; align-items: flex-start; padding: var(--tt-space-3); border: 1px solid var(--tt-gold-600); border-radius: var(--tt-radius-sm); background: rgba(212, 180, 106, 0.08); font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
    .warn tt-icon { color: var(--tt-gold-400); flex: none; margin-block-start: 2px; }
    .ins__note { margin: 0 0 var(--tt-space-2); color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .ins__safe { margin: 0; display: flex; align-items: center; gap: 6px; font-size: var(--tt-text-sm); color: var(--tt-text-muted); }
    .ins__safe tt-icon { color: var(--tt-success); }
  `],
})
export class DeliveryInstructionComponent {
  @Input() instruction?: CoinTradeInstruction;
  /** The line's fulfillment status, so the stepper can reflect where things stand. */
  @Input() status?: FulfillmentStatus;
  /** Platform name for the header, resolved by the page. Optional. */
  @Input() platform?: string;

  /** True once an operator is buying the listed card: step 3 is in progress. */
  get isBuying(): boolean {
    return this.status === FulfillmentStatus.Processing || this.status === FulfillmentStatus.Ready;
  }

  get phaseLabel(): string {
    return this.isBuying ? 'רכישה בתהליך' : 'ממתין לפעולה שלכם';
  }

  /** Coins credited so far. The panel is hidden once delivered, so this stays 0. */
  get deliveredSoFar(): number {
    return 0;
  }

  get percent(): number {
    return this.isBuying ? 66 : 0;
  }

  /**
   * A rough ceiling for the cheap "vehicle" card the customer buys to list.
   * It only has to be a common card, so a few hundred coins is plenty; this
   * gives them a concrete "up to" number rather than a vague instruction.
   */
  get vehicleBudget(): number {
    return 1000;
  }

  /**
   * A start price safely below the exact Buy Now, so the listing is valid. Only
   * the Buy Now must be exact; the start price just has to be lower.
   */
  startPrice(binPrice: number): number {
    return Math.max(200, Math.floor((binPrice * 0.9) / 1000) * 1000);
  }
}
