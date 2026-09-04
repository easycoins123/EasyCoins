import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/analytics';
import { NotificationService } from '../../core/error';
import { ClubSummary, localized } from '../../domain';
import { AuthFacade } from '../../state/customer.facade';
import { GrowthFacade } from '../../state/growth.facade';
import { MoneyPipe } from '../../ui/money.pipe';
import { ClubProgressComponent } from '../../ui/components/growth/club-progress.component';
import { RewardCardComponent } from '../../ui/components/growth/reward-card.component';
import { IconComponent } from '../../ui/components/icon.component';

/**
 * EASYCLUB: the customer's standing, in their own numbers.
 *
 * Tier and points from paid orders, the rewards they hold and spent, their
 * streak, their founders' seat, their referral link. Every figure is the
 * server's summary; the page lays it out and links each thing to where it is
 * used. Nothing here can be earned by looking at it.
 */
@Component({
  selector: 'tt-club-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MoneyPipe, IconComponent, ClubProgressComponent, RewardCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section club">
      <ng-container *ngIf="club$ | async as club; else loading">
        <header class="tt-head tt-head--tight">
          <span class="tt-eyebrow">EASYCLUB · {{ auth.firstName() }}</span>
          <h1>המועדון שלכם</h1>
          <p class="tt-head__lede">נקודות על כל שקל ששולם, דרגות שנפתחות, וההטבות שהרווחתם במקום אחד. הכול מחושב מההזמנות שלכם, לא מובטח מראש.</p>
        </header>

        <div class="grid">
          <section class="tt-card tt-card--pad span">
            <tt-club-progress [club]="club"></tt-club-progress>
            <ul class="perks">
              <li *ngFor="let perk of club.perks"><tt-icon name="check" [size]="12"></tt-icon> {{ perk.he }}</li>
            </ul>
          </section>

          <section class="tt-card tt-card--pad">
            <h2><tt-icon name="gift" [size]="18"></tt-icon> ההטבות שלי</h2>
            <ng-container *ngIf="club.rewards.available.length > 0; else noRewards">
              <ul class="rewards">
                <li *ngFor="let reward of club.rewards.available; trackBy: trackById"><tt-reward-card [reward]="reward"></tt-reward-card></li>
              </ul>
              <p class="tt-faint small">הטבה להזמנה הבאה נבחרת בעגלה. הטבה אחת מהסוג הזה להזמנה; היא מצטרפת לבונוס ההשקה, לא לקופון.</p>
              <a class="tt-btn tt-btn--buy tt-btn--sm" routerLink="/store"><tt-icon name="coin" [size]="14"></tt-icon> לחנות</a>
            </ng-container>
            <ng-template #noRewards>
              <p class="tt-muted small">{{ club.orders.count === 0 ? 'ההזמנה הראשונה ששולמה פותחת EASYDROP: קלף אחד מתוך שלושה, ומאחורי כל אחד הטבה אמיתית.' : 'אין הטבות זמינות כרגע. ה־EASYDROP הבא נפתח אחרי ההזמנה הבאה ששולמה.' }}</p>
              <a class="tt-btn tt-btn--buy tt-btn--sm" routerLink="/store"><tt-icon name="coin" [size]="14"></tt-icon> לחבילות</a>
            </ng-template>
            <details class="history" *ngIf="club.rewards.history.length > 0">
              <summary>היסטוריית הטבות ({{ club.rewards.history.length }})</summary>
              <ul class="rewards">
                <li *ngFor="let reward of club.rewards.history; trackBy: trackById"><tt-reward-card [reward]="reward" [compact]="true"></tt-reward-card></li>
              </ul>
            </details>
          </section>

          <section class="tt-card tt-card--pad">
            <h2><tt-icon name="bolt" [size]="18"></tt-icon> רצף הזמנות</h2>
            <ng-container *ngIf="club.streak.enabled; else streakOff">
              <p class="big"><span class="tt-figure">{{ club.streak.count }}</span><span class="tt-muted small"> הזמנות ברצף</span></p>
              <p class="tt-muted small" *ngIf="club.streak.count === 0">הזמנה ששולמה מתחילה רצף. הזמנה נוספת בתוך {{ club.streak.windowDays }} יום ממשיכה אותו.</p>
              <p class="tt-muted small" *ngIf="club.streak.count > 0 && club.streak.activeUntil">הרצף נשמר עד {{ club.streak.activeUntil | date:'d.M.yyyy' }}. בלי לחץ: זה חלון של {{ club.streak.windowDays }} יום.</p>
              <p class="tt-muted small" *ngIf="club.streak.nextRewardAt && club.streak.nextRewardTitle">הזמנה מספר {{ club.streak.nextRewardAt }} ברצף: {{ club.streak.nextRewardTitle.he }}.</p>
            </ng-container>
            <ng-template #streakOff><p class="tt-muted small">תוכנית הרצף אינה פעילה כרגע.</p></ng-template>
          </section>

          <section class="tt-card tt-card--pad" *ngIf="club.founders.enabled">
            <h2><tt-icon name="star" [size]="18"></tt-icon> {{ club.founders.name.he }}</h2>
            <ng-container *ngIf="club.founders.seatNumber; else notSeated">
              <p class="big"><span class="tt-figure">#{{ club.founders.seatNumber }}</span><span class="tt-muted small"> מתוך {{ club.founders.cap }}</span></p>
              <p class="tt-muted small">אתם בין {{ club.founders.cap }} הלקוחות הראשונים של EasyCoins. הסימון קבוע.<ng-container *ngIf="club.founders.reward"> {{ club.founders.reward.he }} כבר בחשבון.</ng-container></p>
            </ng-container>
            <ng-template #notSeated>
              <p class="tt-muted small" *ngIf="club.founders.remaining > 0">{{ club.founders.taken }} מתוך {{ club.founders.cap }} המקומות נתפסו. הזמנה ראשונה ששולמה מהחשבון הזה תופסת מקום.</p>
              <p class="tt-muted small" *ngIf="club.founders.remaining === 0">כל {{ club.founders.cap }} המקומות נתפסו.</p>
            </ng-template>
          </section>

          <section class="tt-card tt-card--pad">
            <h2><tt-icon name="package" [size]="18"></tt-icon> ההזמנות</h2>
            <p class="big"><span class="tt-figure">{{ club.orders.count }}</span><span class="tt-muted small"> הזמנות ששולמו · {{ club.orders.lifetime | money }}</span></p>
            <a class="tt-btn tt-btn--ghost tt-btn--sm" routerLink="/account/orders">לכל ההזמנות</a>
          </section>

          <section class="tt-card tt-card--pad span referral" *ngIf="club.referral.enabled">
            <header class="referral__head">
              <span class="referral__glyph" aria-hidden="true"><tt-icon name="market" [size]="20"></tt-icon></span>
              <div><p class="tt-eyebrow">חבר מביא חבר</p><h2 class="referral__title">חבר מקבל {{ club.referral.friendReward.he }}. אתם מקבלים {{ club.referral.referrerReward.he }}.</h2></div>
            </header>
            <div class="code">
              <span class="code__label tt-faint">הקישור שלכם</span>
              <span class="code__value tt-numeric" dir="ltr">{{ linkFor(club) }}</span>
              <button type="button" class="tt-btn tt-btn--ghost tt-btn--sm" (click)="copy(club)"><tt-icon name="copy" [size]="14"></tt-icon> {{ copied() ? 'הועתק' : 'העתקה' }}</button>
              <button type="button" class="tt-btn tt-btn--buy tt-btn--sm" *ngIf="canShare" (click)="share(club)">שיתוף</button>
            </div>
            <ol class="steps">
              <li><span class="steps__n">1</span><span>שולחים את הקישור. חבר שנכנס דרכו מקושר לחשבון שלכם ל־30 יום.</span></li>
              <li><span class="steps__n">2</span><span>ההזמנה הראשונה שלו שולמה: הוא מקבל {{ club.referral.friendReward.he }}.</span></li>
              <li><span class="steps__n">3</span><span>באותו רגע נרשם לכם {{ club.referral.referrerReward.he }}. לא על עצמכם, לא פעמיים על אותו חבר, עד {{ club.referral.monthlyCap }} בחודש.</span></li>
            </ol>
            <p class="stats tt-faint" *ngIf="club.referral.stats.rewarded + club.referral.stats.pending > 0">{{ club.referral.stats.rewarded }} חברים הזמינו · {{ club.referral.stats.pending }} ממתינים להזמנה ראשונה</p>
          </section>
        </div>
      </ng-container>
      <ng-template #loading>
        <div class="tt-stack" aria-busy="true">
          <span class="tt-skeleton sk-title"></span>
          <span class="tt-skeleton sk-card"></span>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .club { max-inline-size: 960px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--tt-space-4); }
    .span { grid-column: 1 / -1; }
    section h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 var(--tt-space-3); font-size: var(--tt-text-lg); }
    section h2 tt-icon { color: var(--tt-gold-400); }
    .perks { margin: var(--tt-space-4) 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: var(--tt-space-2) var(--tt-space-4); font-size: var(--tt-text-sm); font-weight: 600; }
    .perks li { display: inline-flex; align-items: center; gap: 6px; }
    .perks tt-icon { color: var(--tt-energy); }
    .rewards { margin: 0 0 var(--tt-space-3); padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--tt-space-2); }
    .small { font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
    .big { margin: 0 0 var(--tt-space-2); display: flex; align-items: baseline; gap: 6px; }
    .big .tt-figure { font-size: 2rem; color: var(--tt-gold-400); }
    .history { margin-block-start: var(--tt-space-3); }
    .history summary { cursor: pointer; font-size: var(--tt-text-sm); font-weight: 700; color: var(--tt-text-muted); margin-block-end: var(--tt-space-2); }
    .referral { border-color: var(--tt-gold-600); background: linear-gradient(135deg, rgba(212, 180, 106, 0.1), transparent 55%), var(--tt-surface); }
    .referral__head { display: flex; align-items: flex-start; gap: var(--tt-space-3); margin-block-end: var(--tt-space-3); }
    .referral__title { margin: 2px 0 0; font-size: var(--tt-text-lg); line-height: var(--tt-leading-snug); }
    .referral__glyph { display: grid; place-items: center; flex: none; inline-size: 44px; block-size: 44px; border-radius: var(--tt-radius-md); border: 1px solid var(--tt-gold-600); background: var(--tt-surface-2); color: var(--tt-gold-400); transform: skewX(-9deg); }
    .referral__glyph tt-icon { transform: skewX(9deg); }
    .code { display: flex; flex-wrap: wrap; align-items: center; gap: var(--tt-space-2); padding: var(--tt-space-3); border: 1px dashed var(--tt-gold-600); border-radius: var(--tt-radius-md); background: var(--tt-surface-2); }
    .code__label { inline-size: 100%; font-size: var(--tt-caption); }
    .code__value { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; color: var(--tt-gold-400); font-size: var(--tt-text-sm); }
    .steps { margin: var(--tt-space-3) 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--tt-space-2); font-size: var(--tt-text-sm); }
    .steps li { display: flex; align-items: flex-start; gap: var(--tt-space-2); }
    .steps__n { display: grid; place-items: center; inline-size: 24px; block-size: 24px; flex: none; border-radius: 50%; background: var(--tt-gold-metal); color: var(--tt-text-on-gold); font-size: 12px; font-weight: 900; }
    .stats { margin: var(--tt-space-3) 0 0; font-size: var(--tt-caption); }
    .sk-title { display: block; block-size: 28px; inline-size: 40%; }
    .sk-card { display: block; block-size: 320px; border-radius: var(--tt-radius-lg); }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class ClubPage {
  readonly auth = inject(AuthFacade);
  private readonly growth = inject(GrowthFacade);
  private readonly notifications = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);

  readonly club$ = this.growth.club$;
  readonly copied = signal(false);
  readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  constructor() {
    this.analytics.pageView('/account/club', 'EasyClub');
    this.growth.refreshClub();
  }

  trackById(_index: number, reward: { id: string }): string {
    return reward.id;
  }

  linkFor(club: ClubSummary): string {
    const path = club.referral.path ?? '';
    return typeof location !== 'undefined' ? `${location.origin}${path}` : path;
  }

  copy(club: ClubSummary): void {
    const link = this.linkFor(club);
    const done = () => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    };
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(link).then(done, () => this.notifications.info(localized(`הקישור: ${link}`, `Your link: ${link}`)));
    } else {
      this.notifications.info(localized(`הקישור: ${link}`, `Your link: ${link}`));
    }
  }

  share(club: ClubSummary): void {
    const link = this.linkFor(club);
    void navigator.share({
      title: 'EasyCoins',
      text: `קוינס ל־FC במחיר ישראלי. דרך הקישור שלי מקבלים ${club.referral.friendReward.he} אחרי ההזמנה הראשונה.`,
      url: link,
    }).catch(() => undefined);
  }
}
