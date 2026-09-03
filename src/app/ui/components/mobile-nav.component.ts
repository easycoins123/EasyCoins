import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnChanges, Output,
  SimpleChanges, ViewChild, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, filter, map, shareReplay, startWith, switchMap, take } from 'rxjs/operators';

import { STOREFRONT } from '../../core/brand';
import { formatQuantity, rankByValue } from '../../core/value';
import { ProductDetail } from '../../domain';
import { CatalogFacade } from '../../state/catalog.facade';
import { AuthFacade } from '../../state/customer.facade';
import { TIERS, tierForAmount } from './cards/tiers';
import { BrandLogoComponent } from './brand-logo.component';
import { IconComponent, IconName } from './icon.component';

interface MenuItem {
  readonly route: string;
  readonly icon: IconName;
  readonly label: string;
  /** Match the route exactly, so `/account` does not light up under `/account/orders`. */
  readonly exact?: boolean;
  /** Shown to signed-in customers only. */
  readonly signedIn?: boolean;
}

interface MenuGroup {
  readonly title: string;
  readonly items: readonly MenuItem[];
}

/** One coin tier, resolved from the catalog for the quick-buy strip. */
interface QuickTier {
  readonly slug: string;
  readonly variantId: string;
  readonly quantity: string;
  readonly price: string;
  readonly best: boolean;
  readonly amount: number;
}

/**
 * The mobile navigation drawer.
 *
 * On a phone this is the whole site's navigation, so it carries the whole site
 * and nothing more: who is signed in, the five things the shop sells, the pages
 * a customer goes to, and one gold action. Rows are compact and grouped under
 * quiet labels.
 *
 * It is a dialog in every sense a keyboard cares about: focus moves into it
 * when it opens, Tab cycles inside it, Escape closes it, and the header puts
 * focus back on the button that opened it. Closed, it is inert and off-screen.
 *
 * The tier strip is real data. It loads the first time the drawer opens, never
 * with the page, and is absent rather than faked if the catalog has not
 * answered.
 */
@Component({
  selector: 'tt-mobile-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, BrandLogoComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" [class.scrim--on]="open" (click)="close.emit()" aria-hidden="true"></div>

    <nav #panel
         id="tt-mobile-nav"
         class="drawer"
         [class.open]="open"
         role="dialog"
         aria-modal="true"
         aria-label="תפריט"
         [attr.inert]="open ? null : ''"
         [attr.aria-hidden]="open ? null : 'true'"
         (keydown)="onKeydown($event)">

      <div class="head">
        <tt-brand-logo [markSize]="26"></tt-brand-logo>
        <button #closeButton type="button" class="head__close" (click)="close.emit()" aria-label="סגירת התפריט">
          <tt-icon name="close" [size]="18"></tt-icon>
        </button>
      </div>

      <div class="scroll">
        <!-- Who is here. Blank while the session is being checked, so the
             drawer never opens on "sign in" and then swaps to a name. -->
        <section class="who" [ngSwitch]="auth.status()">
          <div *ngSwitchCase="'checking'" class="who__pending" aria-hidden="true"><span></span><span></span></div>
          <div *ngSwitchCase="'anonymous'" class="who__out">
            <a class="tt-btn tt-btn--primary" routerLink="/account" (click)="close.emit()">כניסה</a>
            <a class="tt-btn tt-btn--ghost" routerLink="/account" [queryParams]="{ mode: 'register' }" (click)="close.emit()">הרשמה</a>
          </div>
          <a *ngSwitchCase="'authenticated'" class="who__in" routerLink="/account" (click)="close.emit()">
            <span class="avatar" aria-hidden="true">{{ auth.initials() }}</span>
            <span class="who__text">
              <strong>{{ auth.displayName() }}</strong>
              <span>{{ auth.customer()?.email }}</span>
            </span>
            <tt-icon name="chevron" [size]="14" dir="auto"></tt-icon>
          </a>
        </section>

        <!-- Quick buy: every tier, its real price, one tap to the product. -->
        <section class="quick" *ngIf="tiers$ | async as tiers">
          <p class="quick__title">
            <tt-icon name="coin" [size]="14"></tt-icon>
            <span>קוינס ל־{{ gameName }}</span>
          </p>
          <ul class="quick__list">
            <li *ngFor="let tier of tiers; let i = index">
              <a [routerLink]="['/products', tier.slug, tier.variantId]"
                 [class.best]="tier.best"
                 [style.--mat]="tierColor(tier.amount)"
                 (click)="close.emit()">
                <span class="quick__qty tt-numeric">{{ tier.quantity }}</span>
                <span class="quick__price tt-numeric">{{ tier.price }}</span>
              </a>
            </li>
          </ul>
        </section>

        <ng-container *ngFor="let group of groups">
          <p class="group">{{ group.title }}</p>
          <ul class="nav">
            <ng-container *ngFor="let item of group.items">
              <li *ngIf="!item.signedIn || auth.isAuthenticated()">
                <a [routerLink]="item.route"
                   routerLinkActive="active"
                   ariaCurrentWhenActive="page"
                   [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
                   (click)="close.emit()">
                  <span class="glyph"><tt-icon [name]="item.icon" [size]="18"></tt-icon></span>
                  <span class="label">{{ item.label }}</span>
                  <tt-icon class="go" name="chevron" [size]="14" dir="auto"></tt-icon>
                </a>
              </li>
            </ng-container>
            <li *ngIf="group.title === 'החשבון שלי' && auth.isAuthenticated()">
              <button type="button" class="signout" (click)="signOut()">
                <span class="glyph"><tt-icon name="logout" [size]="18"></tt-icon></span>
                <span class="label">התנתקות</span>
              </button>
            </li>
          </ul>
        </ng-container>
      </div>

      <div class="foot">
        <a class="tt-btn tt-btn--buy tt-btn--lg tt-btn--block" routerLink="/store" (click)="close.emit()">
          <tt-icon name="coin" [size]="18"></tt-icon>
          קניית קוינס
        </a>
        <div class="foot__row">
          <a class="foot__link" routerLink="/cart" (click)="close.emit()">
            <tt-icon name="cart" [size]="17"></tt-icon>
            <span>העגלה</span>
            <span class="foot__count" *ngIf="count > 0">{{ count }}</span>
          </a>
          <a class="foot__link" routerLink="/support" (click)="close.emit()">
            <tt-icon name="support" [size]="17"></tt-icon>
            <span>תמיכה</span>
          </a>
        </div>
        <p class="assure">
          <tt-icon name="lock" [size]="13"></tt-icon>
          תשלום מאובטח דרך ספק סליקה · תמיכה בעברית
        </p>
      </div>
    </nav>
  `,
  styles: [`
    :host { display: contents; }

    .scrim {
      position: fixed;
      inset: 0;
      z-index: var(--tt-z-drawer);
      background: var(--tt-overlay);
      backdrop-filter: blur(3px);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--tt-duration) var(--tt-ease);
    }
    .scrim--on { opacity: 1; pointer-events: auto; }

    .drawer {
      position: fixed;
      inset-block: 0;
      inset-inline-end: 0;
      z-index: calc(var(--tt-z-drawer) + 1);
      inline-size: min(86vw, 340px);
      display: flex;
      flex-direction: column;
      background: radial-gradient(90% 36% at 100% 0%, var(--tt-brand-tint), transparent 70%), var(--tt-bg-elevated);
      border-inline-start: 1px solid var(--tt-border-strong);
      box-shadow: var(--tt-shadow-3);
      transform: translateX(100%);
      transition: transform var(--tt-duration-slow) var(--tt-ease-out);
    }
    :host-context([dir='rtl']) .drawer { transform: translateX(-100%); }
    .drawer.open,
    :host-context([dir='rtl']) .drawer.open { transform: translateX(0); }

    .scroll > * { opacity: 0; transform: translateY(6px); }
    .drawer.open .scroll > * {
      opacity: 1;
      transform: none;
      transition: opacity var(--tt-duration) var(--tt-ease), transform var(--tt-duration) var(--tt-ease-out);
    }
    .drawer.open .scroll > :nth-child(1) { transition-delay: 50ms; }
    .drawer.open .scroll > :nth-child(2) { transition-delay: 90ms; }
    .drawer.open .scroll > :nth-child(n+3) { transition-delay: 130ms; }
    @media (prefers-reduced-motion: reduce) {
      .drawer, .scrim, .drawer.open .scroll > * { transition: none; }
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--tt-space-3);
      padding: var(--tt-space-3) var(--tt-space-4);
      min-block-size: var(--tt-header-height);
      border-block-end: 1px solid var(--tt-border);
    }
    .head__close {
      display: grid;
      place-items: center;
      inline-size: 40px;
      block-size: 40px;
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface);
      color: var(--tt-text-muted);
      cursor: pointer;
    }
    .scroll { flex: 1; overflow-y: auto; padding: var(--tt-space-3) var(--tt-space-3) var(--tt-space-4); overscroll-behavior: contain; }

    /* --- Who --------------------------------------------------------------- */
    .who { margin-block-end: var(--tt-space-3); }
    .who__pending { display: flex; align-items: center; gap: var(--tt-space-3); min-block-size: 52px; padding-inline: var(--tt-space-2); }
    .who__pending span:first-child { inline-size: 36px; block-size: 36px; border-radius: 50%; background: var(--tt-surface-2); }
    .who__pending span:last-child { flex: 1; block-size: 12px; border-radius: 6px; background: var(--tt-surface-2); }
    .who__out { display: grid; grid-template-columns: 1fr 1fr; gap: var(--tt-space-2); }
    .who__out .tt-btn { min-block-size: 44px; }
    .who__in {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      min-block-size: 56px;
      padding: var(--tt-space-2);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-md);
      background: var(--tt-surface);
      color: var(--tt-text);
      text-decoration: none;
    }
    .avatar {
      display: grid;
      place-items: center;
      inline-size: 36px;
      block-size: 36px;
      flex: none;
      border-radius: 50%;
      background: linear-gradient(160deg, var(--tt-brand-400), var(--tt-brand-700));
      color: var(--tt-text-on-brand);
      font-size: 13px;
      font-weight: 800;
    }
    .who__text { display: flex; flex-direction: column; flex: 1; min-inline-size: 0; }
    .who__text strong { font-size: var(--tt-text-sm); }
    .who__text span { font-size: var(--tt-text-xs); color: var(--tt-text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .quick { margin-block-end: var(--tt-space-4); }
    .quick__title { display: flex; align-items: center; gap: 6px; margin: 0 0 var(--tt-space-2); padding-inline: var(--tt-space-1); color: var(--tt-gold-400); font-size: var(--tt-text-xs); font-weight: 800; }
    .quick__list { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; margin: 0; padding: 0; list-style: none; }
    .quick__list a {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      min-block-size: 50px;
      padding: 6px 2px;
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-sm);
      background: var(--tt-surface);
      color: var(--tt-text);
      text-decoration: none;
    }
    .quick__list a.best { border-color: var(--tt-gold-500); background: var(--tt-gold-tint); }
    .quick__list a { border-block-start: 2px solid var(--mat, var(--tt-border)); }
    .quick__qty { font-family: var(--tt-font-display); font-size: 17px; font-weight: 700; line-height: 1; color: var(--mat, var(--tt-text)); }
    .quick__price { font-size: 11px; font-weight: 700; color: var(--tt-gold-400); line-height: 1; }

    .group { margin: var(--tt-space-3) 0 var(--tt-space-1); padding-inline: var(--tt-space-2); color: var(--tt-text-faint); font-size: 10px; font-weight: 800; letter-spacing: var(--tt-tracking-eyebrow); text-transform: uppercase; }
    .nav { list-style: none; margin: 0; padding: 0; }
    .nav a, .signout {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      inline-size: 100%;
      min-block-size: 46px;
      padding-inline: var(--tt-space-2);
      border: 0;
      border-radius: var(--tt-radius-md);
      background: transparent;
      color: var(--tt-text);
      font: inherit;
      font-weight: 600;
      font-size: 15px;
      text-align: start;
      text-decoration: none;
      cursor: pointer;
    }
    .nav a:hover, .signout:hover { background: var(--tt-surface-2); }
    .nav a.active { background: var(--tt-brand-tint); }
    .nav a.active::before { content: ''; position: absolute; inset-inline-start: 0; inset-block: 10px; inline-size: 3px; border-radius: 3px; background: var(--tt-gold-500); }
    .glyph { display: grid; place-items: center; inline-size: 30px; block-size: 30px; flex: none; border-radius: var(--tt-radius-sm); background: var(--tt-surface-2); color: var(--tt-text-muted); }
    .nav a.active .glyph { background: transparent; color: var(--tt-brand-300); }
    .label { flex: 1; min-inline-size: 0; }
    .go { color: var(--tt-text-faint); flex: none; }

    .foot { display: flex; flex-direction: column; gap: var(--tt-space-3); padding: var(--tt-space-3) var(--tt-space-4) var(--tt-space-4); border-block-start: 1px solid var(--tt-border); background: var(--tt-bg-elevated); }
    .foot__row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--tt-space-2); }
    .foot__link { display: flex; align-items: center; justify-content: center; gap: var(--tt-space-2); min-block-size: 44px; border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); color: var(--tt-text); font-weight: 600; font-size: var(--tt-text-sm); text-decoration: none; }
    .foot__count { display: grid; place-items: center; min-inline-size: 20px; block-size: 20px; padding-inline: 5px; border-radius: var(--tt-radius-pill); background: var(--tt-gold-500); color: var(--tt-text-on-gold); font-size: 11px; font-weight: 800; }
    .assure { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--tt-text-faint); font-size: 11px; }
  `],
})
export class MobileNavComponent implements OnChanges {
  private readonly catalog = inject(CatalogFacade);
  private readonly router = inject(Router);
  readonly auth = inject(AuthFacade);

  @Input() open = false;
  @Input() count = 0;
  @Output() readonly close = new EventEmitter<void>();

  @ViewChild('panel') private readonly panel?: ElementRef<HTMLElement>;
  @ViewChild('closeButton') private readonly closeButton?: ElementRef<HTMLButtonElement>;

  readonly gameName = STOREFRONT.focusGameName;

  readonly groups: readonly MenuGroup[] = [
    {
      title: 'חנות',
      items: [
        { route: '/store', icon: 'coin', label: 'חבילות' },
        { route: '/deals', icon: 'lightning', label: 'מבצעים' },
      ],
    },
    {
      title: 'החשבון שלי',
      items: [
        { route: '/account/orders', icon: 'clock', label: 'ההזמנות שלי' },
        { route: '/account', icon: 'user', label: 'החשבון שלי', exact: true },
        { route: '/account/security', icon: 'lock', label: 'אבטחת החשבון', signedIn: true },
      ],
    },
    {
      title: 'עזרה',
      items: [
        { route: '/delivery', icon: 'delivery', label: 'איך זה עובד' },
        { route: '/reviews', icon: 'star', label: 'ביקורות' },
        { route: '/faq', icon: 'info', label: 'שאלות נפוצות' },
        { route: '/support', icon: 'support', label: 'תמיכה' },
      ],
    },
  ];

  /** Set the first time the drawer opens, so a closed drawer costs nothing. */
  private readonly opened = new BehaviorSubject<boolean>(false);

  readonly tiers$: Observable<readonly QuickTier[] | null> = this.opened.pipe(
    filter(Boolean),
    take(1),
    switchMap(() => this.catalog.productBySlug(STOREFRONT.focusProductSlug).pipe(catchError(() => of(null)))),
    map((detail) => this.tiersOf(detail)),
    catchError(() => of(null)),
    startWith(null),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.opened.next(true);
      // After the slide has started, so the browser does not scroll the panel
      // into view from its off-screen position.
      setTimeout(() => this.closeButton?.nativeElement.focus(), 40);
    }
  }

  tierColor(amount: number): string {
    return TIERS[tierForAmount(amount)].color;
  }

  signOut(): void {
    this.close.emit();
    const leaving = this.router.url.startsWith('/account/security');
    this.auth.logout().subscribe();
    if (leaving) {
      void this.router.navigateByUrl('/');
    }
  }

  /** Keeps Tab inside the dialog while it is open. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.panel) {
      return;
    }
    const focusable = Array.from(this.panel.nativeElement.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** The tiers, smallest first, priced from real offers. */
  private tiersOf(detail: ProductDetail | null): readonly QuickTier[] | null {
    if (!detail) {
      return null;
    }
    const first = detail.offers[0];
    if (!first) {
      return null;
    }
    const comparable = detail.offers.filter(
      (offer) => offer.platformId === first.platformId && offer.regionId === first.regionId,
    );

    const rows = rankByValue(comparable, detail.product.variants)
      .filter((row) => row.perUnitMinor !== undefined)
      .sort((a, b) => (a.variant.quantityValue ?? 0) - (b.variant.quantityValue ?? 0))
      .slice(0, 5)
      .map((row): QuickTier => ({
        slug: detail.product.slug,
        variantId: row.variant.id,
        quantity: formatQuantity(row.variant.quantityValue) || row.variant.name.he,
        price: `₪${Math.round(row.offer.price.current.amountMinor / 100).toLocaleString('he-IL')}`,
        best: row.isBestValue,
        amount: row.variant.quantityValue ?? 0,
      }));

    return rows.length > 0 ? rows : null;
  }
}
