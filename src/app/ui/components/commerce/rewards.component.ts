import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { CampaignView } from '../../../core/commerce';
import { IconComponent } from '../icon.component';

/**
 * Reasons to come back: the drop, the opening squad, friend brings friend.
 *
 * Three panels driven by the campaigns facade, so each shows its real state.
 * A drop with a real end time gets its clock; a campaign in preparation says
 * so; nothing here counts participants or announces winners, because there
 * are none to announce yet.
 */
@Component({
  selector: 'tt-rewards',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rewards" *ngIf="panels.length > 0">
      <article class="panel" *ngFor="let campaign of panels" [class.panel--live]="campaign.status === 'active'" [class.panel--lead]="campaign.kind === 'weekend-drop'">
        <header class="panel__head">
          <span class="panel__glyph" aria-hidden="true"><tt-icon [name]="campaign.icon" [size]="20"></tt-icon></span>
          <span class="panel__eyebrow">{{ campaign.eyebrow }}</span>
          <span class="status" [class.status--live]="campaign.status === 'active'" [class.status--soon]="campaign.status !== 'active'">
            <span class="status__dot" aria-hidden="true"></span>{{ campaign.statusLabel }}
          </span>
        </header>
        <h3>{{ campaign.title }}</h3>
        <p class="panel__lede">{{ campaign.lede }}</p>
        <ul class="panel__points">
          <li *ngFor="let point of campaign.points"><tt-icon name="check" [size]="12"></tt-icon> {{ point }}</li>
        </ul>
        <a class="tt-btn tt-btn--sm" [class.tt-btn--buy]="campaign.status === 'active'" [class.tt-btn--ghost]="campaign.status !== 'active'"
           *ngIf="campaign.cta as cta" [routerLink]="cta.link">{{ cta.label }}</a>
      </article>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .rewards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--tt-space-4); }
    .panel { position: relative; display: flex; flex-direction: column; gap: var(--tt-space-2); padding: var(--tt-space-5); border-radius: var(--tt-radius-lg); border: 1px solid var(--tt-border-strong); background: linear-gradient(180deg, #17161A, var(--tt-surface) 65%); overflow: hidden; }
    .panel--lead { background: radial-gradient(60% 50% at 100% 0%, var(--tt-energy-soft), transparent 70%), linear-gradient(180deg, #17161A, var(--tt-surface) 65%); }
    .panel--live { border-color: var(--tt-gold-600); }
    .panel__head { display: flex; align-items: center; gap: var(--tt-space-2); }
    .panel__glyph { display: grid; place-items: center; inline-size: 40px; block-size: 40px; border-radius: var(--tt-radius-md); border: 1px solid var(--tt-gold-600); background: var(--tt-surface-2); color: var(--tt-gold-400); transform: skewX(-9deg); }
    .panel__glyph tt-icon { transform: skewX(9deg); }
    .panel__eyebrow { font-size: var(--tt-caption); font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--tt-text-muted); }
    .status { display: inline-flex; align-items: center; gap: 6px; margin-inline-start: auto; padding: 3px 9px; border-radius: var(--tt-radius-pill); font-size: 10px; font-weight: 800; letter-spacing: 0.04em; border: 1px solid var(--tt-border-strong); color: var(--tt-text-muted); }
    .status__dot { inline-size: 6px; block-size: 6px; border-radius: 50%; background: currentColor; }
    .status--live { border-color: rgba(47, 211, 111, 0.4); color: var(--tt-energy); }
    .status--soon { color: var(--tt-gold-400); border-color: var(--tt-gold-600); }
    h3 { margin: var(--tt-space-1) 0 0; font-size: var(--tt-text-xl); line-height: 1.2; }
    .panel__lede { margin: 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); line-height: var(--tt-leading); }
    .panel__points { margin: var(--tt-space-1) 0 var(--tt-space-2); padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text); }
    .panel__points li { display: flex; align-items: center; gap: 6px; }
    .panel__points tt-icon { color: var(--tt-energy); }
    .panel .tt-btn { align-self: flex-start; margin-block-start: auto; }
    @media (max-width: 900px) { .rewards { grid-template-columns: 1fr; } .panel { padding: var(--tt-space-4); } }
  `],
})
export class RewardsComponent {
  panels: readonly CampaignView[] = [];

  /** The drop, the opening squad and referral, in that order, when present. */
  @Input() set campaigns(list: readonly CampaignView[] | null | undefined) {
    const order: CampaignView['kind'][] = ['weekend-drop', 'first-buyers', 'referral'];
    this.panels = order
      .map((kind) => (list ?? []).find((campaign) => campaign.kind === kind))
      .filter((campaign): campaign is CampaignView => campaign !== undefined);
  }
}
