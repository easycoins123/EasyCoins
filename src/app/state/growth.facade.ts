import { Injectable, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap, take, tap } from 'rxjs/operators';

import { GrowthApiService } from '../data/api';
import {
  ClubSummary, CustomCoinsQuote, CustomCoinsQuoteRequest, CustomCoinsRules, Drop, EasyDrop, FoundersStatus,
  GrowthProgrammes, OrderId, ReferralAttachResult, RewardWallet, SubmitReviewRequest, SubmitReviewResult,
  TrustSnapshot, isRedeemableAtCheckout,
} from '../domain';
import { AuthFacade } from './customer.facade';

/**
 * The customer-value ecosystem, read once per visit and refreshed when
 * something the customer did could have changed it.
 *
 * Nothing here computes a reward, a tier or a figure: every value is the
 * server's answer, cached where it is stable (programmes, founders, drops,
 * trust) and re-asked where it moves (the wallet after a reveal, the club
 * after a sign-in). A failed read degrades to "nothing to show", never to a
 * screen that blocks a purchase.
 */
@Injectable({ providedIn: 'root' })
export class GrowthFacade {
  private readonly api = inject(GrowthApiService);
  private readonly auth = inject(AuthFacade);

  readonly programmes$: Observable<GrowthProgrammes | null> = this.api.getProgrammes().pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly founders$: Observable<FoundersStatus | null> = this.api.getFounders().pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly drops$: Observable<readonly Drop[]> = this.api.getDrops().pipe(
    catchError(() => of([] as readonly Drop[])),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly trust$: Observable<TrustSnapshot | null> = this.api.getTrust().pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly customRules$: Observable<CustomCoinsRules | null> = this.api.getCustomCoinsRules().pipe(
    catchError(() => of(null)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  private readonly walletSignal = signal<RewardWallet | null>(null);
  /** What the caller holds; null until asked. */
  readonly wallet = this.walletSignal.asReadonly();
  /** The rewards a customer can pick at checkout right now. */
  readonly redeemable = computed(() => (this.walletSignal()?.available ?? []).filter(isRedeemableAtCheckout));

  private readonly clubRefresh = new BehaviorSubject<number>(0);

  /** EASYCLUB for a signed-in customer, null for a guest or while unknown. */
  readonly club$: Observable<ClubSummary | null> = combineLatest([this.auth.status$, this.clubRefresh]).pipe(
    switchMap(([status]) => (status === 'authenticated'
      ? this.api.getClub().pipe(catchError(() => of(null)))
      : of(null))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor() {
    // The wallet follows the sign-in state: a guest's session rewards, then
    // the account's once they sign in and the server has moved them across.
    this.auth.status$.subscribe((status) => {
      if (status !== 'checking') {
        this.refreshWallet();
      }
    });
  }

  refreshWallet(): void {
    this.api.getRewards().pipe(take(1), catchError(() => of(null))).subscribe((wallet) => this.walletSignal.set(wallet));
  }

  refreshClub(): void {
    this.clubRefresh.next(this.clubRefresh.value + 1);
  }

  /** The order's drop. A paid order has moved the wallet, so it is re-read here. */
  easyDrop(orderId: OrderId): Observable<EasyDrop | undefined> {
    return this.api.getEasyDrop(orderId).pipe(
      tap((drop) => {
        if (drop) {
          this.refreshWallet();
        }
      }),
      catchError(() => of(undefined)),
    );
  }

  /** Opens a card, then re-reads the wallet so the new reward shows everywhere. */
  reveal(orderId: OrderId, index: number): Observable<EasyDrop> {
    return this.api.revealEasyDrop(orderId, index).pipe(tap(() => {
      this.refreshWallet();
      this.refreshClub();
    }));
  }

  attachReferral(code: string): Observable<ReferralAttachResult> {
    return this.api.attachReferral(code);
  }

  quote(request: CustomCoinsQuoteRequest): Observable<CustomCoinsQuote> {
    return this.api.quoteCustomCoins(request);
  }

  submitReview(request: SubmitReviewRequest): Observable<SubmitReviewResult> {
    return this.api.submitReview(request).pipe(tap(() => this.refreshClub()));
  }

  /** The first drop worth telling a visitor about: live before scheduled. */
  readonly nextDrop$: Observable<Drop | undefined> = this.drops$.pipe(
    map((drops) => drops.find((drop) => drop.status === 'active') ?? drops.find((drop) => drop.status === 'scheduled')),
  );
}
