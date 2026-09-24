import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { TokenStore } from '../auth/token.store';

export interface LadderPackage {
  key: string;
  coins: number;
  priceMinor: number;
  bonusCoins: number;
  tier: 'starter' | 'pro' | 'elite' | 'legend';
  recommended: boolean;
  active: boolean;
}

export interface LadderConfig {
  edition: 'fc27';
  productSlug: string;
  productId: string;
  status: 'draft' | 'active';
  packages: LadderPackage[];
  platformAdjustmentBps: Record<string, number>;
  maxDiscountBps: number;
  maxPerOrder: number;
}

export interface EconomicsConfig {
  supplierCostPer1MMinor: number | null;
  supplierCostByPlatform: Record<string, number>;
  paymentFeeBps: number;
  deliveryLossBps: number;
  minMarginBps: number;
  vatIncluded: boolean;
  vatBps: number;
}

export interface LaunchConfig {
  id: string;
  enabled: boolean;
  name: { he: string; en: string };
  startsAt: string | null;
  endsAt: string | null;
  benefit: { kind: 'BONUS_COINS_PERCENT'; percentBps: number; capCoins: number; minOrderMinor: number };
  eligibility: 'first-order';
  maxRedemptions: number | null;
  terms: { he: string; en: string }[];
}

export interface CompetitorEntry {
  seller: string;
  url: string;
  checkedAt: string;
  platform: string;
  coins: number;
  priceMinor: number;
  promotion: string;
  effectivePriceMinor: number;
  effectiveCoins: number;
  notes: string;
}

export interface CompetitorsConfig {
  checkedAt: string;
  entries: CompetitorEntry[];
}

export interface PricingSetting<T = unknown> {
  key: 'economics' | 'ladder' | 'launch' | 'competitors';
  value: T;
  source: 'default' | 'override';
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface PackageEconomics {
  key: string;
  coins: number;
  bonusCoins: number;
  deliveredCoins: number;
  priceMinor: number;
  per100KMinor: number;
  per1MMinor: number;
  netRevenueMinor: number;
  coinsToBuy: number;
  supplierCostMinor: number | null;
  paymentFeeMinor: number;
  contributionMinor: number | null;
  marginBps: number | null;
  savingVsStarterBps: number;
}

export interface ActivationCheck {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
}

export interface LadderEvaluation {
  costKnown: boolean;
  packages: PackageEconomics[];
  belowFloor: string[];
  check: ActivationCheck;
  checkAcknowledged: ActivationCheck;
}

export interface StorefrontState {
  activeEdition: 'fc26' | 'fc27';
  editions: { id: string; label: string; productSlug: string; status: string }[];
  ladderStatus: 'draft' | 'active';
}

export interface CreatorCode {
  code: string;
  creator: string;
  percentBps: number;
  startsAt: string | null;
  endsAt: string | null;
  minSubtotalMinor: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  active: boolean;
  createdAt: string;
}

/**
 * The owner's price controls, over the same bearer token as the queue.
 *
 * Nothing here retries: activating a ladder twice is harmless (it rewrites
 * the same rows) but a silent retry is still not something an operator
 * should discover from the audit log.
 */
@Injectable({ providedIn: 'root' })
export class PricingApi {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);
  private readonly base = `${environment.apiBaseUrl}/${environment.apiVersion}/admin/pricing`;

  settings(): Observable<PricingSetting[]> {
    return this.get<PricingSetting[]>('/settings');
  }

  putSetting<T>(key: PricingSetting['key'], value: T): Observable<PricingSetting<T>> {
    return this.http.put<PricingSetting<T>>(`${this.base}/settings/${key}`, { value }, { headers: this.headers() }).pipe(catchError(toMessage));
  }

  resetSetting(key: PricingSetting['key']): Observable<void> {
    return this.http.delete<void>(`${this.base}/settings/${key}`, { headers: this.headers() }).pipe(catchError(toMessage));
  }

  evaluation(platformId?: string): Observable<LadderEvaluation> {
    return this.get<LadderEvaluation>('/evaluation', platformId ? new HttpParams().set('platformId', platformId) : undefined);
  }

  storefront(): Observable<StorefrontState> {
    return this.get<StorefrontState>('/storefront');
  }

  preview(): Observable<{ product: string; variants: number; offers: number; retire: number; check: ActivationCheck }> {
    return this.get('/ladder/preview');
  }

  activate(acknowledgeUnknownCost: boolean): Observable<{ check: ActivationCheck; offersWritten: number; offersRetired: number }> {
    return this.post('/ladder/activate', { acknowledgeUnknownCost });
  }

  republish(): Observable<{ offersWritten: number }> {
    return this.post('/ladder/republish', {});
  }

  deactivate(): Observable<{ offersRetired: number; offersRestored: number }> {
    return this.post('/ladder/deactivate', {});
  }

  codes(): Observable<CreatorCode[]> {
    return this.get<CreatorCode[]>('/codes');
  }

  createCode(body: Partial<CreatorCode> & { code: string; creator: string; percentBps: number }): Observable<CreatorCode> {
    return this.post<CreatorCode>('/codes', body);
  }

  updateCode(code: string, body: Partial<CreatorCode>): Observable<CreatorCode> {
    return this.http.patch<CreatorCode>(`${this.base}/codes/${encodeURIComponent(code)}`, body, { headers: this.headers() }).pipe(catchError(toMessage));
  }

  attribution(code: string): Observable<{ code: string; orders: number; revenueMinor: number; discountMinor: number }> {
    return this.get(`/codes/${encodeURIComponent(code)}/attribution`);
  }

  private get<T>(path: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(`${this.base}${path}`, { headers: this.headers(), params }).pipe(catchError(toMessage));
  }

  private post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.base}${path}`, body, { headers: this.headers() }).pipe(catchError(toMessage));
  }

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.tokens.token() ?? ''}` });
  }
}

/** The server's own words when it refuses, otherwise a plain sentence. */
function toMessage(error: HttpErrorResponse): Observable<never> {
  const body = error.error as { error?: { message?: string; fieldErrors?: { message?: { he?: string } }[] }; message?: string } | null;
  const field = body?.error?.fieldErrors?.[0]?.message?.he;
  const message = field ?? body?.error?.message ?? body?.message ?? (error.status === 0 ? 'אין חיבור לשרת' : `שגיאה ${error.status}`);
  return throwError(() => new Error(message));
}
