import { Observable } from 'rxjs';

import {
  ClubSummary, CustomCoinsQuote, CustomCoinsQuoteRequest, CustomCoinsRules, Drop, EasyDrop, FoundersStatus,
  GrowthProgrammes, OrderId, ReferralAttachResult, ReferralSummary, RewardWallet, SubmitReviewRequest,
  SubmitReviewResult, TrustSnapshot,
} from '../../domain';

/**
 * The customer-value ecosystem: EasyDrop, EASYCLUB, referral, the Drop Zone,
 * custom coins and the trust figures.
 *
 * Everything here is read from the server or asked of it. No method accepts a
 * reward value, a price, a countdown or a count: the client names a card index,
 * an amount or a budget, a code, and the server answers with what is real.
 */
export abstract class GrowthApiService {
  /** Which programmes are on and how they are shaped, for copy and layout. */
  abstract getProgrammes(): Observable<GrowthProgrammes>;

  /** EASYCLUB for the signed-in customer. Fails with Unauthorized for a guest. */
  abstract getClub(): Observable<ClubSummary>;

  /** What the caller holds: a customer's rewards, or a guest session's. */
  abstract getRewards(): Observable<RewardWallet>;

  /** The drop for an order the caller owns; undefined when the order has none (yet). */
  abstract getEasyDrop(orderId: OrderId): Observable<EasyDrop | undefined>;

  /** Opens one card. Idempotent: repeating it returns the card already opened. */
  abstract revealEasyDrop(orderId: OrderId, index: number): Observable<EasyDrop>;

  abstract getReferral(): Observable<ReferralSummary>;
  abstract attachReferral(code: string): Observable<ReferralAttachResult>;

  /** Live and dated upcoming drops. Never a draft, never an ended one. */
  abstract getDrops(): Observable<readonly Drop[]>;

  abstract getFounders(): Observable<FoundersStatus>;
  abstract getTrust(): Observable<TrustSnapshot>;

  abstract getCustomCoinsRules(): Observable<CustomCoinsRules>;
  /** Prices an amount or a budget; the answer carries a real offer id. */
  abstract quoteCustomCoins(request: CustomCoinsQuoteRequest): Observable<CustomCoinsQuote>;

  /** A verified-purchase review against a delivered order the caller owns. */
  abstract submitReview(request: SubmitReviewRequest): Observable<SubmitReviewResult>;
}
