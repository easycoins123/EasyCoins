import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LocalizePipe } from '../../core/i18n';
import { ToastService } from '../../core/error/toast.service';
import { IconComponent, IconName } from './icon.component';

/**
 * Toast outlet, mounted once by the app shell.
 *
 * This replaces Angular Material's snackbar. Material was pulling its whole
 * overlay and theming stack into the initial bundle for one notification widget,
 * and its visual language is the opposite of what this storefront should feel
 * like. Notifications are ours, built from the design tokens.
 */
@Component({
  selector: 'tt-toast-host',
  standalone: true,
  imports: [CommonModule, LocalizePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="host" role="status" aria-live="polite">
      <div class="toast" *ngFor="let toast of toasts()" [class]="'toast--' + toast.tone">
        <tt-icon class="glyph" [name]="glyph(toast.tone)" [size]="18"></tt-icon>
        <span class="text">{{ toast.message | t }}</span>
        <button type="button" class="close" (click)="dismiss(toast.id)" aria-label="סגירה">×</button>
      </div>
    </div>
  `,
  styles: [`
    .host {
      position: fixed;
      inset-block-end: var(--tt-space-4);
      inset-inline: var(--tt-space-4);
      z-index: 80;
      display: flex;
      flex-direction: column;
      gap: var(--tt-space-2);
      align-items: center;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      inline-size: min(100%, 460px);
      padding: var(--tt-space-3) var(--tt-space-4);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface-3);
      border: 1px solid var(--tt-border-strong);
      border-inline-start: 3px solid var(--tt-info);
      box-shadow: var(--tt-shadow-3);
      animation: toast-in var(--tt-duration) var(--tt-ease);
    }
    .toast--success { border-inline-start-color: var(--tt-success); }
    .toast--error { border-inline-start-color: var(--tt-danger); }
    .text { flex: 1; font-size: var(--tt-text-sm); }
    .close { display: grid; place-items: center; inline-size: 40px; block-size: 40px; margin: -8px; margin-inline-end: -12px; border: 0; border-radius: var(--tt-radius-sm); background: none; color: var(--tt-text-muted); font-size: 1.3rem; cursor: pointer; }
    .close:hover { color: var(--tt-text); background: rgba(255, 248, 235, 0.06); }
    @keyframes toast-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class ToastHostComponent {
  private readonly service = inject(ToastService);

  readonly toasts = this.service.toasts;

  dismiss(id: number): void {
    this.service.dismiss(id);
  }

  glyph(tone: 'info' | 'success' | 'error'): IconName {
    if (tone === 'success') {
      return 'check';
    }
    return tone === 'error' ? 'alert' : 'info';
  }
}
