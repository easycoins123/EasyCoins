import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/analytics';
import { SupportApiService } from '../../data/api';
import { FaqAccordionComponent } from '../../ui';

/** The full FAQ. Content comes from the support API, not from the template. */
@Component({
  selector: 'tt-faq-page',
  standalone: true,
  imports: [CommonModule, RouterLink, FaqAccordionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section narrow">
      <header class="tt-head tt-head--tight">
        <span class="tt-eyebrow">מידע</span>
        <h1>שאלות נפוצות</h1>
        <p class="tt-head__lede">לא מצאתם תשובה? <a routerLink="/support">כתבו לנו</a>.</p>
      </header>

      <tt-faq-accordion [entries]="(faq$ | async) ?? []"></tt-faq-accordion>
    </div>
  `,
  styles: [`
    .narrow { max-inline-size: 760px; }
    h1 { margin-block: var(--tt-space-1) var(--tt-space-2); }
    tt-faq-accordion { display: block; margin-block-start: var(--tt-space-5); }
  `],
})
export class FaqPage {
  private readonly api = inject(SupportApiService);
  private readonly analytics = inject(AnalyticsService);

  readonly faq$ = this.api.getFaq();

  constructor() {
    this.analytics.pageView('/faq', 'FAQ');
  }
}
