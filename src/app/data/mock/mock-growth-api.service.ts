import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  ClubSummary, CustomCoinsQuote, CustomCoinsQuoteRequest, CustomCoinsRules, Drop, EasyDrop, FoundersStatus,
  GrowthProgrammes, Offer, OrderId, OrderStatus, ProductVariant, ReferralAttachResult, ReferralSummary,
  RewardWallet, SubmitReviewRequest, SubmitReviewResult, TrustSnapshot, conflictError, localized,
  notFoundError, unauthorizedError, validationError,
} from '../../domain';
import { GrowthApiService } from '../api';
import { OFFERS, PRODUCTS } from './catalog.seed';
import { MOCK_CUSTOM_COINS, MOCK_FOUNDERS, MOCK_REFERRAL, mockProgrammes } from './growth.seed';
import { MockBackendService } from './mock-backend.service';
import { MockCustomCoinsError, MockLadderRung, mockQuoteByAmount, mockQuoteByBudget } from './mock-custom-coins';
import { club, dropView, ensureDrop, revealDrop, trust, wallet } from './mock-growth.engine';

const COIN_PRODUCT_SLUG = 'ea-fc-ultimate-team-coins';

function formatCoins(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(2).replace(/0$/, '')}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(2).replace(/0$/, '')}K`;
  }
  return String(value);
}

/**
 * The growth API of the in-memory backend.
 *
 * Reads the state the engine keeps and answers the way the real server does:
 * a drop only for a paid order, a reveal recorded once, EASYCLUB only for a
 * signed-in visitor, no drops when none is scheduled, trust figures withheld
 * under their thresholds, custom amounts priced by the ladder rule.
 */
@Injectable()
export class MockGrowthApiService extends GrowthApiService {
  private readonly backend = inject(MockBackendService);

  getProgrammes(): Observable<GrowthProgrammes> {
    return this.backend.respond(mockProgrammes(this.backend.founderSeats.size, this.coinPlatformIds()), 80);
  }

  getClub(): Observable<ClubSummary> {
    if (!this.backend.currentCustomerId) {
      return this.backend.fail<ClubSummary>(unauthorizedError('Sign in to see your EASYCLUB'));
    }
    return this.backend.respond(club(this.backend), 160);
  }

  getRewards(): Observable<RewardWallet> {
    return this.backend.respond(wallet(this.backend), 120);
  }

  getEasyDrop(orderId: OrderId): Observable<EasyDrop | undefined> {
    const order = this.backend.orders.get(orderId);
    if (!order) {
      return this.backend.fail<EasyDrop | undefined>(notFoundError(`Order "${orderId}" not found`));
    }
    const drop = ensureDrop(this.backend, order);
    return this.backend.respond(drop ? dropView(this.backend, drop) : undefined, 140);
  }

  revealEasyDrop(orderId: OrderId, index: number): Observable<EasyDrop> {
    if (!this.backend.orders.has(orderId)) {
      return this.backend.fail<EasyDrop>(notFoundError(`Order "${orderId}" not found`));
    }
    try {
      return this.backend.respond(revealDrop(this.backend, orderId, index), 420);
    } catch (error) {
      return this.backend.fail<EasyDrop>(error instanceof Error && 'kind' in error ? (error as never) : conflictError('reveal failed'));
    }
  }

  getReferral(): Observable<ReferralSummary> {
    if (!this.backend.currentCustomerId) {
      return this.backend.fail<ReferralSummary>(unauthorizedError('Sign in to get your referral link'));
    }
    return this.backend.respond(club(this.backend).referral, 100);
  }

  attachReferral(code: string): Observable<ReferralAttachResult> {
    const normalized = code.trim().toUpperCase();
    if (!MOCK_REFERRAL.enabled) {
      return this.backend.respond<ReferralAttachResult>({ attached: false, outcome: 'DISABLED' });
    }
    if (normalized !== MOCK_REFERRAL.code) {
      return this.backend.respond<ReferralAttachResult>({ attached: false, outcome: 'UNKNOWN_CODE' });
    }
    if (this.backend.currentCustomerId) {
      // The mock has one account, and its own code is this one.
      return this.backend.respond<ReferralAttachResult>({ attached: false, outcome: 'SELF' });
    }
    if ([...this.backend.orders.values()].some((order) => order.status === OrderStatus.Fulfilled || order.status === OrderStatus.FulfillmentProcessing)) {
      return this.backend.respond<ReferralAttachResult>({ attached: false, outcome: 'EXISTING_CUSTOMER' });
    }
    if (this.backend.referral) {
      return this.backend.respond<ReferralAttachResult>({ attached: true, outcome: 'ALREADY_ATTACHED', friendReward: MOCK_REFERRAL.friendReward.title });
    }
    this.backend.referral = { code: normalized, attachedAt: this.backend.now(), status: 'PENDING' };
    return this.backend.respond<ReferralAttachResult>({ attached: true, outcome: 'ATTACHED', friendReward: MOCK_REFERRAL.friendReward.title }, 200);
  }

  /** No drop is scheduled in the in-memory backend, so the Drop Zone shows its honest empty state. */
  getDrops(): Observable<readonly Drop[]> {
    return this.backend.respond<readonly Drop[]>([], 80);
  }

  getFounders(): Observable<FoundersStatus> {
    return this.backend.respond<FoundersStatus>({
      enabled: MOCK_FOUNDERS.enabled,
      name: MOCK_FOUNDERS.name,
      cap: MOCK_FOUNDERS.cap,
      taken: this.backend.founderSeats.size,
      remaining: Math.max(0, MOCK_FOUNDERS.cap - this.backend.founderSeats.size),
      reward: MOCK_FOUNDERS.reward.title,
    }, 80);
  }

  getTrust(): Observable<TrustSnapshot> {
    return this.backend.respond(trust(this.backend), 80);
  }

  getCustomCoinsRules(): Observable<CustomCoinsRules> {
    return this.backend.respond<CustomCoinsRules>({ ...MOCK_CUSTOM_COINS, platformIds: this.coinPlatformIds() }, 60);
  }

  quoteCustomCoins(request: CustomCoinsQuoteRequest): Observable<CustomCoinsQuote> {
    if (!MOCK_CUSTOM_COINS.enabled) {
      return this.backend.fail<CustomCoinsQuote>(notFoundError('custom coins are not offered'));
    }
    const product = PRODUCTS.find((candidate) => candidate.slug === COIN_PRODUCT_SLUG);
    const ladderOffers = OFFERS.filter((offer) => offer.productId === product?.id && offer.platformId === request.platformId && offer.active)
      .filter((offer) => !request.regionId || offer.regionId === request.regionId)
      .sort((a, b) => a.regionId.localeCompare(b.regionId));
    const regionId = ladderOffers[0]?.regionId;
    const inRegion = ladderOffers.filter((offer) => offer.regionId === regionId);
    if (!product || inRegion.length === 0 || !regionId) {
      return this.backend.fail<CustomCoinsQuote>(notFoundError(`no coin offers for platform ${request.platformId}`));
    }
    const rungs: MockLadderRung[] = inRegion.map((offer) => {
      const variant = product.variants.find((candidate) => candidate.id === offer.variantId);
      return { amount: variant?.quantityValue ?? 0, priceMinor: offer.price.current.amountMinor, bonus: launchBonusOf(variant) };
    });

    try {
      const quote = request.mode === 'budget'
        ? mockQuoteByBudget(rungs, MOCK_CUSTOM_COINS, request.budget?.amountMinor ?? 0)
        : mockQuoteByAmount(rungs, MOCK_CUSTOM_COINS, request.amount ?? 0);
      const rungOffer = inRegion.find((offer) => product.variants.find((variant) => variant.id === offer.variantId)?.quantityValue === quote.rungAmount) ?? inRegion[0];

      const variantId = `${product.id}__custom-${quote.amount}`;
      const offerId = `offer__${product.id}__custom-${quote.amount}__${request.platformId}__${regionId}`;
      const label = formatCoins(quote.amount);
      const bonusLabel = quote.bonus > 0 ? formatCoins(quote.bonus) : null;
      const variant: ProductVariant = {
        id: variantId,
        productId: product.id,
        name: localized(
          bonusLabel ? `${label} מטבעות (כמות מותאמת) + ${bonusLabel} בונוס השקה` : `${label} מטבעות (כמות מותאמת)`,
          bonusLabel ? `${label} coins (custom amount) + ${bonusLabel} launch bonus` : `${label} coins (custom amount)`,
        ),
        sku: `${COIN_PRODUCT_SLUG}-custom-${quote.amount}`.toUpperCase(),
        quantityValue: quote.amount,
        quantityUnit: localized('מטבעות', 'coins'),
        metadata: quote.bonus > 0 ? { custom: true, launchBonus: quote.bonus } : { custom: true },
        sortOrder: 1_000,
        active: true,
      };
      const offer: Offer = {
        id: offerId,
        productId: product.id,
        variantId,
        platformId: request.platformId,
        regionId,
        price: { current: { amountMinor: quote.priceMinor, currency: 'ILS' } },
        inventory: { status: rungOffer.inventory.status, maxPerOrder: 1 },
        fulfillmentMethod: rungOffer.fulfillmentMethod,
        checkoutRequirements: rungOffer.checkoutRequirements,
        terms: rungOffer.terms,
        active: true,
      };
      this.backend.customVariants.set(variantId, variant);
      this.backend.customOffers.set(offerId, offer);

      return this.backend.respond<CustomCoinsQuote>({
        offerId,
        productSlug: COIN_PRODUCT_SLUG,
        variantId,
        platformId: request.platformId,
        regionId,
        amount: quote.amount,
        price: { amountMinor: quote.priceMinor, currency: 'ILS' },
        bonus: quote.bonus,
        totalCoins: quote.totalCoins,
        perMillion: { amountMinor: quote.perMillionMinor, currency: 'ILS' },
        rungAmount: quote.rungAmount,
        mode: request.mode,
        rules: { minCoins: MOCK_CUSTOM_COINS.minCoins, maxCoins: MOCK_CUSTOM_COINS.maxCoins, stepCoins: MOCK_CUSTOM_COINS.stepCoins },
      }, 260);
    } catch (error) {
      if (error instanceof MockCustomCoinsError) {
        const message = error.code === 'AMOUNT_TOO_SMALL'
          ? localized(`הכמות המינימלית היא ${formatCoins(MOCK_CUSTOM_COINS.minCoins)} קוינס.`, `The minimum is ${formatCoins(MOCK_CUSTOM_COINS.minCoins)} coins.`)
          : error.code === 'AMOUNT_TOO_LARGE'
            ? localized(`הכמות המקסימלית להזמנה אחת היא ${formatCoins(MOCK_CUSTOM_COINS.maxCoins)} קוינס.`, `The maximum per order is ${formatCoins(MOCK_CUSTOM_COINS.maxCoins)} coins.`)
            : localized(`התקציב נמוך מהמחיר של ${formatCoins(MOCK_CUSTOM_COINS.minCoins)} קוינס.`, `That budget is below the price of ${formatCoins(MOCK_CUSTOM_COINS.minCoins)} coins.`);
        return this.backend.fail<CustomCoinsQuote>(validationError(error.message, [{ field: request.mode === 'budget' ? 'budget' : 'amount', message }]));
      }
      throw error;
    }
  }

  submitReview(request: SubmitReviewRequest): Observable<SubmitReviewResult> {
    const order = this.backend.orders.get(request.orderId);
    if (!order) {
      return this.backend.fail<SubmitReviewResult>(notFoundError(`Order "${request.orderId}" not found`));
    }
    if (order.status !== OrderStatus.Fulfilled) {
      return this.backend.fail<SubmitReviewResult>(conflictError('only a delivered order can be reviewed', localized('אפשר לדרג הזמנה רק אחרי שסופקה.', 'An order can be reviewed once it has been delivered.')));
    }
    if (this.backend.reviewedOrders.has(order.id)) {
      return this.backend.fail<SubmitReviewResult>(conflictError('already reviewed', localized('כבר כתבתם ביקורת על ההזמנה הזו. תודה!', 'You already reviewed this order. Thank you!')));
    }
    this.backend.reviewedOrders.add(order.id);
    // Held for an operator, never shown: the mock publishes nothing by itself.
    return this.backend.respond<SubmitReviewResult>({ id: this.backend.nextId('rev'), published: false, verifiedPurchase: true }, 300);
  }

  private coinPlatformIds(): string[] {
    const product = PRODUCTS.find((candidate) => candidate.slug === COIN_PRODUCT_SLUG);
    return [...new Set(OFFERS.filter((offer) => offer.productId === product?.id && offer.active).map((offer) => offer.platformId))].sort();
  }
}

function launchBonusOf(variant: ProductVariant | undefined): number {
  const value = variant?.metadata['launchBonus'];
  return typeof value === 'number' && value > 0 ? Math.round(value) : 0;
}
