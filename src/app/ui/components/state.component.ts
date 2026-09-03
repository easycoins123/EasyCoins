import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { IconComponent, IconName } from './icon.component';
import { SquadComponent, SquadPose } from './world/squad.component';

import { AppError } from '../../domain';

/**
 * The three states every asynchronous surface needs, as components rather than
 * as `*ngIf` blocks copy-pasted into each page.
 *
 * Loading is a skeleton shaped like the content it replaces, not a spinner that
 * blanks the page — the layout stays still while data arrives.
 */

@Component({
  selector: 'tt-skeleton-grid',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-grid" aria-hidden="true">
      <div class="card" *ngFor="let placeholder of placeholders">
        <div class="tt-skeleton media"></div>
        <div class="tt-skeleton line line--lg"></div>
        <div class="tt-skeleton line"></div>
        <div class="tt-skeleton line line--sm"></div>
      </div>
    </div>
  `,
  styles: [`
    /* Height is matched to tt-product-card so replacing the skeleton with real
       content shifts nothing. Keep the two in step if either changes. */
    .card {
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-lg);
      padding: var(--tt-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-3);
      block-size: 358px;
    }
    .media { block-size: 148px; flex: none; }
    .line { block-size: 12px; flex: none; }
    .line--lg { block-size: 22px; inline-size: 70%; }
    .line--sm { inline-size: 40%; margin-block-start: auto; }
  `],
})
export class SkeletonGridComponent {
  @Input() count = 6;

  get placeholders(): readonly number[] {
    return Array.from({ length: this.count }, (_, index) => index);
  }
}

@Component({
  selector: 'tt-empty-state',
  standalone: true,
  imports: [CommonModule, IconComponent, SquadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <!-- One of the squad where the page has a story to tell; otherwise the
           glyph plate, cut on the same nine degrees as the brand mark, so a
           dead end still looks like it belongs to this shop. -->
      <div class="figure" *ngIf="pose; else glyph" aria-hidden="true">
        <span class="figure__light"></span>
        <tt-squad [pose]="pose"></tt-squad>
      </div>
      <ng-template #glyph>
        <div class="glyph" aria-hidden="true">
          <span class="glyph__plate"></span>
          <tt-icon [name]="icon" [size]="24"></tt-icon>
        </div>
      </ng-template>
      <h2>{{ title }}</h2>
      <p class="tt-muted">{{ message }}</p>
      <button type="button" class="tt-btn tt-btn--primary" *ngIf="actionLabel" (click)="action.emit()">
        {{ actionLabel }}
      </button>
    </div>
  `,
  styles: [`
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--tt-space-2);
      /* Was space-7 top and bottom. An empty state is a message, not a room. */
      padding: var(--tt-space-6) var(--tt-space-4);
    }
    .glyph {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 58px;
      block-size: 52px;
      margin-block-end: var(--tt-space-3);
      color: var(--tt-brand-300);
    }
    .glyph__plate {
      position: absolute;
      inset: 0;
      transform: skewX(-9deg);
      border-radius: var(--tt-radius-sm);
      background: var(--tt-surface-2);
      border: 1px solid var(--tt-border-strong);
      box-shadow: inset 0 1px 0 rgba(255, 248, 235, 0.06);
    }
    .glyph tt-icon { position: relative; }
    .figure { position: relative; inline-size: 120px; margin-block-end: var(--tt-space-2); }
    .figure__light { position: absolute; inset-inline: 0; inset-block-end: 4px; block-size: 40%; background: radial-gradient(50% 60% at 50% 100%, var(--tt-flood-soft), transparent 70%); }
    .figure__light::after { content: ''; position: absolute; inset-inline: 14%; inset-block-end: 0; block-size: 10px; border-radius: 50%; border: 1px solid var(--tt-pitch); }
    .figure tt-squad { position: relative; }
    h2 { font-size: var(--tt-text-lg); margin: 0; }
    p { max-inline-size: 40ch; font-size: var(--tt-text-sm); }
    .wrap .tt-btn { margin-block-start: var(--tt-space-3); }
  `],
})
export class EmptyStateComponent {
  @Input() icon: IconName = 'search';
  /** One of the squad instead of the glyph, when the empty state has a story. */
  @Input() pose?: SquadPose;
  @Input() title = '';
  @Input() message = '';
  @Input() actionLabel?: string;
  @Output() readonly action = new EventEmitter<void>();
}

/**
 * Error surface. It renders `AppError.userMessage` only — the technical message
 * stays in the console where it belongs.
 */
@Component({
  selector: 'tt-error-state',
  standalone: true,
  imports: [CommonModule, IconComponent, SquadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap" role="alert">
      <!-- The keeper: something got through, and the way back is the action. -->
      <div class="figure" aria-hidden="true"><tt-squad pose="keeper"></tt-squad></div>
      <div class="glyph" aria-hidden="true"><tt-icon name="alert" [size]="24"></tt-icon></div>
      <h2>{{ title }}</h2>
      <p class="tt-muted">{{ message }}</p>
      <button type="button" class="tt-btn tt-btn--primary" *ngIf="error?.retryable !== false" (click)="retry.emit()">
        נסו שוב
      </button>
    </div>
  `,
  styles: [`
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--tt-space-2);
      padding: var(--tt-space-7) var(--tt-space-4);
    }
    .figure { inline-size: 110px; margin-block-end: calc(var(--tt-space-3) * -1); }
    .glyph {
      display: grid;
      place-items: center;
      inline-size: 44px;
      block-size: 44px;
      border-radius: var(--tt-radius-lg);
      background: var(--tt-danger-tint);
      color: var(--tt-danger);
    }
    h2 { font-size: var(--tt-text-xl); }
    p { max-inline-size: 44ch; }
  `],
})
export class ErrorStateComponent {
  @Input() error?: AppError;
  @Input() title = 'משהו השתבש';
  @Input() fallbackMessage = 'לא הצלחנו לטעון את התוכן. אפשר לנסות שוב.';
  @Output() readonly retry = new EventEmitter<void>();

  get message(): string {
    return this.error?.userMessage.he ?? this.fallbackMessage;
  }
}
