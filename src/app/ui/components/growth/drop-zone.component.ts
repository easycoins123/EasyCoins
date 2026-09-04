import { ChangeDetectionStrategy, Component, Input, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { Drop } from '../../../domain';
import { IconComponent } from '../icon.component';

/**
 * The Drop Zone: live drops with their real clock, dated upcoming drops, and
 * when there is neither, "the next drop is cooking".
 *
 * A countdown is rendered only from a real `endsAt` the server sent, ticks
 * once a minute, and disappears when the drop ends. No drop is ever shown
 * ending at a time nobody set.
 */
@Component({
  selector: 'tt-drop-zone',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="zone">
      <ng-container *ngIf="drops.length > 0; else cooking">
        <article class="drop" *ngFor="let drop of drops; trackBy: trackById" [class.drop--live]="drop.status === 'active'">
          <header class="drop__head">
            <span class="drop__glyph" aria-hidden="true"><tt-icon name="bolt" [size]="20"></tt-icon></span>
            <span class="drop__eyebrow">{{ kindLabel(drop.kind) }}</span>
            <span class="status" [class.status--live]="drop.status === 'active'" [class.status--soon]="drop.status !== 'active'">
              <span class="status__dot" aria-hidden="true"></span>{{ drop.status === 'active' ? 'פעיל עכשיו' : 'מתוזמן' }}
            </span>
          </header>
          <h3>{{ drop.title.he }}</h3>
          <p class="drop__lede">{{ drop.lede.he }}</p>
          <ul class="drop__points">
            <li *ngFor="let point of drop.points"><tt-icon name="check" [size]="12"></tt-icon> {{ point.he }}</li>
            <li *ngIf="drop.reward"><tt-icon name="gift" [size]="12"></tt-icon> {{ drop.reward.title.he }}</li>
            <li *ngIf="drop.eligibility.minOrder"><tt-icon name="tag" [size]="12"></tt-icon> להזמנה מ־{{ drop.eligibility.minOrder.amountMinor / 100 | number:'1.0-0' }} ₪</li>
            <li *ngIf="drop.remaining !== undefined"><tt-icon name="package" [size]="12"></tt-icon> נותרו {{ drop.remaining }} מימושים</li>
          </ul>
          <p class="drop__clock tt-numeric" *ngIf="drop.status === 'active' && remainingOf(drop) as left"><tt-icon name="clock" [size]="13"></tt-icon> נסגר בעוד {{ left }}</p>
          <p class="drop__clock tt-numeric" *ngIf="drop.status !== 'active' && drop.startsAt"><tt-icon name="clock" [size]="13"></tt-icon> נפתח ב־{{ drop.startsAt | date:'d.M, HH:mm' }}</p>
          <a class="tt-btn tt-btn--sm" [class.tt-btn--buy]="drop.status === 'active'" [class.tt-btn--ghost]="drop.status !== 'active'" *ngIf="drop.cta as cta" [routerLink]="cta.link">{{ cta.label.he }}</a>
        </article>
      </ng-container>
      <ng-template #cooking>
        <article class="drop drop--cooking">
          <header class="drop__head">
            <span class="drop__glyph" aria-hidden="true"><tt-icon name="bolt" [size]="20"></tt-icon></span>
            <span class="drop__eyebrow">DROP ZONE</span>
            <span class="status status--soon"><span class="status__dot" aria-hidden="true"></span>בהכנה</span>
          </header>
          <h3>הדרופ הבא מתבשל</h3>
          <p class="drop__lede">דרופים הם בונוסים בקוינס לזמן קצוב: סוף שבוע, יום משחק, יום משכורת. כשייקבע מועד, השעון שיופיע כאן יהיה אמיתי. עד אז, בונוס ההשקה ו־EASYDROP פעילים על כל הזמנה.</p>
          <ul class="drop__points">
            <li><tt-icon name="check" [size]="12"></tt-icon> שעון רק כשיש מועד אמיתי</li>
            <li><tt-icon name="check" [size]="12"></tt-icon> בונוסים בקוינס, לא הנחות מזויפות</li>
            <li><tt-icon name="check" [size]="12"></tt-icon> נכנס ל־EASYCLUB אחרי התשלום</li>
          </ul>
        </article>
      </ng-template>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .zone { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--tt-space-4); }
    .drop { position: relative; display: flex; flex-direction: column; gap: var(--tt-space-2); padding: var(--tt-space-5); border-radius: var(--tt-radius-lg); border: 1px solid var(--tt-border-strong); background: radial-gradient(60% 50% at 100% 0%, var(--tt-energy-soft), transparent 70%), linear-gradient(180deg, #17161A, var(--tt-surface) 65%); overflow: hidden; }
    .drop--live { border-color: var(--tt-gold-600); }
    .drop--cooking { border-style: dashed; }
    .drop__head { display: flex; align-items: center; gap: var(--tt-space-2); }
    .drop__glyph { display: grid; place-items: center; inline-size: 40px; block-size: 40px; border-radius: var(--tt-radius-md); border: 1px solid var(--tt-gold-600); background: var(--tt-surface-2); color: var(--tt-gold-400); transform: skewX(-9deg); }
    .drop__glyph tt-icon { transform: skewX(9deg); }
    .drop__eyebrow { font-size: var(--tt-caption); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--tt-text-muted); }
    .status { display: inline-flex; align-items: center; gap: 6px; margin-inline-start: auto; padding: 3px 9px; border-radius: var(--tt-radius-pill); font-size: 10px; font-weight: 800; letter-spacing: 0.04em; border: 1px solid var(--tt-border-strong); color: var(--tt-text-muted); }
    .status__dot { inline-size: 6px; block-size: 6px; border-radius: 50%; background: currentColor; }
    .status--live { border-color: rgba(47, 211, 111, 0.4); color: var(--tt-energy); }
    .status--soon { color: var(--tt-gold-400); border-color: var(--tt-gold-600); }
    h3 { margin: var(--tt-space-1) 0 0; font-size: var(--tt-text-xl); line-height: 1.2; }
    .drop__lede { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
    .drop__points { margin: var(--tt-space-1) 0 var(--tt-space-2); padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: var(--tt-caption); font-weight: 700; }
    .drop__points li { display: flex; align-items: center; gap: 6px; }
    .drop__points tt-icon { color: var(--tt-energy); }
    .drop__clock { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 var(--tt-space-2); color: var(--tt-gold-400); font-weight: 800; font-size: var(--tt-text-sm); }
    .drop .tt-btn { align-self: flex-start; margin-block-start: auto; }
    @media (max-width: 600px) { .drop { padding: var(--tt-space-4); } }
  `],
})
export class DropZoneComponent implements OnInit, OnDestroy {
  @Input() drops: readonly Drop[] = [];

  /** Ticks once a minute so a live clock stays honest without a per-second repaint. */
  readonly now = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.timer = setInterval(() => this.now.set(Date.now()), 60_000);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  trackById(_index: number, drop: Drop): string {
    return drop.id;
  }

  kindLabel(kind: Drop['kind']): string {
    return KIND_LABELS[kind];
  }

  /** Time left on a real end date, or null when there is none. */
  remainingOf(drop: Drop): string | null {
    if (!drop.endsAt) {
      return null;
    }
    const left = Date.parse(drop.endsAt) - this.now();
    if (left <= 0) {
      return null;
    }
    const minutes = Math.floor(left / 60_000);
    const days = Math.floor(minutes / 1_440);
    const hours = Math.floor((minutes % 1_440) / 60);
    if (days > 0) {
      return `${days} ימים ו־${hours} שעות`;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} שעות`;
  }
}

const KIND_LABELS: Readonly<Record<Drop['kind'], string>> = {
  WEEKEND_DROP: 'WEEKEND DROP',
  MATCHDAY_DROP: 'MATCHDAY DROP',
  PAYDAY_DROP: 'PAYDAY DROP',
  PROMO_DROP: 'PROMO DROP',
  COMMUNITY_DROP: 'COMMUNITY DROP',
  VIP_DROP: 'VIP DROP',
};
