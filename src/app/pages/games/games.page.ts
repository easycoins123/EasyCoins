import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { map } from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { CatalogFacade } from '../../state';
import { GameCardComponent } from '../../ui';

/**
 * Game directory, scoped to what this storefront actually sells.
 *
 * The catalog behind it still describes several games, and the page used to
 * render all of them: a wall of publisher-branded cards for Fortnite, Call of
 * Duty and PlayStation, none of which a customer can buy here. That is a
 * storefront advertising an inventory it does not have, and setting publisher
 * names in their own house colours reads as an affiliation nobody granted.
 *
 * The page is no longer linked from the navigation. It stays routable so no
 * existing link breaks, and it lists the focus game only. When the shop takes
 * on a second game, widening the filter in `STOREFRONT` brings this back on its
 * own.
 */
@Component({
  selector: 'tt-games-page',
  standalone: true,
  imports: [CommonModule, GameCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <header class="tt-head tt-head--tight">
        <span class="tt-eyebrow">קטלוג</span>
        <h1>מה אנחנו מוכרים</h1>
        <p class="tt-head__lede">כרגע EASYCOINS מתמקדת ב{{ focusGameName }} בלבד.</p>
      </header>

      <div class="tt-grid">
        <tt-game-card *ngFor="let game of games$ | async" [game]="game"></tt-game-card>
      </div>
    </div>
  `,
  styles: [`
    h1 { margin-block: var(--tt-space-1) var(--tt-space-2); }
    .tt-grid { margin-block-start: var(--tt-space-5); }
  `],
})
export class GamesPage {
  private readonly catalog = inject(CatalogFacade);
  private readonly analytics = inject(AnalyticsService);

  readonly focusGameName = STOREFRONT.focusGameName;

  readonly games$ = this.catalog.games$.pipe(
    map((games) => games.filter((game) => game.slug === STOREFRONT.focusGameSlug)),
  );

  constructor() {
    this.analytics.pageView('/games', 'Games');
  }
}
