import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';

import { AdminApi, QueueJob, TradePlan } from '../api/admin-api.service';
import { StatusPillComponent } from '../ui/status-pill.component';
import { MoneyPipe } from '../ui/money.pipe';

/**
 * One job, and everything an operator does to it.
 *
 * The order of the page follows the order of the work: see what was bought,
 * take the job, issue the listing instruction, then mark what happened. Actions
 * that are not legal in the current state are disabled rather than hidden, so
 * the panel teaches the state machine instead of hiding it.
 */
@Component({
  selector: 'admin-job',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, NgFor, NgIf, StatusPillComponent, MoneyPipe],
  template: `
    <p><a routerLink="/">← חזרה לתור</a></p>

    <p class="error" *ngIf="error() as message">{{ message }}</p>

    <ng-container *ngIf="job() as j">
      <section class="card head">
        <div>
          <h1>{{ j.order.orderNumber }}</h1>
          <p class="muted">
            {{ j.order.contactEmail }} · {{ j.order.createdAt | date: 'dd/MM/yyyy HH:mm' }}
          </p>
        </div>
        <div class="head-right">
          <admin-status-pill [status]="j.status" />
          <strong>{{ j.order.totalMinor | money: j.order.currency }}</strong>
          <span class="muted">{{ j.operatorId ? 'אצל ' + j.operatorId : 'לא משויך' }}</span>
        </div>
      </section>

      <!--
        The buy panel. Once an instruction exists this is the operator's whole
        job: find the card at the exact price and buy it. It shouts when the
        customer has said they listed it (READY), and waits quietly before that.
      -->
      <section class="card buy" *ngIf="j.customerInstruction as ins"
               [class.buy--ready]="j.status === 'READY'">
        <div class="buy-status" *ngIf="j.status === 'READY'">
          ✅ הלקוח סימן שהעלה את הקלף. חפש ורכוש עכשיו, ואז סמן כסופק.
        </div>
        <div class="buy-status waiting" *ngIf="j.status === 'WAITING_FOR_CUSTOMER'">
          ⏳ ממתין שהלקוח יעלה את הקלף למרקט. הפרטים למטה כבר נשלחו אליו.
        </div>

        <h2>לרכישה מהמרקט</h2>
        <p class="player">{{ ins.playerName }}</p>
        <p class="muted small">
          חפש את הקלף במחיר ה-BIN המדויק וקנה אותו. סה"כ יסופק ללקוח:
          <strong>{{ ins.deliveredCoins | number }}</strong> קוינס.
        </p>
        <div class="scroll-x">
          <table>
            <thead>
              <tr><th>#</th><th>מחיר קנייה (BIN מדויק)</th><th>הלקוח מקבל</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let trade of ins.trades">
                <td>{{ trade.sequence }}</td>
                <td><code class="bin">{{ trade.binPrice | number }}</code></td>
                <td>{{ trade.netCoins | number }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="grid">
        <div class="card">
          <h2>מה נקנה</h2>
          <p>
            {{ j.orderItem.displayName['he'] || j.orderItem.displayName['en'] }}
            <span class="muted">× {{ j.orderItem.quantity }}</span>
          </p>
          <p class="muted small">שיטת אספקה: {{ j.orderItem.fulfillmentMethod }}</p>
        </div>

        <div class="card">
          <h2>פרטים שהלקוח מסר</h2>
          <!--
            The closed checkout vocabulary has no credential key, so whatever
            arrives here is a public handle, a platform choice or a note. There
            is nothing sensitive to redact because nothing sensitive is asked.
          -->
          <dl>
            <ng-container *ngFor="let entry of checkoutValues()">
              <dt class="muted small">{{ entry[0] }}</dt>
              <dd>{{ entry[1] }}</dd>
            </ng-container>
            <dd class="muted" *ngIf="checkoutValues().length === 0">אין.</dd>
          </dl>
        </div>
      </section>

      <section class="card">
        <h2>שיוך</h2>
        <div class="actions">
          <button (click)="run(api.claim(j.id))" [disabled]="busy() || !!j.operatorId">
            קח את העבודה
          </button>
          <button (click)="run(api.release(j.id))" [disabled]="busy() || j.status !== 'PROCESSING'">
            שחרר
          </button>
        </div>
      </section>

      <section class="card">
        <h2>הוראת מסירה (Buy the Player)</h2>
        <p class="muted small">
          הלקוח מעלה קלף למרקט במחיר מדויק, וחשבון הפארם קונה אותו. שום סיסמה לא עוברת.
        </p>

        <div class="form-row">
          <label>
            שם השחקן
            <input [(ngModel)]="playerName" placeholder="קלף ברונזה נפוץ" />
          </label>
          <label>
            כמות קוינס נטו
            <input type="number" [(ngModel)]="coins" (ngModelChange)="preview()" min="1000" />
          </label>
        </div>
        <label>
          הערה ללקוח (רשות)
          <input [(ngModel)]="note" maxlength="400" />
        </label>

        <div class="plan" *ngIf="plan() as p">
            <p class="muted small">
              יסופק {{ p.deliveredCoins | number }} · עולה לנו
              {{ p.grossCoinsSpent | number }} · מתוכם
              {{ p.taxCoins | number }} מס EA
            </p>
            <div class="scroll-x">
              <table>
                <thead>
                  <tr><th>#</th><th>מחיר להעלאה (BIN)</th><th>הלקוח מקבל</th></tr>
                </thead>
                <tbody>
                  <tr *ngFor="let trade of p.trades">
                    <td>{{ trade.sequence }}</td>
                    <td><code>{{ trade.binPrice | number }}</code></td>
                    <td>{{ trade.netCoins | number }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
        </div>

        <div class="actions">
          <button
            class="primary"
            (click)="issue(j.id)"
            [disabled]="busy() || !playerName.trim() || !coins"
          >
            שלח הוראה ללקוח
          </button>
        </div>

        <p class="muted small issued" *ngIf="j.customerInstruction as issued">
          נשלחה הוראה: {{ issued.playerName }} · {{ issued.trades.length }} ליסטינגים ·
          {{ issued.deliveredCoins | number }} קוינס
        </p>
      </section>

      <section class="card">
        <h2>סגירה</h2>
        <div class="actions">
          <button
            class="primary"
            (click)="deliver(j.id)"
            [disabled]="busy() || j.status === 'DELIVERED'"
          >
            סמן כסופק
          </button>
          <button (click)="run(api.retry(j.id))" [disabled]="busy() || j.status !== 'FAILED'">
            החזר לתור
          </button>
        </div>

        <label class="fail-reason">
          סיבת כשל (מוצגת ללקוח, בעברית)
          <input [(ngModel)]="failReason" maxlength="400" />
        </label>
        <button
          class="danger"
          (click)="fail(j.id)"
          [disabled]="busy() || failReason.trim().length < 3"
        >
          סמן ככישלון
        </button>

        <p class="error small" *ngIf="j.failureReason?.he as reason">{{ reason }}</p>
      </section>
    </ng-container>

    <p class="muted" *ngIf="!job() && !error()">טוען…</p>
  `,
  styles: [
    `
      .head {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .head h1 { margin: 0; }
      .head-right {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.3rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 1rem;
        margin-bottom: 1rem;
      }
      section.card { margin-bottom: 1rem; }
      .form-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 0.9rem;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.6rem;
        margin-top: 0.5rem;
      }
      .plan {
        margin: 0.8rem 0;
        padding: 0.7rem;
        border: 1px solid var(--border);
        border-radius: var(--radius);
        background: var(--surface-2);
      }
      .small { font-size: 0.82rem; }
      .buy--ready { border-color: var(--ok, #2e7d32); box-shadow: 0 0 0 1px var(--ok, #2e7d32) inset; }
      .buy-status {
        font-weight: 700;
        padding: 0.6rem 0.8rem;
        border-radius: var(--radius);
        background: rgba(46, 125, 50, 0.14);
        margin-bottom: 0.8rem;
      }
      .buy-status.waiting { background: var(--surface-2); font-weight: 600; }
      .buy .player { font-size: 1.4rem; font-weight: 800; margin: 0.2rem 0; }
      .buy .bin { font-size: 1.05rem; font-weight: 700; }
      .issued { margin-top: 0.8rem; }
      .fail-reason { margin-top: 1.2rem; }
      dl { margin: 0; }
      dt { margin-top: 0.5rem; }
      dd { margin: 0; }
    `,
  ],
})
export class JobPage {
  readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);

  playerName = '';
  coins: number | null = null;
  note = '';
  failReason = '';

  readonly job = signal<QueueJob | null>(null);
  readonly plan = signal<TradePlan | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly checkoutValues = computed(() =>
    Object.entries(this.job()?.order.checkoutValues ?? {}).map(
      ([key, value]) => [key, String(value)] as const,
    ),
  );

  constructor() {
    this.reload();
  }

  private get id(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  reload(): void {
    this.api.job(this.id).subscribe({
      next: (job) => {
        this.job.set(job);
        // Pre-fill from an instruction already issued, so reopening the page
        // shows what the customer was actually told rather than a blank form.
        if (job.customerInstruction) {
          this.playerName ||= job.customerInstruction.playerName;
          this.coins ??= job.customerInstruction.requestedCoins;
        }
      },
      error: (error: Error) => this.error.set(error.message),
    });
  }

  /** Recomputes the listing plan on the server, so the panel never guesses the price. */
  preview(): void {
    const coins = this.coins;
    if (!coins || coins < 1_000) {
      this.plan.set(null);
      return;
    }

    this.api.previewTrades(coins).subscribe({
      next: (plan) => this.plan.set(plan),
      error: () => this.plan.set(null),
    });
  }

  issue(id: string): void {
    if (!this.coins) {
      return;
    }
    this.run(
      this.api.issueTradeInstruction(id, {
        playerName: this.playerName.trim(),
        coins: this.coins,
        note: this.note.trim() || undefined,
      }),
    );
  }

  deliver(id: string): void {
    const instruction = this.job()?.customerInstruction;
    this.run(
      this.api.deliver(id, {
        kind: 'TRADE',
        playerName: instruction?.playerName ?? this.playerName.trim(),
        deliveredCoins: instruction?.deliveredCoins ?? this.coins,
      }),
    );
  }

  fail(id: string): void {
    this.run(this.api.fail(id, { he: this.failReason.trim() }));
  }

  /** Runs one operator action, then reloads so the page shows the real new state. */
  run(action: Observable<unknown>): void {
    this.busy.set(true);
    this.error.set(null);

    action.subscribe({
      next: () => {
        this.busy.set(false);
        this.reload();
      },
      error: (error: Error) => {
        this.busy.set(false);
        this.error.set(error.message);
        // Reloaded even on failure: a rejection usually means someone else moved
        // the job, and the operator needs to see where it actually is.
        this.reload();
      },
    });
  }
}
