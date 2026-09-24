import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { IconComponent, IconName } from '../icon.component';

/** One way into the store. `soon` is shown, never sold. */
export interface StoreLane {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly icon: IconName;
  /** A same-page anchor (`#custom`) or a route. */
  readonly href: string;
  readonly state: 'live' | 'soon';
}

/**
 * The store's lanes: coins, custom coins, the player goal, the drop zone,
 * EASYCLUB, and any service the catalog can actually deliver.
 *
 * A strip, not a nav. Each lane is a real destination with a real state, and
 * anything the operation cannot fulfil is not a lane at all.
 */
@Component({
  selector: 'tt-store-lanes',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="lanes" aria-label="מה קונים ב־EASYCOINS">
      <ng-container *ngFor="let lane of lanes">
        <a class="lane" *ngIf="lane.href.startsWith('#'); else routed" [href]="lane.href" [class.lane--soon]="lane.state === 'soon'" (click)="scrollTo($event, lane.href)">
          <ng-container *ngTemplateOutlet="body; context: { lane: lane }"></ng-container>
        </a>
        <ng-template #routed>
          <a class="lane" [routerLink]="lane.href" [class.lane--soon]="lane.state === 'soon'">
            <ng-container *ngTemplateOutlet="body; context: { lane: lane }"></ng-container>
          </a>
        </ng-template>
      </ng-container>
    </nav>
    <ng-template #body let-lane="lane">
      <span class="lane__glyph" aria-hidden="true"><tt-icon [name]="lane.icon" [size]="18"></tt-icon></span>
      <span class="lane__text"><strong>{{ lane.label }}</strong><span>{{ lane.note }}</span></span>
      <span class="lane__state" *ngIf="lane.state === 'soon'">בקרוב</span>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }
    .lanes { display: flex; gap: var(--tt-space-2); overflow-x: auto; padding-block: 2px var(--tt-space-1); scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    .lanes::-webkit-scrollbar { display: none; }
    .lane { display: flex; align-items: center; gap: var(--tt-space-2); flex: 0 0 auto; min-block-size: 56px; padding: var(--tt-space-2) var(--tt-space-3); border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); background: var(--tt-surface); color: inherit; text-decoration: none; transition: border-color var(--tt-duration-fast) var(--tt-ease), transform var(--tt-duration-fast) var(--tt-ease); }
    .lane:hover { border-color: var(--tt-gold-600); text-decoration: none; transform: translateY(-1px); }
    .lane--soon { opacity: 0.7; }
    .lane__glyph { display: grid; place-items: center; inline-size: 34px; block-size: 34px; border-radius: var(--tt-radius-sm); border: 1px solid var(--tt-gold-600); background: var(--tt-surface-2); color: var(--tt-gold-400); transform: skewX(-9deg); flex: none; }
    .lane__glyph tt-icon { transform: skewX(9deg); }
    .lane__text { display: flex; flex-direction: column; gap: 1px; white-space: nowrap; }
    .lane__text strong { font-size: var(--tt-text-sm); }
    .lane__text span { font-size: 11px; color: var(--tt-text-muted); }
    .lane__state { padding: 2px 8px; border-radius: var(--tt-radius-pill); border: 1px solid var(--tt-gold-600); color: var(--tt-gold-400); font-size: 10px; font-weight: 800; }
  `],
})
export class StoreLanesComponent {
  @Input() lanes: readonly StoreLane[] = [];

  /** Smooth-scrolls to an in-page lane without leaving the route. */
  scrollTo(event: Event, href: string): void {
    const target = document.getElementById(href.slice(1));
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
