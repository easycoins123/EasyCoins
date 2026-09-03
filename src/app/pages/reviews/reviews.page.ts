import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { map } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { ReviewApiService } from '../../data/api';
import { ReviewCardComponent, StarRatingComponent } from '../../ui';

/** All published reviews, with the aggregate rating that produced the stars. */
@Component({
  selector: 'tt-reviews-page',
  standalone: true,
  imports: [CommonModule, ReviewCardComponent, StarRatingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <header class="tt-head tt-head--tight">
        <span class="tt-eyebrow">לקוחות</span>
        <h1>ביקורות</h1>
      </header>

      <div class="tt-panel head" *ngIf="summary$ | async as summary">
        <span class="score">{{ summary.average }}</span>
        <div>
          <tt-star-rating [rating]="summary.average" [count]="summary.count"></tt-star-rating>
          <p class="tt-faint">כל הביקורות מגיעות מהזמנות שסופקו בפועל.</p>
        </div>
      </div>

      <div class="tt-section__head"><h2>כל הביקורות</h2></div>
      <div class="tt-grid">
        <tt-review-card *ngFor="let review of reviews$ | async" [review]="review"></tt-review-card>
      </div>
    </div>
  `,
  styles: [`
    h1 { margin-block: var(--tt-space-1) var(--tt-space-4); }
    .head { display: flex; align-items: center; gap: var(--tt-space-4); margin-block-end: var(--tt-space-5); }
    .score { font-size: var(--tt-text-3xl); font-weight: 800; }
    .head p { margin: 0; }
    h2 { font-size: var(--tt-text-lg); }
  `],
})
export class ReviewsPage {
  private readonly api = inject(ReviewApiService);
  private readonly analytics = inject(AnalyticsService);

  readonly reviews$ = this.api.getReviews({ page: 1, pageSize: 24 }).pipe(map((page) => page.items));
  readonly summary$ = this.api.getSummary();

  constructor() {
    this.analytics.pageView('/reviews', 'Reviews');
  }
}
