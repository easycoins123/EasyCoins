import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';

import { TokenStore } from './auth/token.store';

/**
 * Sends anyone without a token to sign in.
 *
 * This is a convenience, not a security boundary. The boundary is the API,
 * which rejects every request without a valid token. A route guard protects
 * nothing on its own: the code is already in the browser by the time it runs.
 */
const requireToken = () => {
  if (inject(TokenStore).isSignedIn()) {
    return true;
  }
  return inject(Router).createUrlTree(['/sign-in']);
};

export const routes: Routes = [
  {
    path: 'sign-in',
    loadComponent: () => import('./pages/sign-in.page').then((m) => m.SignInPage),
    title: 'כניסה',
  },
  {
    path: '',
    canActivate: [requireToken],
    loadComponent: () => import('./pages/queue.page').then((m) => m.QueuePage),
    title: 'תור עבודה',
  },
  {
    path: 'jobs/:id',
    canActivate: [requireToken],
    loadComponent: () => import('./pages/job.page').then((m) => m.JobPage),
    title: 'עבודה',
  },
  {
    path: 'pricing',
    canActivate: [requireToken],
    loadComponent: () => import('./pages/pricing.page').then((m) => m.PricingPage),
    title: 'מחירים',
  },
  {
    path: 'pricing/codes',
    canActivate: [requireToken],
    loadComponent: () => import('./pages/codes.page').then((m) => m.CodesPage),
    title: 'קודי יוצרים',
  },
  { path: '**', redirectTo: '' },
];
