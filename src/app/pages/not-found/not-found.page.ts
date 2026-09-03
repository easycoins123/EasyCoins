import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { IconComponent } from '../../ui/components/icon.component';

/**
 * A wrong address. The status code sits back as a label; the way out is the
 * one blue action; the football glyph keeps it in the brand's world.
 */
@Component({
  selector: 'tt-not-found-page',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section wrap tt-page-center">
      <div class="glyph" aria-hidden="true">
        <span class="glyph__plate"></span>
        <tt-icon name="football" [size]="30"></tt-icon>
      </div>
      <span class="code">404 · מחוץ למגרש</span>
      <h1>הדף שחיפשתם לא קיים</h1>
      <p class="tt-muted">ייתכן שהקישור ישן, או שהמוצר כבר לא בקטלוג.</p>
      <a class="tt-btn tt-btn--primary tt-btn--lg" routerLink="/store">לחבילות</a>
      <a class="quiet" routerLink="/support">משהו לא עובד? כתבו לנו</a>
    </div>
  `,
  styles: [`
    .wrap { gap: var(--tt-space-3); }
    .glyph { position: relative; display: grid; place-items: center; inline-size: 72px; block-size: 64px; margin-block-end: var(--tt-space-2); color: var(--tt-gold-400); }
    .glyph__plate { position: absolute; inset: 0; transform: skewX(-9deg); border-radius: var(--tt-radius-md); background: var(--tt-surface-2); border: 1px solid var(--tt-gold-600); }
    .glyph tt-icon { position: relative; }
    /* Not blue, and not a gradient. Blue means pressable everywhere else on
       the site, and a status code is neither pressable nor the point of the
       page: the way out is. */
    .code {
      font-family: var(--tt-font-numeric);
      font-variant-numeric: tabular-nums;
      font-size: var(--tt-text-lg);
      font-weight: 800;
      line-height: 1;
      letter-spacing: var(--tt-tracking-eyebrow);
      color: var(--tt-text-faint);
    }
    h1 { margin: 0; font-size: var(--tt-display-3); }
    .quiet {
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 4px;
      text-decoration-color: var(--tt-border-strong);
    }
    .wrap .tt-btn { margin-block-start: var(--tt-space-2); }
  `],
})
export class NotFoundPage {}
