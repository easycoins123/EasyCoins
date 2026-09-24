import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  CompetitorsConfig, EconomicsConfig, LadderConfig, LadderEvaluation, LadderPackage, LaunchConfig, PricingApi, PricingSetting,
  StorefrontState,
} from '../api/pricing-api.service';
import { MoneyPipe } from '../ui/money.pipe';

/**
 * The owner's price desk.
 *
 * Top to bottom in the order a decision is made: what is on sale now; the
 * economics (cost, fee, floor); the ladder with its evaluation beside it;
 * the gate and the activation; the launch offer; the competitor snapshot.
 * Every number is edited in shekels or percent here and sent to the server
 * in agorot and basis points; the server validates and is the only judge.
 */
@Component({
  selector: 'admin-pricing',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, NgClass, NgFor, NgIf, MoneyPipe],
  template: `
    <p class="crumbs"><a routerLink="/">← תור עבודה</a> · <a routerLink="/pricing/codes">קודי יוצרים</a></p>
    <h1>מחירים · FC27</h1>

    <p class="error" *ngIf="error() as message">{{ message }}</p>
    <p class="ok" *ngIf="notice() as message">{{ message }}</p>

    <!-- What is on sale -->
    <section class="card head" *ngIf="storefront() as store">
      <div>
        <h2>מה נמכר עכשיו</h2>
        <p class="muted">
          מהדורה פעילה: <strong>{{ store.activeEdition === 'fc27' ? 'FC 27' : 'FC 26' }}</strong> ·
          סולם FC27: <strong>{{ store.ladderStatus === 'active' ? 'פעיל' : 'טיוטה' }}</strong>
        </p>
      </div>
      <div class="actions">
        <button class="primary" *ngIf="store.ladderStatus !== 'active'" (click)="activate()" [disabled]="busy()">הפעלת סולם FC27</button>
        <button *ngIf="store.ladderStatus === 'active'" (click)="republish()" [disabled]="busy()">פרסום מחדש של הסולם</button>
        <button class="danger" *ngIf="store.ladderStatus === 'active'" (click)="deactivate()" [disabled]="busy()">חזרה ל-FC26</button>
      </div>
    </section>

    <!-- Economics -->
    <section class="card" *ngIf="economics() as eco">
      <h2>כלכלה</h2>
      <p class="muted">עלות ספק, עמלת סליקה, אובדן אספקה ורצפת רווח. בלי עלות ספק אין בדיקת רווח, וההפעלה דורשת אישור מפורש.</p>
      <div class="grid">
        <label>עלות ספק למיליון (₪), ריק = לא ידוע
          <input type="number" min="0" step="1" [ngModel]="shekels(eco.supplierCostPer1MMinor)" (ngModelChange)="eco.supplierCostPer1MMinor = minorOrNull($event)" />
        </label>
        <label>עמלת סליקה (%)
          <input type="number" min="0" max="20" step="0.01" [ngModel]="eco.paymentFeeBps / 100" (ngModelChange)="eco.paymentFeeBps = bps($event)" />
        </label>
        <label>אובדן אספקה, מס המשחק (%)
          <input type="number" min="0" max="50" step="0.01" [ngModel]="eco.deliveryLossBps / 100" (ngModelChange)="eco.deliveryLossBps = bps($event)" />
        </label>
        <label>רצפת רווח תרומתי (%)
          <input type="number" min="0" max="90" step="0.5" [ngModel]="eco.minMarginBps / 100" (ngModelChange)="eco.minMarginBps = bps($event)" />
        </label>
        <label>מע"מ (%)
          <input type="number" min="0" max="50" step="0.5" [ngModel]="eco.vatBps / 100" (ngModelChange)="eco.vatBps = bps($event)" />
        </label>
      </div>
      <div class="actions">
        <button class="primary" (click)="saveEconomics()" [disabled]="busy()">שמירת כלכלה</button>
        <span class="muted" *ngIf="sourceOf('economics') as source">{{ source }}</span>
      </div>
    </section>

    <!-- Ladder -->
    <section class="card" *ngIf="ladder() as lad">
      <h2>הסולם</h2>
      <p class="muted">מחירים בשקלים, כולל מע"מ. חבילה גדולה חייבת להיות זולה יותר לקוין; השרת מסרב לסולם הפוך. מומלץ אחד לכל היותר.</p>
      <table>
        <thead>
          <tr><th>מפתח</th><th>קוינס</th><th>מחיר ₪</th><th>בונוס קוינס</th><th>דרגה</th><th>מומלץ</th><th>פעיל</th><th>₪/100K</th><th>רווח</th><th></th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let pack of lad.packages; let i = index" [ngClass]="{ warn: belowFloor().has(pack.key) }">
            <td><input [(ngModel)]="pack.key" maxlength="20" /></td>
            <td><input type="number" min="10000" step="10000" [(ngModel)]="pack.coins" /></td>
            <td><input type="number" min="1" step="1" [ngModel]="pack.priceMinor / 100" (ngModelChange)="pack.priceMinor = minor($event)" /></td>
            <td><input type="number" min="0" step="1000" [(ngModel)]="pack.bonusCoins" /></td>
            <td>
              <select [(ngModel)]="pack.tier">
                <option value="starter">Starter</option><option value="pro">Pro</option><option value="elite">Elite</option><option value="legend">Legend</option>
              </select>
            </td>
            <td><input type="checkbox" [ngModel]="pack.recommended" (ngModelChange)="recommend(lad, i, $event)" /></td>
            <td><input type="checkbox" [(ngModel)]="pack.active" /></td>
            <td class="num">{{ figuresFor(pack.key)?.per100KMinor | money }}</td>
            <td class="num">{{ marginLabel(pack.key) }}</td>
            <td><button (click)="removePackage(lad, i)">הסרה</button></td>
          </tr>
        </tbody>
      </table>
      <div class="actions">
        <button (click)="addPackage(lad)">חבילה חדשה</button>
        <label class="inline">הנחה מקסימלית (%)
          <input type="number" min="0" max="50" step="0.5" [ngModel]="lad.maxDiscountBps / 100" (ngModelChange)="lad.maxDiscountBps = bps($event)" />
        </label>
        <label class="inline">מקסימום ליחידה בהזמנה
          <input type="number" min="1" max="25" [(ngModel)]="lad.maxPerOrder" />
        </label>
        <button class="primary" (click)="saveLadder()" [disabled]="busy()">שמירת סולם</button>
        <span class="muted" *ngIf="sourceOf('ladder') as source">{{ source }}</span>
      </div>
    </section>

    <!-- Evaluation -->
    <section class="card" *ngIf="evaluation() as ev">
      <h2>הערכה מול הכלכלה</h2>
      <p class="muted" *ngIf="!ev.costKnown">עלות הספק לא ידועה: המחיר לקוין מוצג, הרווח לא. הפעלה אפשרית רק עם אישור מפורש.</p>
      <table>
        <thead><tr><th>חבילה</th><th>מקבלים</th><th>מחיר</th><th>₪/100K</th><th>חיסכון מול הקטנה</th><th>נטו ללא מע"מ</th><th>קוינס לקנייה</th><th>עלות ספק</th><th>עמלה</th><th>תרומה</th><th>רווח</th></tr></thead>
        <tbody>
          <tr *ngFor="let pack of ev.packages" [ngClass]="{ warn: ev.belowFloor.includes(pack.key) }">
            <td>{{ pack.key }}</td>
            <td class="num">{{ pack.deliveredCoins | number }}</td>
            <td class="num">{{ pack.priceMinor | money }}</td>
            <td class="num">{{ pack.per100KMinor | money }}</td>
            <td class="num">{{ pack.savingVsStarterBps / 100 | number: '1.0-1' }}%</td>
            <td class="num">{{ pack.netRevenueMinor | money }}</td>
            <td class="num">{{ pack.coinsToBuy | number }}</td>
            <td class="num">{{ pack.supplierCostMinor | money }}</td>
            <td class="num">{{ pack.paymentFeeMinor | money }}</td>
            <td class="num">{{ pack.contributionMinor | money }}</td>
            <td class="num">{{ pack.marginBps === null ? '—' : (pack.marginBps / 100 | number: '1.0-1') + '%' }}</td>
          </tr>
        </tbody>
      </table>
      <div class="gate" [ngClass]="{ allowed: ev.check.allowed }">
        <strong>שער ההפעלה:</strong>
        <span *ngIf="ev.check.allowed">מותר.</span>
        <span *ngIf="!ev.check.allowed">חסום: {{ ev.check.blockers.join('; ') }}</span>
        <span *ngIf="!ev.check.allowed && ev.checkAcknowledged.allowed" class="muted"> · ניתן להפעיל עם אישור מפורש ({{ ev.checkAcknowledged.warnings.join('; ') }})</span>
      </div>
      <label class="ack" *ngIf="!ev.costKnown">
        <input type="checkbox" [(ngModel)]="acknowledge" />
        אני מאשר/ת הפעלת מחירים ללא עלות ספק ידועה. הבדיקה מול רצפת הרווח לא תתבצע והאישור יירשם בשמי.
      </label>
    </section>

    <!-- Launch offer -->
    <section class="card" *ngIf="launch() as off">
      <h2>הטבת ההצטרפות · FIRST KICK</h2>
      <p class="muted">בונוס קוינס בהזמנה הראשונה. מצטרף להטבה אחת מהארנק, לא לקוד. תאריכים אמיתיים בלבד; בלי תאריך אין שעון.</p>
      <div class="grid">
        <label><input type="checkbox" [(ngModel)]="off.enabled" /> פעיל</label>
        <label>שם (עברית)<input [(ngModel)]="off.name.he" maxlength="200" /></label>
        <label>אחוז קוינס מתנה (%)<input type="number" min="0" max="30" step="0.5" [ngModel]="off.benefit.percentBps / 100" (ngModelChange)="off.benefit.percentBps = bps($event)" /></label>
        <label>תקרה (קוינס)<input type="number" min="1000" step="1000" [(ngModel)]="off.benefit.capCoins" /></label>
        <label>מינימום הזמנה (₪)<input type="number" min="0" step="1" [ngModel]="off.benefit.minOrderMinor / 100" (ngModelChange)="off.benefit.minOrderMinor = minor($event)" /></label>
        <label>התחלה (ISO)<input [(ngModel)]="off.startsAt" placeholder="2026-09-25T00:00:00+03:00" /></label>
        <label>סיום (ISO)<input [(ngModel)]="off.endsAt" placeholder="2026-10-31T23:59:59+03:00" /></label>
        <label>תקרת מימושים (ריק = ללא)<input type="number" min="1" [(ngModel)]="off.maxRedemptions" /></label>
      </div>
      <div class="actions">
        <button class="primary" (click)="saveLaunch()" [disabled]="busy()">שמירת ההטבה</button>
        <span class="muted" *ngIf="sourceOf('launch') as source">{{ source }}</span>
      </div>
    </section>

    <!-- Competitors -->
    <section class="card" *ngIf="competitors() as comp">
      <h2>תמונת מצב מתחרים</h2>
      <p class="muted">נבדק: {{ comp.checkedAt | date: 'dd/MM/yyyy HH:mm' }}. מידע פנימי להחלטת מחיר, לא מוצג ללקוח.</p>
      <table>
        <thead><tr><th>מוכר</th><th>כמות</th><th>מחיר ₪</th><th>₪/100K</th><th>מבצע</th><th>אפקטיבי ₪/100K</th><th>נבדק</th><th>הערות</th></tr></thead>
        <tbody>
          <tr *ngFor="let entry of comp.entries">
            <td><a [href]="entry.url" target="_blank" rel="noopener">{{ entry.seller }}</a></td>
            <td class="num">{{ entry.coins | number }}</td>
            <td class="num">{{ entry.priceMinor | money }}</td>
            <td class="num">{{ per100K(entry.priceMinor, entry.coins) | money }}</td>
            <td>{{ entry.promotion }}</td>
            <td class="num">{{ per100K(entry.effectivePriceMinor, entry.effectiveCoins) | money }}</td>
            <td>{{ entry.checkedAt | date: 'dd/MM HH:mm' }}</td>
            <td>{{ entry.notes }}</td>
          </tr>
        </tbody>
      </table>
      <details>
        <summary>עריכה כ-JSON</summary>
        <textarea rows="10" [(ngModel)]="competitorsJson"></textarea>
        <div class="actions"><button class="primary" (click)="saveCompetitors()" [disabled]="busy()">שמירת תמונת המצב</button></div>
      </details>
    </section>
  `,
  styles: [
    `
      .crumbs { margin: 0 0 0.6rem; color: var(--muted); }
      .card { padding: 1rem 1.2rem; margin-bottom: 1rem; }
      .head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
      .actions { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-top: 0.8rem; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.4rem 1rem; }
      .inline { display: inline-flex; align-items: center; gap: 0.4rem; margin: 0; }
      .inline input { width: 6rem; margin: 0; }
      td input, td select { min-width: 5rem; }
      td.num { text-align: left; direction: ltr; white-space: nowrap; }
      tr.warn td { background: rgba(248, 81, 73, 0.12); }
      .gate { margin-top: 0.8rem; padding: 0.6rem 0.8rem; border: 1px solid var(--danger); border-radius: var(--radius); }
      .gate.allowed { border-color: var(--ok); }
      .ack { display: flex; gap: 0.5rem; align-items: flex-start; margin-top: 0.8rem; color: var(--text); }
      .ack input { width: auto; margin-top: 0.25rem; }
      .error { color: var(--danger); }
      .ok { color: var(--ok); }
      details summary { cursor: pointer; color: var(--muted); margin-top: 0.6rem; }
      textarea { font-family: monospace; direction: ltr; }
    `,
  ],
})
export class PricingPage {
  private readonly api = inject(PricingApi);

  readonly storefront = signal<StorefrontState | null>(null);
  readonly economics = signal<EconomicsConfig | null>(null);
  readonly ladder = signal<LadderConfig | null>(null);
  readonly launch = signal<LaunchConfig | null>(null);
  readonly competitors = signal<CompetitorsConfig | null>(null);
  readonly evaluation = signal<LadderEvaluation | null>(null);
  readonly settings = signal<PricingSetting[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly belowFloor = computed(() => new Set(this.evaluation()?.belowFloor ?? []));

  acknowledge = false;
  competitorsJson = '';

  constructor() {
    this.load();
  }

  load(): void {
    this.error.set(null);
    this.api.settings().subscribe({
      next: (settings) => {
        this.settings.set(settings);
        for (const setting of settings) {
          const value = JSON.parse(JSON.stringify(setting.value));
          if (setting.key === 'economics') this.economics.set(value as EconomicsConfig);
          if (setting.key === 'ladder') this.ladder.set(value as LadderConfig);
          if (setting.key === 'launch') this.launch.set(value as LaunchConfig);
          if (setting.key === 'competitors') {
            this.competitors.set(value as CompetitorsConfig);
            this.competitorsJson = JSON.stringify(value, null, 2);
          }
        }
      },
      error: (error: Error) => this.error.set(error.message),
    });
    this.api.storefront().subscribe({ next: (state) => this.storefront.set(state), error: (error: Error) => this.error.set(error.message) });
    this.api.evaluation().subscribe({ next: (evaluation) => this.evaluation.set(evaluation), error: (error: Error) => this.error.set(error.message) });
  }

  sourceOf(key: PricingSetting['key']): string | null {
    const setting = this.settings().find((entry) => entry.key === key);
    if (!setting) return null;
    return setting.source === 'override'
      ? `נשמר על ידי ${setting.updatedBy ?? '—'} ב-${new Date(setting.updatedAt ?? '').toLocaleString('he-IL')}`
      : 'ברירת המחדל מהקוד';
  }

  figuresFor(key: string) {
    return this.evaluation()?.packages.find((pack) => pack.key === key);
  }

  marginLabel(key: string): string {
    const figures = this.figuresFor(key);
    if (!figures || figures.marginBps === null) return '—';
    return `${(figures.marginBps / 100).toFixed(1)}%`;
  }

  per100K(priceMinor: number, coins: number): number {
    return coins > 0 ? Math.ceil((priceMinor * 100_000) / coins) : 0;
  }

  shekels(minor: number | null): number | null {
    return minor === null ? null : minor / 100;
  }

  minor(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }

  minorOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    return this.minor(value);
  }

  bps(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }

  recommend(ladder: LadderConfig, index: number, on: boolean): void {
    ladder.packages.forEach((pack, i) => { pack.recommended = on && i === index; });
  }

  addPackage(ladder: LadderConfig): void {
    ladder.packages.push({ key: '', coins: 100_000, priceMinor: 100, bonusCoins: 0, tier: 'starter', recommended: false, active: true });
  }

  removePackage(ladder: LadderConfig, index: number): void {
    ladder.packages.splice(index, 1);
  }

  saveEconomics(): void {
    this.save('economics', this.economics(), 'הכלכלה נשמרה.');
  }

  saveLadder(): void {
    this.save('ladder', this.ladder(), 'הסולם נשמר כטיוטה.');
  }

  saveLaunch(): void {
    const launch = this.launch();
    if (!launch) return;
    this.save('launch', { ...launch, startsAt: launch.startsAt || null, endsAt: launch.endsAt || null, maxRedemptions: launch.maxRedemptions || null }, 'ההטבה נשמרה.');
  }

  saveCompetitors(): void {
    try {
      this.save('competitors', JSON.parse(this.competitorsJson), 'תמונת המצב נשמרה.');
    } catch {
      this.error.set('ה-JSON אינו תקין.');
    }
  }

  activate(): void {
    const evaluation = this.evaluation();
    if (evaluation && !evaluation.costKnown && !this.acknowledge) {
      this.error.set('עלות הספק לא ידועה. הזינו אותה תחת כלכלה, או סמנו את האישור המפורש.');
      return;
    }
    if (!confirm('להפעיל את סולם FC27? FC26 יורד מהמכירה. אפשר לחזור אחורה מאותו מסך.')) return;
    this.run(this.api.activate(this.acknowledge), (result) => `הסולם הופעל: ${result.offersWritten} הצעות נכתבו, ${result.offersRetired} הצעות FC26 הוסרו.`);
  }

  republish(): void {
    this.run(this.api.republish(), (result) => `הסולם פורסם מחדש: ${result.offersWritten} הצעות.`);
  }

  deactivate(): void {
    if (!confirm('לחזור ל-FC26? הצעות FC27 יורדות מהמכירה.')) return;
    this.run(this.api.deactivate(), (result) => `FC26 חזר למכירה: ${result.offersRestored} הצעות; ${result.offersRetired} הצעות FC27 הוסרו.`);
  }

  private save(key: PricingSetting['key'], value: unknown, done: string): void {
    if (!value) return;
    this.run(this.api.putSetting(key, value), () => done);
  }

  private run<T>(call: import('rxjs').Observable<T>, done: (result: T) => string): void {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    call.subscribe({
      next: (result) => {
        this.busy.set(false);
        this.notice.set(done(result));
        this.load();
      },
      error: (error: Error) => {
        this.busy.set(false);
        this.error.set(error.message);
      },
    });
  }
}
