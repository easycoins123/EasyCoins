import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { CartFacade } from '../../state/cart.facade';
import { BrandLogoComponent } from './brand-logo.component';
import { IconComponent } from './icon.component';
import { MobileNavComponent } from './mobile-nav.component';
import { SearchBoxComponent } from './search-box.component';

/**
 * The site header.
 *
 * Desktop and mobile are two different pieces of furniture rather than one
 * layout squeezed. On desktop the brand leads, navigation runs beside it, the
 * search sits in the middle and the actions end on the one gold thing in the
 * bar: where to buy. On mobile the bar keeps brand, cart and the buy action
 * within thumb reach and everything else moves into the drawer.
 *
 * The bar changes on scroll: transparent over the hero, then a solid ground with
 * a hairline once the page moves. One small piece of state, and it is what stops
 * the header feeling glued on top of the page.
 */
@Component({
  selector: 'tt-app-header',
  standalone: true,
  imports: [
    CommonModule, RouterLink, RouterLinkActive,
    BrandLogoComponent, IconComponent, SearchBoxComponent, MobileNavComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bar" [class.bar--scrolled]="scrolled()">
      <div class="tt-container inner">
        <a class="brand" routerLink="/" aria-label="EASYCOINS, לדף הבית">
          <tt-brand-logo [markSize]="28"></tt-brand-logo>
        </a>

        <nav class="nav" aria-label="ראשי">
          <a routerLink="/store" routerLinkActive="active" ariaCurrentWhenActive="page">חנות הקוינס</a>
          <a routerLink="/deals" routerLinkActive="active" ariaCurrentWhenActive="page">מבצעים</a>
          <a routerLink="/delivery" routerLinkActive="active" ariaCurrentWhenActive="page">איך זה עובד</a>
          <a routerLink="/support" routerLinkActive="active" ariaCurrentWhenActive="page">תמיכה</a>
        </nav>

        <tt-search-box class="search"></tt-search-box>

        <div class="actions">
          <a class="action action--account" routerLink="/account" routerLinkActive="active" aria-label="האזור האישי">
            <tt-icon name="user"></tt-icon>
          </a>

          <a class="action action--cart"
             routerLink="/cart"
             routerLinkActive="active"
             [attr.aria-label]="'עגלת קניות, ' + count() + ' פריטים'">
            <tt-icon name="cart"></tt-icon>
            <span class="count" *ngIf="count() > 0" aria-hidden="true">{{ count() }}</span>
          </a>

          <!-- The one gold thing in the bar. A shop's header should say where
               to buy, and nothing else here competes for that. -->
          <a class="tt-btn tt-btn--buy buy-cta" routerLink="/store">
            <tt-icon name="coin" [size]="16"></tt-icon>
            <span class="buy-cta__full">קניית קוינס</span>
            <span class="buy-cta__short">קנייה</span>
          </a>

          <button #toggle
                  type="button"
                  class="action toggle"
                  (click)="toggleMenu()"
                  [attr.aria-expanded]="menuOpen()"
                  aria-controls="tt-mobile-nav"
                  aria-label="תפריט">
            <tt-icon [name]="menuOpen() ? 'close' : 'menu'"></tt-icon>
          </button>
        </div>
      </div>
    </header>

    <!-- Mobile furniture only. Above the breakpoint the bar already holds the
         navigation, so the drawer is simply not rendered: a hidden copy of
         every link is still a copy a screen reader has to walk past. -->
    <tt-mobile-nav *ngIf="isMobile()"
                   [open]="menuOpen()"
                   [count]="count()"
                   (close)="closeMenu()">
    </tt-mobile-nav>
  `,
  styles: [`
    .bar {
      position: sticky;
      inset-block-start: 0;
      z-index: var(--tt-z-header);
      background: transparent;
      border-block-end: 1px solid transparent;
      transition: background-color var(--tt-duration) var(--tt-ease),
                  border-color var(--tt-duration) var(--tt-ease);
    }
    /* Only once the page has moved. Over the hero the bar stays out of the way. */
    .bar--scrolled {
      background: color-mix(in srgb, var(--tt-bg) 88%, transparent);
      backdrop-filter: blur(14px);
      border-block-end-color: var(--tt-border);
    }

    .inner {
      display: flex;
      align-items: center;
      gap: var(--tt-space-5);
      min-block-size: var(--tt-header-height);
    }

    .brand { display: inline-flex; flex: none; }
    .brand:hover { text-decoration: none; }

    .nav { display: flex; gap: var(--tt-space-4); }
    .nav a {
      position: relative;
      display: inline-flex;
      align-items: center;
      min-block-size: 40px;
      padding-inline: var(--tt-space-1);
      color: var(--tt-text-muted);
      font-weight: 600;
      font-size: var(--tt-text-sm);
      white-space: nowrap;
      transition: color var(--tt-duration-fast) var(--tt-ease);
    }
    .nav a:hover { color: var(--tt-text); text-decoration: none; }
    .nav a.active { color: var(--tt-text); }
    /* Marks the active item without shifting the row. */
    .nav a.active::after {
      content: '';
      position: absolute;
      inset-inline: var(--tt-space-1);
      inset-block-end: 4px;
      block-size: 2px;
      border-radius: 2px;
      background: var(--tt-gold-500);
    }

    .search { flex: 1; max-inline-size: 300px; margin-inline-start: auto; }
    .actions { display: flex; align-items: center; gap: var(--tt-space-1); }

    .action {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 42px;
      block-size: 42px;
      border-radius: var(--tt-radius-md);
      background: transparent;
      border: 1px solid transparent;
      color: var(--tt-text-muted);
      cursor: pointer;
      transition: color var(--tt-duration-fast) var(--tt-ease),
                  background-color var(--tt-duration-fast) var(--tt-ease);
    }
    .action:hover, .action.active {
      color: var(--tt-text);
      background: var(--tt-surface-2);
      text-decoration: none;
    }

    .count {
      position: absolute;
      inset-block-start: 3px;
      inset-inline-end: 3px;
      min-inline-size: 17px;
      padding-inline: 4px;
      border-radius: var(--tt-radius-pill);
      background: var(--tt-gold-500);
      color: var(--tt-text-on-gold);
      font-size: 11px;
      font-weight: 800;
      line-height: 17px;
      text-align: center;
    }

    .buy-cta {
      min-block-size: 40px;
      padding-inline: var(--tt-space-4);
      margin-inline-start: var(--tt-space-2);
      font-size: var(--tt-text-sm);
      white-space: nowrap;
    }
    .buy-cta__short { display: none; }

    .toggle { display: none; }

    /* Below the desktop breakpoint the navigation moves into the drawer and the
       bar keeps brand, search, cart and a compact buy action. */
    @media (max-width: 1000px) {
      .nav { display: none; }
      .toggle { display: grid; }
      .inner { gap: var(--tt-space-3); }
      .search { max-inline-size: 320px; }
      .buy-cta { margin-inline-start: 0; padding-inline: var(--tt-space-3); }
      .buy-cta__full { display: none; }
      .buy-cta__short { display: inline; }
    }

    /* On a phone the search input costs more room than it earns, so it moves
       to the store page and the bar keeps brand and actions. The account
       lives in the drawer at this width. */
    @media (max-width: 560px) {
      .search { display: none; }
      .actions { margin-inline-start: auto; }
      .action--account { display: none; }
    }
    @media (max-width: 360px) {
      .buy-cta { display: none; }
    }
  `],
})
export class AppHeaderComponent {
  private readonly cart = inject(CartFacade);

  @ViewChild('toggle') private readonly toggle?: ElementRef<HTMLButtonElement>;

  readonly menuOpen = signal(false);
  readonly scrolled = signal(false);
  readonly count = this.cart.itemCount;

  /**
   * Whether the drawer exists at all.
   *
   * Hiding it with CSS was not enough: the panel stayed in the document, so
   * every desktop page carried a second, invisible copy of the whole navigation.
   * Above the breakpoint the bar holds the navigation, so the panel is simply
   * not rendered.
   */
  readonly isMobile = signal(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1000px)').matches,
  );

  closeMenu(): void {
    if (!this.menuOpen()) {
      return;
    }
    this.menuOpen.set(false);
    this.lockScroll(false);
    // Focus goes back to the control that opened the dialog, as a dialog should.
    this.toggle?.nativeElement.focus();
  }

  toggleMenu(): void {
    const next = !this.menuOpen();
    this.menuOpen.set(next);
    this.lockScroll(next);
  }

  /**
   * Stops the page behind the drawer from scrolling.
   *
   * Without it a swipe over the backdrop scrolls the store underneath, so the
   * customer closes the menu and finds themselves somewhere else on the page.
   */
  private lockScroll(locked: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.style.overflow = locked ? 'hidden' : '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
  }

  @HostListener('window:resize')
  onResize(): void {
    const mobile = window.matchMedia('(max-width: 1000px)').matches;
    this.isMobile.set(mobile);
    if (!mobile && this.menuOpen()) {
      this.menuOpen.set(false);
      this.lockScroll(false);
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    // A small threshold rather than zero, so a one-pixel trackpad bounce does
    // not flicker the bar.
    this.scrolled.set(window.scrollY > 8);
  }
}
