import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AnalyticsEvent, AnalyticsService } from '../../core/analytics';
import { NotificationService } from '../../core/error';
import { SupportTopic, toAppError } from '../../domain';
import { SupportApiService } from '../../data/api';
import { FaqAccordionComponent, IconComponent } from '../../ui';

/**
 * Support. Also serves /contact — the two are the same conversation.
 *
 * The form asks for an email, an order reference and a description. It never asks
 * for account credentials, and says so on the page so a customer can recognise a
 * phishing attempt that does.
 */
@Component({
  selector: 'tt-support-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FaqAccordionComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section narrow">
      <header class="tt-head tt-head--tight">
        <span class="tt-eyebrow">שירות</span>
        <h1>תמיכה</h1>
        <p class="tt-head__lede">נתקלתם בבעיה בהזמנה, באספקה או בתשלום? כתבו לנו ונחזור אליכם במייל.</p>
      </header>

      <div class="tt-alert">
        <tt-icon name="shield" [size]="18"></tt-icon>
        <span>
          <strong>לא נבקש מכם סיסמה</strong>
          <span class="tt-faint">
            צוות התמיכה שלנו לעולם לא יבקש סיסמה, קוד אימות דו-שלבי או קודי גיבוי. פנייה כזו בשמנו היא הונאה.
          </span>
        </span>
      </div>

      <form class="tt-card tt-card--pad form" (submit)="submit($event)" *ngIf="!sentReference()">
        <label class="tt-field">
          <span class="tt-label">נושא הפנייה</span>
          <select class="tt-select" name="topic" [(ngModel)]="topic">
            <option *ngFor="let option of topics" [value]="option.value">{{ option.label }}</option>
          </select>
        </label>

        <label class="tt-field">
          <span class="tt-label">אימייל</span>
          <input class="tt-input" type="email" name="email" [(ngModel)]="email" required />
        </label>

        <label class="tt-field">
          <span class="tt-label">מספר הזמנה (אם יש)</span>
          <input class="tt-input" name="reference" [(ngModel)]="orderReference" placeholder="EC-000123" />
        </label>

        <label class="tt-field">
          <span class="tt-label">כותרת</span>
          <input class="tt-input" name="subject" [(ngModel)]="subject" required maxlength="120" />
        </label>

        <label class="tt-field">
          <span class="tt-label">תיאור</span>
          <textarea class="tt-textarea" name="message" [(ngModel)]="message" required maxlength="1500"></textarea>
        </label>

        <button type="submit" class="tt-btn tt-btn--primary" [disabled]="sending() || !valid">שליחת פנייה</button>
      </form>

      <div class="tt-alert tt-alert--success" *ngIf="sentReference() as reference">
        <tt-icon name="check" [size]="18"></tt-icon>
        <span>
          <strong>הפנייה נקלטה. מספר הפנייה: {{ reference }}</strong>
          <span class="tt-faint">
            שימו לב: האתר בפיתוח, ולכן הפנייה נשמרת בזיכרון הדפדפן בלבד ולא נשלחת לצוות בפועל.
          </span>
        </span>
      </div>

      <section class="tt-section">
        <div class="tt-section__head">
          <h2>שאלות נפוצות</h2>
          <a routerLink="/faq">לכל השאלות →</a>
        </div>
        <tt-faq-accordion [entries]="(faq$ | async) ?? []"></tt-faq-accordion>
      </section>
    </div>
  `,
  styles: [`
    .narrow { max-inline-size: 720px; }
    h1 { margin-block: var(--tt-space-1) var(--tt-space-2); }
    .tt-alert { margin-block: var(--tt-space-4); }
    .tt-alert span span { display: block; }
    .form { display: flex; flex-direction: column; gap: var(--tt-space-4); }
    h2 { font-size: var(--tt-text-lg); }
  `],
})
export class SupportPage {
  private readonly api = inject(SupportApiService);
  private readonly notifications = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);

  readonly faq$ = this.api.getFaq();
  readonly sending = signal(false);
  readonly sentReference = signal<string | null>(null);

  readonly topics: readonly { value: SupportTopic; label: string }[] = [
    { value: SupportTopic.OrderStatus, label: 'סטטוס הזמנה' },
    { value: SupportTopic.DeliveryProblem, label: 'בעיה באספקה' },
    { value: SupportTopic.PaymentProblem, label: 'בעיה בתשלום' },
    { value: SupportTopic.RegionProblem, label: 'בעיית אזור חנות' },
    { value: SupportTopic.RefundRequest, label: 'בקשת החזר' },
    { value: SupportTopic.General, label: 'אחר' },
  ];

  topic: SupportTopic = SupportTopic.OrderStatus;
  email = '';
  orderReference = '';
  subject = '';
  message = '';

  constructor() {
    this.analytics.track(AnalyticsEvent.SupportOpened);
  }

  get valid(): boolean {
    return this.email.includes('@') && this.subject.trim().length > 0 && this.message.trim().length > 0;
  }

  submit(event: Event): void {
    event.preventDefault();
    if (!this.valid) {
      return;
    }
    this.sending.set(true);
    this.api.createTicket({
      topic: this.topic,
      contactEmail: this.email,
      subject: this.subject,
      message: this.message,
      orderReference: this.orderReference || undefined,
    }).subscribe({
      next: (ticket) => {
        this.sending.set(false);
        this.sentReference.set(ticket.reference);
      },
      error: (error: unknown) => {
        this.sending.set(false);
        this.notifications.error(toAppError(error));
      },
    });
  }

}
