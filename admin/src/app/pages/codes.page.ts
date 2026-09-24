import { Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { CreatorCode, PricingApi } from '../api/pricing-api.service';
import { MoneyPipe } from '../ui/money.pipe';

/**
 * Creator codes: created, paused and read back with their attribution.
 *
 * A code is a coupon row; nothing about a creator is in the code base. The
 * percentage is capped by the server at 30% and again by the ladder's
 * maximum discount at pricing time.
 */
@Component({
  selector: 'admin-codes',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, NgFor, NgIf, MoneyPipe],
  template: `
    <p class="crumbs"><a routerLink="/">← תור עבודה</a> · <a routerLink="/pricing">מחירים</a></p>
    <h1>קודי יוצרים</h1>

    <p class="error" *ngIf="error() as message">{{ message }}</p>
    <p class="ok" *ngIf="notice() as message">{{ message }}</p>

    <section class="card">
      <h2>קוד חדש</h2>
      <div class="grid">
        <label>קוד (אותיות וספרות)<input [(ngModel)]="draft.code" maxlength="20" placeholder="GOAT10" /></label>
        <label>יוצר<input [(ngModel)]="draft.creator" maxlength="80" /></label>
        <label>הנחה (%)<input type="number" min="1" max="30" step="0.5" [(ngModel)]="draft.percent" /></label>
        <label>מינימום הזמנה (₪, ריק = ללא)<input type="number" min="0" [(ngModel)]="draft.minShekels" /></label>
        <label>תקרת מימושים (ריק = ללא)<input type="number" min="1" [(ngModel)]="draft.maxRedemptions" /></label>
        <label>סיום (ISO, ריק = ללא)<input [(ngModel)]="draft.endsAt" placeholder="2026-12-31T23:59:59+02:00" /></label>
      </div>
      <div class="actions"><button class="primary" (click)="create()" [disabled]="busy()">יצירת קוד</button></div>
    </section>

    <section class="card">
      <h2>קודים</h2>
      <table>
        <thead><tr><th>קוד</th><th>יוצר</th><th>הנחה</th><th>מינימום</th><th>מימושים</th><th>סיום</th><th>מצב</th><th>הזמנות ששולמו</th><th>הכנסה</th><th></th></tr></thead>
        <tbody>
          <tr *ngFor="let code of codes()">
            <td><strong>{{ code.code }}</strong></td>
            <td>{{ code.creator }}</td>
            <td class="num">{{ code.percentBps / 100 | number: '1.0-1' }}%</td>
            <td class="num">{{ code.minSubtotalMinor === null ? '—' : (code.minSubtotalMinor | money) }}</td>
            <td class="num">{{ code.redemptionCount }}{{ code.maxRedemptions === null ? '' : ' / ' + code.maxRedemptions }}</td>
            <td>{{ code.endsAt ? (code.endsAt | date: 'dd/MM/yyyy') : '—' }}</td>
            <td>{{ code.active ? 'פעיל' : 'מושהה' }}</td>
            <ng-container *ngIf="attribution()[code.code] as report; else pending">
              <td class="num">{{ report.orders }}</td>
              <td class="num">{{ report.revenueMinor | money }}</td>
            </ng-container>
            <ng-template #pending><td class="num">…</td><td class="num">…</td></ng-template>
            <td><button (click)="toggle(code)" [disabled]="busy()">{{ code.active ? 'השהיה' : 'הפעלה' }}</button></td>
          </tr>
          <tr *ngIf="codes().length === 0"><td colspan="10" class="muted">אין קודים עדיין.</td></tr>
        </tbody>
      </table>
    </section>
  `,
  styles: [
    `
      .crumbs { margin: 0 0 0.6rem; color: var(--muted); }
      .card { padding: 1rem 1.2rem; margin-bottom: 1rem; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.4rem 1rem; }
      .actions { display: flex; gap: 0.6rem; margin-top: 0.6rem; }
      td.num { text-align: left; direction: ltr; white-space: nowrap; }
      .error { color: var(--danger); }
      .ok { color: var(--ok); }
    `,
  ],
})
export class CodesPage {
  private readonly api = inject(PricingApi);

  readonly codes = signal<CreatorCode[]>([]);
  readonly attribution = signal<Record<string, { orders: number; revenueMinor: number; discountMinor: number }>>({});
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);

  draft = { code: '', creator: '', percent: 5, minShekels: null as number | null, maxRedemptions: null as number | null, endsAt: '' };

  constructor() {
    this.load();
  }

  load(): void {
    this.api.codes().subscribe({
      next: (codes) => {
        this.codes.set(codes);
        for (const code of codes) {
          this.api.attribution(code.code).subscribe({
            next: (report) => this.attribution.set({ ...this.attribution(), [code.code]: report }),
            error: () => undefined,
          });
        }
      },
      error: (error: Error) => this.error.set(error.message),
    });
  }

  create(): void {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    this.api.createCode({
      code: this.draft.code.trim().toUpperCase(),
      creator: this.draft.creator.trim(),
      percentBps: Math.round(this.draft.percent * 100),
      minSubtotalMinor: this.draft.minShekels === null || this.draft.minShekels === undefined ? null : Math.round(this.draft.minShekels * 100),
      maxRedemptions: this.draft.maxRedemptions || null,
      endsAt: this.draft.endsAt || null,
    }).subscribe({
      next: (code) => {
        this.busy.set(false);
        this.notice.set(`הקוד ${code.code} נוצר.`);
        this.draft = { code: '', creator: '', percent: 5, minShekels: null, maxRedemptions: null, endsAt: '' };
        this.load();
      },
      error: (error: Error) => {
        this.busy.set(false);
        this.error.set(error.message);
      },
    });
  }

  toggle(code: CreatorCode): void {
    this.busy.set(true);
    this.api.updateCode(code.code, { active: !code.active }).subscribe({
      next: () => {
        this.busy.set(false);
        this.notice.set(code.active ? `הקוד ${code.code} הושהה.` : `הקוד ${code.code} הופעל.`);
        this.load();
      },
      error: (error: Error) => {
        this.busy.set(false);
        this.error.set(error.message);
      },
    });
  }
}
