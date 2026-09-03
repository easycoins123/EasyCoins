import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { SquadComponent } from '../../ui/components/world/squad.component';

/**
 * A wrong address, told in the world's own language: the keeper kept it out.
 * The way back is the one blue action; the status code sits back as a label.
 */
@Component({
  selector: 'tt-not-found-page',
  standalone: true,
  imports: [CommonModule, RouterLink, SquadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section wrap tt-page-center">
      <div class="figure" aria-hidden="true">
        <span class="figure__light"></span>
        <tt-squad pose="keeper"></tt-squad>
      </div>
      <span class="code">404 · שמרנו את השער</span>
      <h1>הדף שחיפשתם לא קיים</h1>
      <p class="tt-muted">ייתכן שהקישור ישן, או שהמוצר כבר לא בקטלוג.</p>
      <a class="tt-btn tt-btn--primary tt-btn--lg" routerLink="/store">לחנות</a>
      <a class="quiet" routerLink="/support">משהו לא עובד? כתבו לנו</a>
    </div>
  `,
  styles: [`
    .wrap { gap: var(--tt-space-3); }
    .figure { position: relative; inline-size: 150px; }
    .figure__light { position: absolute; inset-inline: -10%; inset-block-end: 6px; block-size: 40%; background: radial-gradient(50% 60% at 50% 100%, var(--tt-flood-soft), transparent 70%); }
    .figure__light::after { content: ''; position: absolute; inset-inline: 12%; inset-block-end: 0; block-size: 12px; border-radius: 50%; border: 1px solid var(--tt-pitch); }
    .figure tt-squad { position: relative; }
    /* Not blue, and not a gradient. Blue means pressable everywhere else on
       the site, and a status code is neither pressable nor the point of the
       page: the way out is. It sits back as a label above the sentence that
       actually tells the customer what happened. */
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
