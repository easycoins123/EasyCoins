import { ChangeDetectionStrategy, Component, HostBinding, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { ReviewApiService } from '../../data/api';
import { Review } from '../../domain';
import { IconComponent } from './icon.component';

interface ReviewsView {
  readonly reviews: readonly Review[];
  readonly average: number;
  readonly count: number;
}

/**
 * "What people say", with one rule: only reviews from verified purchases.
 *
 * The component reads the review API and keeps the reviews that a real order
 * backs. If there are none yet, it says so, in the same dark elevated cards
 * it will use for the real ones, rather than inventing a score or a name.
 * Development seed reviews are not verified purchases and therefore never
 * appear here.
 */
@Component({
  selector: 'tt-reviews-section',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="view$ | async as view">
      <ul class="cards" *ngIf="view.count > 0; else waiting">
        <li class="review" *ngFor="let review of view.reviews">
          <div class="review__head">
            <span class="review__avatar" aria-hidden="true">{{ initials(review.authorDisplayName) }}</span>
            <span class="review__who">
              <strong>{{ review.authorDisplayName }}</strong>
              <span class="stars" [attr.aria-label]="review.rating + ' מתוך 5'">
                <tt-icon *ngFor="let star of stars(review.rating)" name="star" [size]="14" [class.stars__off]="!star"></tt-icon>
              </span>
            </span>
            <span class="review__verified"><tt-icon name="check" [size]="12"></tt-icon> רכישה מאומתת</span>
          </div>
          <p class="review__body">{{ review.body }}</p>
        </li>
      </ul>
      <p class="summary" *ngIf="view.count > 0">
        <tt-icon name="star" [size]="16"></tt-icon>
        <strong>{{ view.average | number:'1.1-1' }}</strong> מתוך 5 · {{ view.count }} ביקורות של לקוחות מאומתים
      </p>
    </ng-container>

    <ng-template #waiting>
      <div class="waiting">
        <span class="waiting__glyph" aria-hidden="true"><tt-icon name="star" [size]="22"></tt-icon></span>
        <h3>ביקורות של לקוחות מאומתים יופיעו כאן</h3>
        <p>אנחנו מציגים רק ביקורות של לקוחות שביצעו הזמנה. לא ציונים מומצאים, לא שמות מומצאים.</p>
        <a class="tt-btn tt-btn--ghost" routerLink="/store">לחבילות</a>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }
    .cards { display: grid; gap: var(--tt-space-4); grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; padding: 0; list-style: none; }
    .review { display: flex; flex-direction: column; gap: var(--tt-space-3); padding: var(--tt-space-5); border: 1px solid var(--tt-border-strong); border-radius: var(--tt-radius-lg);
      background: linear-gradient(180deg, #17161A, var(--tt-surface) 60%); }
    .review__head { display: flex; align-items: center; gap: var(--tt-space-3); flex-wrap: wrap; }
    .review__avatar { display: grid; place-items: center; inline-size: 40px; block-size: 40px; border-radius: 50%; background: var(--tt-surface-3); border: 1px solid var(--tt-gold-600); color: var(--tt-gold-400); font-weight: 900; font-size: var(--tt-text-sm); }
    .review__who { display: flex; flex-direction: column; gap: 2px; }
    .stars { display: inline-flex; gap: 2px; color: var(--tt-gold-400); }
    .stars__off { color: var(--tt-surface-3); }
    .review__verified { display: inline-flex; align-items: center; gap: 4px; margin-inline-start: auto; font-size: var(--tt-caption); font-weight: 700; color: var(--tt-energy); }
    .review__body { margin: 0; color: var(--tt-text-muted); line-height: var(--tt-leading); }
    .summary { display: flex; align-items: center; justify-content: center; gap: 6px; margin: var(--tt-space-5) 0 0; color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .summary tt-icon { color: var(--tt-gold-400); }

    .waiting { display: flex; flex-direction: column; align-items: center; gap: var(--tt-space-2); max-inline-size: 640px; margin-inline: auto; padding: var(--tt-space-5) var(--tt-space-4); border: 1px solid var(--tt-border-strong); border-radius: var(--tt-radius-lg); text-align: center;
      background: linear-gradient(180deg, #17161A, var(--tt-surface) 60%); }
    .waiting__glyph { display: grid; place-items: center; inline-size: 52px; block-size: 52px; border-radius: var(--tt-radius-md); background: var(--tt-surface-2); border: 1px solid var(--tt-gold-600); color: var(--tt-gold-400); transform: skewX(-9deg); }
    .waiting__glyph tt-icon { transform: skewX(9deg); }
    .waiting h3 { margin: var(--tt-space-2) 0 0; font-size: var(--tt-title); }
    .waiting p { margin: 0; max-inline-size: 46ch; color: var(--tt-text-muted); font-size: var(--tt-text-sm); }
    .waiting .tt-btn { margin-block-start: var(--tt-space-2); }

    @media (max-width: 900px) { .cards { grid-template-columns: 1fr; } }
  `],
})
export class ReviewsSectionComponent {
  private readonly api = inject(ReviewApiService);

  /** True once the data answered with no verified review; the host section hides itself. */
  readonly empty = signal(false);
  @HostBinding('class.empty') get isEmpty(): boolean {
    return this.empty();
  }

  readonly view$: Observable<ReviewsView> = this.api.getReviews({ page: 1, pageSize: 12 }).pipe(
    map((page) => {
      const verified = page.items.filter((review) => review.verifiedPurchase);
      const count = verified.length;
      const average = count === 0 ? 0 : verified.reduce((sum, review) => sum + review.rating, 0) / count;
      return { reviews: verified.slice(0, 3), average, count };
    }),
    catchError(() => of({ reviews: [], average: 0, count: 0 })),
    tap((view) => this.empty.set(view.count === 0)),
  );

  stars(rating: number): readonly boolean[] {
    return [1, 2, 3, 4, 5].map((star) => star <= rating);
  }

  initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('');
  }
}
