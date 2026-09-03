import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, effect, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthFacade } from '../../state/customer.facade';
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
 * The account slot has three states and one size. Until the session check has
 * answered it is a blank of the same width, so the bar never shows "sign in"
 * and then swaps it for a name a moment later. Signed out it is a sign-in
 * link; signed in it is the customer's initials and a small menu.
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
          <ng-container [ngSwitch]="auth.status()">
            <span *ngSwitchCase="'checking'" class="pending" aria-hidden="true"></span>

            <a *ngSwitchCase="'anonymous'"
               class="signin"
               routerLink="/account"
               routerLinkActive="active"
               aria-label="כניסה לחשבון">
              <tt-icon name="user" [size]="18"></tt-icon>
              <span class="signin__label">כניסה</span>
            </a>

            <div *ngSwitchCase="'authenticated'" class="user">
              <button #userButton
                      type="button"
                      class="user__button"
                      (click)="toggleUserMenu()"
                      [attr.aria-expanded]="userMenuOpen()"
                      aria-haspopup="menu"
                      aria-controls="tt-user-menu"
                      [attr.aria-label]="'החשבון של ' + auth.displayName()">
                <span class="avatar" aria-hidden="true">{{ auth.initials() }}</span>
                <span class="user__name">{{ auth.firstName() }}</span>
                <tt-icon class="user__caret" name="chevron" [size]="13"></tt-icon>
              </button>

              <div id="tt-user-menu" class="menu" role="menu" *ngIf="userMenuOpen()">
                <p class="menu__who">
                  <strong>{{ auth.displayName() }}</strong>
                  <span>{{ auth.customer()?.email }}</span>
                </p>
                <a role="menuitem" routerLink="/account" (click)="closeUserMenu()">
                  <tt-icon name="user" [size]="16"></tt-icon> החשבון שלי
                </a>
                <a role="menuitem" routerLink="/account/orders" (click)="closeUserMenu()">
                  <tt-icon name="clock" [size]="16"></tt-icon> ההזמנות שלי
                </a>
                <a role="menuitem" routerLink="/account/security" (click)="closeUserMenu()">
                  <tt-icon name="lock" [size]="16"></tt-icon> אבטחת החשבון
                </a>
                <button role="menuitem" type="button" class="menu__out" (click)="signOut()">
                  <tt-icon name="logout" [size]="16"></tt-icon> התנתקות
                </button>
              </div>
            </div>
          </ng-container>

          <a class="action action--cart"
             routerLink="/cart"
             routerLinkActive="active"
             [attr.aria-label]="'עגלת קניות, ' + count() + ' פריטים'">
            <tt-icon name="cart"></tt-icon>
            <span class="count" [class.tt-pop]="pop()" *ngIf="count() > 0" aria-hidden="true">{{ count() }}</span>
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
    .bar--scrolled {
      background: var(--tt-glass);
      backdrop-filter: blur(16px) saturate(1.2);
      -webkit-backdrop-filter: blur(16px) saturate(1.2);
      border-block-end-color: var(--tt-glass-border);
      box-shadow: var(--tt-glass-highlight), 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    .inner { display: flex; align-items: center; gap: var(--tt-space-5); min-block-size: var(--tt-header-height); }
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
      transition: color var(--tt-duration-fast) var(--tt-ease), background-color var(--tt-duration-fast) var(--tt-ease);
    }
    .action:hover, .action.active { color: var(--tt-text); background: var(--tt-surface-2); text-decoration: none; }
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

    /* --- The account slot --------------------------------------------------- */
    .pending { display: block; inline-size: 42px; block-size: 42px; }
    .signin {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-block-size: 40px;
      padding-inline: var(--tt-space-3);
      border: 1px solid var(--tt-border-strong);
      border-radius: var(--tt-radius-md);
      color: var(--tt-text);
      font-size: var(--tt-text-sm);
      font-weight: 600;
      white-space: nowrap;
      transition: background-color var(--tt-duration-fast) var(--tt-ease);
    }
    .signin:hover, .signin.active { background: var(--tt-surface-2); text-decoration: none; }

    .user { position: relative; }
    .user__button {
      display: inline-flex;
      align-items: center;
      gap: var(--tt-space-2);
      min-block-size: 40px;
      padding: 2px var(--tt-space-2) 2px 2px;
      padding-inline-start: 2px;
      padding-inline-end: var(--tt-space-2);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-pill);
      background: var(--tt-surface);
      color: var(--tt-text);
      font: inherit;
      font-size: var(--tt-text-sm);
      font-weight: 600;
      cursor: pointer;
    }
    .user__button:hover, .user__button[aria-expanded='true'] { border-color: var(--tt-border-strong); background: var(--tt-surface-2); }
    .avatar {
      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      border-radius: 50%;
      background: linear-gradient(160deg, var(--tt-brand-400), var(--tt-brand-700));
      color: var(--tt-text-on-brand);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    .user__name { max-inline-size: 9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .user__caret { color: var(--tt-text-faint); transform: rotate(90deg); }

    .menu {
      position: absolute;
      inset-block-start: calc(100% + 8px);
      inset-inline-end: 0;
      z-index: var(--tt-z-overlay);
      min-inline-size: 240px;
      padding: var(--tt-space-2);
      border: 1px solid var(--tt-border-strong);
      border-radius: var(--tt-radius-lg);
      background: var(--tt-bg-elevated);
      box-shadow: var(--tt-shadow-3);
      animation: tt-rise var(--tt-duration) var(--tt-ease-out) both;
    }
    .menu__who { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: var(--tt-space-2) var(--tt-space-3) var(--tt-space-3); border-block-end: 1px solid var(--tt-border); }
    .menu__who strong { font-size: var(--tt-text-sm); }
    .menu__who span { font-size: var(--tt-text-xs); color: var(--tt-text-faint); overflow: hidden; text-overflow: ellipsis; }
    .menu a, .menu__out {
      display: flex;
      align-items: center;
      gap: var(--tt-space-2);
      inline-size: 100%;
      min-block-size: 40px;
      padding-inline: var(--tt-space-3);
      border: 0;
      border-radius: var(--tt-radius-md);
      background: transparent;
      color: var(--tt-text);
      font: inherit;
      font-size: var(--tt-text-sm);
      font-weight: 600;
      text-align: start;
      cursor: pointer;
    }
    .menu a:hover, .menu__out:hover { background: var(--tt-surface-2); text-decoration: none; }
    .menu a tt-icon, .menu__out tt-icon { color: var(--tt-text-muted); }
    .menu__out { margin-block-start: var(--tt-space-1); border-block-start: 1px solid var(--tt-border); border-radius: 0 0 var(--tt-radius-md) var(--tt-radius-md); }

    .buy-cta { min-block-size: 40px; padding-inline: var(--tt-space-4); margin-inline-start: var(--tt-space-2); font-size: var(--tt-text-sm); white-space: nowrap; }
    .buy-cta__short { display: none; }
    .toggle { display: none; }

    @media (max-width: 1000px) {
      .nav { display: none; }
      .toggle { display: grid; }
      .inner { gap: var(--tt-space-3); }
      .search { max-inline-size: 320px; }
      .buy-cta { margin-inline-start: 0; padding-inline: var(--tt-space-3); }
      .buy-cta__full { display: none; }
      .buy-cta__short { display: inline; }
      .user__name, .user__caret { display: none; }
      .user__button { padding-inline-end: 2px; }
    }
    /* On a phone sign-in lives in the drawer; a signed-in customer still gets
       their avatar in the bar, which is the one thing that says "it's you". */
    @media (max-width: 560px) {
      .search { display: none; }
      .actions { margin-inline-start: auto; }
      .signin, .pending { display: none; }
    }
    @media (max-width: 360px) { .buy-cta { display: none; } }
  `],
})
export class AppHeaderComponent {
  private readonly cart = inject(CartFacade);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly auth = inject(AuthFacade);

  @ViewChild('toggle') private readonly toggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('userButton') private readonly userButton?: ElementRef<HTMLButtonElement>;

  readonly menuOpen = signal(false);
  readonly userMenuOpen = signal(false);
  readonly scrolled = signal(false);
  readonly count = this.cart.itemCount;

  /** True for a beat whenever the cart grows, so the badge visibly receives it. */
  readonly pop = signal(false);
  private lastCount = this.cart.itemCount();

  constructor() {
    effect(() => {
      const next = this.count();
      if (next > this.lastCount) {
        this.pop.set(false);
        setTimeout(() => this.pop.set(true));
        setTimeout(() => this.pop.set(false), 500);
      }
      this.lastCount = next;
    }, { allowSignalWrites: true });
  }

  /**
   * Whether the drawer exists at all. Above the breakpoint the bar holds the
   * navigation, so the panel is simply not rendered.
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
    this.toggle?.nativeElement.focus();
  }

  toggleMenu(): void {
    const next = !this.menuOpen();
    this.menuOpen.set(next);
    this.lockScroll(next);
  }

  toggleUserMenu(): void {
    this.userMenuOpen.set(!this.userMenuOpen());
  }

  closeUserMenu(restoreFocus = false): void {
    if (!this.userMenuOpen()) {
      return;
    }
    this.userMenuOpen.set(false);
    if (restoreFocus) {
      this.userButton?.nativeElement.focus();
    }
  }

  /**
   * Signs out from the bar.
   *
   * The state flips at once, the server is told, and a page that only a
   * signed-in customer may see is left for the home page.
   */
  signOut(): void {
    this.closeUserMenu();
    const leaving = this.router.url.startsWith('/account/security');
    this.auth.logout().subscribe();
    if (leaving) {
      void this.router.navigateByUrl('/');
    }
  }

  private lockScroll(locked: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.style.overflow = locked ? 'hidden' : '';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenu();
    this.closeUserMenu(true);
  }

  /** A click anywhere outside the account menu closes it, as a menu should. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.userMenuOpen()) {
      return;
    }
    const user = this.host.nativeElement.querySelector('.user');
    if (user && !user.contains(event.target as Node)) {
      this.closeUserMenu();
    }
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
    this.scrolled.set(window.scrollY > 8);
  }
}
