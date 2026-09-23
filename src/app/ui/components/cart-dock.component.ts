import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs/operators';

import { itemsLabel } from '../../core/value';
import { CartFacade } from '../../state/cart.facade';
import { IconComponent } from './icon.component';
import { MoneyPipe } from '../money.pipe';

/** Routes where the dock would sit on top of the very thing it points to. */
const HIDDEN_ON = [/^\/cart(\/|$|\?)/, /^\/checkout(\/|$|\?)/, /^\/order\//, /^\/account\/order\//, /^\/products\//];

/**
 * The next step, kept on screen.
 *
 * After "add to cart" a customer used to get a four-second toast and a small
 * number on the cart icon, and then nothing: the way to pay was off-screen.
 * The dock stays at the foot of the page while the cart has something in it
 * and says what is in it, what it costs and where to go next. It disappears
 * on the cart and checkout themselves, and on a product page, where the buy
 * bar already owns the bottom edge.
 */
@Component({
  selector: 'tt-cart-dock',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dock tt-glass" *ngIf="visible()" role="region" aria-label="העגלה שלכם">
      <a class="summary" routerLink="/cart" aria-label="לעגלה">
        <span class="summary__icon" aria-hidden="true">
          <tt-icon name="cart" [size]="18"></tt-icon>
          <span class="summary__count">{{ cart.itemCount() }}</span>
        </span>
        <span class="summary__text">
          <strong>{{ label() }} בעגלה</strong>
          <span class="tt-numeric">{{ cart.totals().total | money }}</span>
        </span>
      </a>
      <a class="tt-btn tt-btn--buy go" routerLink="/checkout">לתשלום <tt-icon name="chevron" [size]="14" dir="auto"></tt-icon></a>
    </div>
  `,
  styles: [`
    .dock {
      position: fixed;
      inset-inline: var(--tt-space-3);
      inset-block-end: var(--tt-space-3);
      z-index: var(--tt-z-sticky);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--tt-space-3);
      max-inline-size: 560px;
      margin-inline: auto;
      padding: var(--tt-space-2) var(--tt-space-2) var(--tt-space-2) var(--tt-space-3);
      padding-inline-start: var(--tt-space-3);
      padding-inline-end: var(--tt-space-2);
      border-radius: var(--tt-radius-lg);
      border: 1px solid var(--tt-gold-600);
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.55);
      animation: dock-in var(--tt-duration) var(--tt-ease-out);
    }
    .summary { display: flex; align-items: center; gap: var(--tt-space-3); min-inline-size: 0; min-block-size: 44px; color: inherit; }
    .summary:hover { text-decoration: none; }
    .summary__icon { position: relative; display: grid; place-items: center; inline-size: 40px; block-size: 40px; border-radius: var(--tt-radius-md); background: var(--tt-surface-3); color: var(--tt-gold-400); }
    .summary__count { position: absolute; inset-block-start: -5px; inset-inline-end: -5px; min-inline-size: 18px; padding-inline: 4px; border-radius: var(--tt-radius-pill); background: var(--tt-gold-500); color: var(--tt-text-on-gold); font-size: 11px; font-weight: 800; line-height: 18px; text-align: center; }
    .summary__text { display: flex; flex-direction: column; line-height: 1.2; }
    .summary__text strong { font-size: var(--tt-text-sm); }
    .summary__text span { font-size: var(--tt-text-sm); font-weight: 800; color: var(--tt-gold-400); }
    .go { min-block-size: 44px; white-space: nowrap; }
    @keyframes dock-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .dock { animation: none; } }
  `],
})
export class CartDockComponent {
  readonly cart = inject(CartFacade);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  private readonly url = signal(this.router.url);

  readonly visible = computed(() => !this.cart.isEmpty() && !HIDDEN_ON.some((route) => route.test(this.url())));
  readonly label = computed(() => itemsLabel(this.cart.itemCount()));

  constructor() {
    const subscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.url.set(event.urlAfterRedirects));
    this.destroyRef.onDestroy(() => subscription.unsubscribe());

    // The page keeps room at the bottom so the dock never covers the footer's
    // last line or a form's submit button.
    effect(() => {
      document.body.classList.toggle('has-dock', this.visible());
    });
  }
}
