import { Routes } from '@angular/router';

import { brandTitle } from './core/brand';

import { authRequiredGuard } from './pages/account/auth-required.guard';
import { cartNotEmptyGuard } from './pages/checkout/cart-not-empty.guard';
import { LEGAL_ROUTES } from './pages/legal/legal.manifest';

/**
 * Commerce routing map.
 *
 * Every route below renders a real page — there are no placeholders and no
 * redirects to a "coming soon" screen. Each page is lazy-loaded as a standalone
 * component, so the initial bundle carries the shell only.
 */
export const APP_ROUTES: Routes = [
  {
    path: '',
    title: brandTitle(),
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'store',
    title: brandTitle('החנות'),
    // `preload: true` marks the buying path: these chunks are fetched once the
    // browser is idle, so the first click after landing does not wait for a
    // download. Everything else loads when it is navigated to.
    data: { preload: true },
    loadComponent: () => import('./pages/store/store.page').then((m) => m.StorePage),
  },
  // /products is the canonical catalog path in the API; in the UI it is the store.
  { path: 'products', pathMatch: 'full', redirectTo: 'store' },
  {
    path: 'games',
    title: brandTitle('משחקים'),
    loadComponent: () => import('./pages/games/games.page').then((m) => m.GamesPage),
  },
  {
    path: 'games/:gameSlug',
    loadComponent: () => import('./pages/games/game-detail.page').then((m) => m.GameDetailPage),
  },
  {
    path: 'products/:productSlug',
    data: { preload: true },
    loadComponent: () => import('./pages/product/product-detail.page').then((m) => m.ProductDetailPage),
  },
  {
    // Deep link straight to a variant, e.g. a "1M coins" ad landing page.
    path: 'products/:productSlug/:variantId',
    loadComponent: () => import('./pages/product/product-detail.page').then((m) => m.ProductDetailPage),
  },
  {
    path: 'cart',
    title: brandTitle('העגלה שלי'),
    data: { preload: true },
    loadComponent: () => import('./pages/cart/cart.page').then((m) => m.CartPage),
  },
  {
    path: 'checkout',
    title: brandTitle('תשלום'),
    canActivate: [cartNotEmptyGuard],
    loadComponent: () => import('./pages/checkout/checkout.page').then((m) => m.CheckoutPage),
  },
  {
    path: 'order/:orderId',
    loadComponent: () => import('./pages/order/order-status.page').then((m) => m.OrderStatusPage),
  },
  {
    path: 'order/:orderId/success',
    loadComponent: () => import('./pages/order/order-status.page').then((m) => m.OrderStatusPage),
    data: { celebrate: true },
  },
  {
    path: 'order/:orderId/status',
    loadComponent: () => import('./pages/order/order-status.page').then((m) => m.OrderStatusPage),
  },
  {
    path: 'account',
    title: brandTitle('האזור האישי'),
    loadComponent: () => import('./pages/account/account.page').then((m) => m.AccountPage),
  },
  {
    // Reachable as a guest on purpose: an order placed without an account is
    // owned by the anonymous session that placed it, and this is where that
    // session reads it. The page itself invites sign-in when there is nothing.
    path: 'account/orders',
    title: brandTitle('ההזמנות שלי'),
    loadComponent: () => import('./pages/account/account-orders.page').then((m) => m.AccountOrdersPage),
  },
  {
    // Account-only. Anonymous visitors are sent to sign in and brought back.
    path: 'account/security',
    title: brandTitle('אבטחת החשבון'),
    canActivate: [authRequiredGuard],
    loadComponent: () => import('./pages/account/account-security.page').then((m) => m.AccountSecurityPage),
  },
  {
    path: 'account/order/:orderId',
    loadComponent: () => import('./pages/order/order-status.page').then((m) => m.OrderStatusPage),
  },
  {
    path: 'support',
    title: brandTitle('תמיכה'),
    loadComponent: () => import('./pages/support/support.page').then((m) => m.SupportPage),
  },
  {
    path: 'faq',
    title: brandTitle('שאלות נפוצות'),
    loadComponent: () => import('./pages/support/faq.page').then((m) => m.FaqPage),
  },
  {
    path: 'reviews',
    title: brandTitle('ביקורות'),
    loadComponent: () => import('./pages/reviews/reviews.page').then((m) => m.ReviewsPage),
  },
  {
    path: 'deals',
    title: brandTitle('מבצעים'),
    loadComponent: () => import('./pages/deals/deals.page').then((m) => m.DealsPage),
  },
  {
    path: 'contact',
    title: brandTitle('צור קשר'),
    loadComponent: () => import('./pages/support/support.page').then((m) => m.SupportPage),
  },
  // Static policy pages share one component and differ only by content record.
  // Only slug and title are needed here; the texts live in the lazy chunk.
  ...LEGAL_ROUTES.map((page) => ({
    path: page.slug,
    title: brandTitle(page.title),
    loadComponent: () => import('./pages/legal/legal.page').then((m) => m.LegalPage),
    data: { slug: page.slug },
  })),
  {
    path: '**',
    title: brandTitle('הדף לא נמצא'),
    loadComponent: () => import('./pages/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
