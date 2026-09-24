import { Injectable } from '@nestjs/common';
import type { Inventory, Offer, Platform, Product, ProductVariant, Region } from '@prisma/client';

import { badRequestError, notFoundError } from '../../common/errors/api-error';
import { CheckoutRequirement, sanitizeRequirements } from '../../common/checkout/requirement-keys';
import { PrismaService } from '../../database/prisma.service';
import { BenefitKind, BenefitRequest, resolveBenefits } from '../growth/benefit-policy';
import { RewardOwner, localizedOf } from '../growth/growth-shared';
import { RewardsService } from '../growth/rewards.service';
import { CreatorCodesService } from '../pricing/creator-codes.service';
import { FirstOrderService } from '../pricing/first-order.service';
import { maximumBenefitMinor } from '../pricing/ladder-economics';
import { PricingConfigService } from '../pricing/pricing-config.service';

/**
 * The fields every order needs, whatever is in it.
 *
 * Note what is absent and can never be added: no password, no verification code,
 * no recovery code, no card field. The allowlist in
 * `common/checkout/requirement-keys.ts` makes that structural rather than a
 * convention.
 */
const BASE_REQUIREMENTS: readonly CheckoutRequirement[] = [
  {
    key: 'FULL_NAME',
    control: 'text',
    label: { he: 'שם מלא', en: 'Full name' },
    required: true,
    maxLength: 80,
  },
  {
    key: 'EMAIL',
    control: 'email',
    label: { he: 'אימייל', en: 'Email' },
    hint: {
      he: 'לכאן יישלחו אישור ההזמנה והקוד.',
      en: 'Your order confirmation and code are sent here.',
    },
    required: true,
    maxLength: 120,
  },
  {
    key: 'PHONE',
    control: 'tel',
    label: { he: 'טלפון (אופציונלי)', en: 'Phone (optional)' },
    hint: { he: 'לעדכונים על אספקה ידנית.', en: 'For updates about manual delivery.' },
    required: false,
    maxLength: 20,
  },
];

const TERMS_REQUIREMENT: CheckoutRequirement = {
  key: 'TERMS_ACCEPTANCE',
  control: 'checkbox',
  label: {
    he: 'קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות ההחזרים',
    en: 'I have read and accept the terms of use and the refund policy',
  },
  required: true,
};

/** What a client is allowed to say about a line: which offer, and how many. */
export interface RequestedLine {
  readonly offerId: string;
  readonly quantity: number;
}

/**
 * The hard ceiling on a single line, whatever the offer permits.
 *
 * `offers.max_per_order` is the business rule; this is the guard rail behind it,
 * so a mistaken admin value cannot turn into a five-figure order.
 */
const ABSOLUTE_MAX_QUANTITY = 25;

/** The most lines one cart may contain. Bounds the work any request can cause. */
export const MAX_CART_LINES = 30;

export type PricedOffer = Offer & {
  inventory: Inventory | null;
  product: Product;
  variant: ProductVariant;
  platform: Platform;
  region: Region;
};

export interface PricedLine {
  readonly id: string;
  readonly offer: PricedOffer;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly totalPriceMinor: number;
  readonly currency: string;
  /** Coins the line delivers before any bonus; zero for anything that is not game currency. */
  readonly coins: number;
  /** Launch bonus coins the line delivers on top, across its quantity. */
  readonly bonusCoins: number;
}

/** A benefit that is on the order, and what it does to it. */
export interface AppliedBenefit {
  readonly kind: BenefitKind;
  readonly label: { he: string; en: string };
  readonly effect: { readonly discountMinor?: number; readonly coins?: number };
  readonly rewardId?: string;
  readonly couponCode?: string;
}

/** A benefit that was asked for and set aside, with the reason in the customer's words. */
export interface RejectedBenefit {
  readonly kind: BenefitKind;
  readonly label: { he: string; en: string };
  readonly code: string;
  readonly reason: { he: string; en: string };
  readonly rewardId?: string;
  readonly couponCode?: string;
}

/**
 * The stacking decision for a cart, made once here and repeated by every
 * screen. `rewardId` is set only when the reward actually applies, so a
 * checkout or an order can never hold a reward the policy refused.
 */
export interface CartBenefits {
  readonly applied: readonly AppliedBenefit[];
  readonly rejected: readonly RejectedBenefit[];
  readonly rewardId: string | null;
  /** Extra coins an applied reward adds to the delivery. */
  readonly rewardCoins: number;
  /** The launch offer on this order, when the welcome benefit applies. */
  readonly campaignId: string | null;
  /** Extra coins the launch offer adds to the delivery. */
  readonly campaignCoins: number;
}

export const NO_BENEFITS: CartBenefits = { applied: [], rejected: [], rewardId: null, rewardCoins: 0, campaignId: null, campaignCoins: 0 };

export interface PricedCart {
  readonly lines: readonly PricedLine[];
  readonly currency: string;
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
  readonly issues: readonly CartIssue[];
  readonly benefits: CartBenefits;
}

export interface PricingOptions {
  readonly couponCode?: string | null;
  /** An earned reward the customer chose to use. Ownership is checked against `owner`. */
  readonly rewardId?: string | null;
  readonly owner?: RewardOwner | null;
  /** Known at checkout and order creation; sharpens the first-order check. */
  readonly contactEmail?: string | null;
  /** The order being created, so its own row does not count as history. */
  readonly excludeOrderId?: string;
}

export interface CartIssue {
  readonly code: string;
  readonly offerId?: string;
  readonly message: { he: string; en: string };
}

const LAUNCH_BONUS_LABEL = { he: 'בונוס ההשקה', en: 'Launch bonus' };
const NOBODY: RewardOwner = { customerId: null, sessionId: null };

/**
 * Pricing, and the only place allowed to decide what anything costs.
 *
 * The client sends an offer id and a quantity. Everything with a currency
 * attached is read from the database here: unit price, line total, subtotal,
 * discount and total. A price, subtotal or total arriving in a request body is
 * not merely distrusted, it is never read, so there is nothing to tamper with.
 *
 * The same code prices the cart preview, the checkout session and eventually the
 * order, which is what stops the three from disagreeing.
 */
/**
 * Launch bonus coins on a variant, per unit, set by the catalog seed as
 * `metadata.launchBonus`. Zero when the campaign is off. A line that carries
 * a bonus is the LAUNCH_BONUS benefit the stacking matrix reasons about.
 */
function launchBonusOf(metadata: unknown): number {
  const bonus = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['launchBonus'] : undefined;
  return typeof bonus === 'number' && bonus > 0 ? Math.round(bonus) : 0;
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rewards: RewardsService,
    private readonly firstOrder: FirstOrderService,
    private readonly codes: CreatorCodesService,
    private readonly pricingConfig: PricingConfigService,
  ) {}

  /**
   * Validates one requested line and prices it.
   *
   * Used by "add to cart", where a customer is entitled to a clear error rather
   * than a silently dropped item.
   */
  async priceLine(request: RequestedLine): Promise<PricedLine> {
    const quantity = this.requireValidQuantity(request.quantity);
    const offer = await this.loadOffer(request.offerId);

    this.requirePurchasable(offer);
    this.requireAvailable(offer, quantity);

    return this.toLine(offer, quantity);
  }

  /**
   * Prices a whole cart, reporting problems instead of refusing outright.
   *
   * A cart is a working document. If an offer sold out while the customer was
   * browsing, the right answer is a cart that shows what changed, not a failed
   * request that leaves them with no way forward. Unbuyable lines are dropped
   * from the totals so the figures always describe what could actually be
   * ordered.
   */
  async priceCart(
    requested: readonly RequestedLine[],
    options: PricingOptions = {},
  ): Promise<PricedCart> {
    if (requested.length > MAX_CART_LINES) {
      throw badRequestError(
        `A cart may not exceed ${MAX_CART_LINES} lines`,
        'CART_TOO_LARGE',
      );
    }

    // Duplicate offer ids are merged rather than rejected: two tabs adding the
    // same item is ordinary behaviour, not an attack.
    const merged = new Map<string, number>();
    for (const line of requested) {
      if (typeof line?.offerId !== 'string' || line.offerId.length === 0) {
        continue;
      }
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity < 1) {
        continue;
      }
      merged.set(line.offerId, (merged.get(line.offerId) ?? 0) + Math.trunc(quantity));
    }

    const offerIds = [...merged.keys()];
    // One query for every line. Loading them individually would be an N+1 that
    // grows with the customer's cart.
    const offers = offerIds.length > 0 ? await this.loadOffers(offerIds) : [];
    const byId = new Map(offers.map((offer) => [offer.id, offer]));

    const lines: PricedLine[] = [];
    const issues: CartIssue[] = [];

    for (const [offerId, requestedQuantity] of merged) {
      const offer = byId.get(offerId);

      if (!offer || !offer.active || !offer.product.active || !offer.variant.active) {
        issues.push({
          code: 'OFFER_UNAVAILABLE',
          offerId,
          message: {
            he: 'הפריט כבר לא נמכר והוסר מהעגלה.',
            en: 'This item is no longer sold and was removed from the cart.',
          },
        });
        continue;
      }

      const allowed = this.availableQuantity(offer);
      if (allowed <= 0) {
        issues.push({
          code: 'OUT_OF_STOCK',
          offerId,
          message: {
            he: 'הפריט אזל מהמלאי.',
            en: 'This item is out of stock.',
          },
        });
        continue;
      }

      const capped = Math.min(requestedQuantity, allowed);
      if (capped < requestedQuantity) {
        issues.push({
          code: 'QUANTITY_REDUCED',
          offerId,
          message: {
            he: `הכמות עודכנה ל-${capped} לפי המלאי הזמין.`,
            en: `Quantity reduced to ${capped} to match available stock.`,
          },
        });
      }

      lines.push(this.toLine(offer, capped));
    }

    return this.total(lines, options, issues);
  }

  /**
   * Adds up priced lines and settles which benefits apply. The only arithmetic
   * that produces a total, and the only place the stacking matrix is asked.
   *
   * Integer minor units throughout, so there is no floating-point rounding to
   * argue about at the till. The matrix lives in `growth/benefit-policy.ts`;
   * here its answer is turned into money, coins and the issues the customer
   * reads: which benefit is on the order, which was set aside, and why.
   */
  private async total(
    lines: readonly PricedLine[],
    options: PricingOptions,
    issues: CartIssue[],
  ): Promise<PricedCart> {
    const currency = lines[0]?.currency ?? 'ILS';
    const subtotalMinor = lines.reduce((sum, line) => sum + line.totalPriceMinor, 0);
    const couponCode = options.couponCode?.trim() || null;
    const hasLines = lines.length > 0;
    const launchCoins = lines.reduce((sum, line) => sum + line.bonusCoins, 0);

    const requests: BenefitRequest[] = [];
    const rejected: RejectedBenefit[] = [];

    if (launchCoins > 0) {
      requests.push({ kind: 'LAUNCH_BONUS', label: LAUNCH_BONUS_LABEL });
    }
    if (couponCode && hasLines) {
      requests.push({ kind: 'COUPON', label: { he: couponCode.toUpperCase(), en: couponCode.toUpperCase() } });
    }

    // An earned reward is checked for ownership and eligibility before the
    // matrix sees it. A reward that is not the caller's is simply not found.
    let reward: Awaited<ReturnType<RewardsService['redeemable']>>['reward'] = null;
    if (options.rewardId && hasLines) {
      const check = await this.rewards.redeemable(options.owner ?? NOBODY, options.rewardId, {
        subtotalMinor,
        hasCoinLine: lines.some((line) => line.coins > 0),
      });
      if (check.eligible && check.reward) {
        reward = check.reward;
        requests.push({ kind: 'REWARD', label: localizedOf(reward.title) });
      } else {
        rejected.push({
          kind: 'REWARD',
          label: check.reward ? localizedOf(check.reward.title) : { he: 'ההטבה', en: 'The reward' },
          code: check.reason?.code ?? 'REWARD_NOT_AVAILABLE',
          reason: { he: check.reason?.he ?? 'ההטבה אינה זמינה.', en: check.reason?.en ?? 'The reward is not available.' },
          rewardId: options.rewardId,
        });
      }
    }

    // The welcome benefit: decided by the server from the customer's history,
    // requested only when it would actually apply, and explained when the
    // offer is live but this customer is past their first order.
    const coinsBought = lines.reduce((sum, line) => sum + line.coins, 0);
    const welcome = hasLines
      ? await this.firstOrder.decide(this.prisma, {
          owner: options.owner ?? NOBODY,
          contactEmail: options.contactEmail ?? null,
          coinsBought,
          subtotalMinor,
          excludeOrderId: options.excludeOrderId,
        })
      : null;
    if (welcome?.eligible) {
      requests.push({ kind: 'FIRST_ORDER', label: welcome.launch.name });
    } else if (welcome?.live && welcome.reason === 'NOT_FIRST_ORDER' && coinsBought > 0) {
      rejected.push({
        kind: 'FIRST_ORDER',
        label: welcome.launch.name,
        code: 'FIRST_ORDER_ONLY',
        reason: { he: 'הטבת ההצטרפות היא להזמנה הראשונה בלבד.', en: 'The welcome benefit is for a first order only.' },
      });
    }

    const resolution = resolveBenefits(requests);
    for (const entry of resolution.rejected) {
      rejected.push({
        kind: entry.kind,
        label: entry.label,
        code: entry.code === 'NOT_COMBINABLE' ? `${entry.kind}_NOT_COMBINABLE` : 'ONE_PER_ORDER',
        reason: entry.reason,
        ...(entry.kind === 'COUPON' && couponCode ? { couponCode } : {}),
        ...(entry.kind === 'REWARD' && reward ? { rewardId: reward.id } : {}),
      });
    }

    const couponApplied = resolution.applied.some((entry) => entry.kind === 'COUPON');
    const rewardApplied = reward !== null && resolution.applied.some((entry) => entry.kind === 'REWARD');
    const welcomeApplied = welcome?.eligible === true && resolution.applied.some((entry) => entry.kind === 'FIRST_ORDER');
    const { ladder } = await this.pricingConfig.get();
    // The most any benefit may take off the ladder price, whatever the code says.
    const discountCeiling = maximumBenefitMinor(subtotalMinor, ladder.maxDiscountBps);
    const couponDiscount = couponApplied
      ? Math.min(discountCeiling, await this.discountFor(subtotalMinor, couponCode, options.owner?.customerId ?? null))
      : 0;

    let rewardCredit = 0;
    let rewardCoins = 0;
    if (rewardApplied && reward) {
      if (reward.kind === 'NEXT_ORDER_CREDIT') {
        rewardCredit = Math.max(0, Math.min(reward.value, subtotalMinor - couponDiscount));
      } else if (reward.kind === 'NEXT_ORDER_COINS') {
        rewardCoins = reward.value;
      }
    }

    const discountMinor = couponDiscount + rewardCredit;
    const campaignCoins = welcomeApplied && welcome ? welcome.bonusCoins : 0;
    const applied: AppliedBenefit[] = [];
    if (launchCoins > 0) {
      applied.push({ kind: 'LAUNCH_BONUS', label: LAUNCH_BONUS_LABEL, effect: { coins: launchCoins } });
    }
    if (welcomeApplied && welcome) {
      applied.push({ kind: 'FIRST_ORDER', label: welcome.launch.name, effect: { coins: campaignCoins } });
    }
    if (couponApplied && couponDiscount > 0 && couponCode) {
      applied.push({ kind: 'COUPON', label: { he: couponCode.toUpperCase(), en: couponCode.toUpperCase() }, effect: { discountMinor: couponDiscount }, couponCode });
    }
    if (rewardApplied && reward) {
      applied.push({
        kind: 'REWARD',
        label: localizedOf(reward.title),
        effect: { ...(rewardCredit > 0 ? { discountMinor: rewardCredit } : {}), ...(rewardCoins > 0 ? { coins: rewardCoins } : {}) },
        rewardId: reward.id,
      });
    }

    for (const entry of rejected) {
      if (entry.kind === 'COUPON') {
        issues.push({ code: 'COUPON_NOT_COMBINABLE', message: entry.reason });
      } else if (entry.kind === 'REWARD') {
        issues.push({ code: 'REWARD_NOT_APPLICABLE', message: entry.reason });
      }
    }
    if (couponApplied && couponDiscount === 0 && hasLines) {
      issues.push({
        code: 'COUPON_NOT_APPLICABLE',
        message: {
          he: 'הקוד שהוזן אינו תקף לעגלה הזו.',
          en: 'That code does not apply to this cart.',
        },
      });
    }

    return {
      lines,
      currency,
      subtotalMinor,
      discountMinor,
      // Clamped so a misconfigured promotion can never produce a negative total,
      // which is a refund dressed up as a purchase.
      totalMinor: Math.max(0, subtotalMinor - discountMinor),
      issues,
      benefits: {
        applied,
        rejected,
        rewardId: rewardApplied && reward ? reward.id : null,
        rewardCoins,
        campaignId: welcomeApplied && welcome ? welcome.launch.id : null,
        campaignCoins,
      },
    };
  }

  /**
   * Resolves a coupon against the database.
   *
   * A code that does not exist, has expired or has not started yet is worth
   * exactly nothing. The client never states a discount, so an invalid code
   * costs the customer nothing and gains them nothing.
   */
  async discountFor(subtotalMinor: number, couponCode: string | null, customerId: string | null = null): Promise<number> {
    if (!couponCode || subtotalMinor <= 0) {
      return 0;
    }

    // A coupon row (an ordinary coupon or a creator code) is the first
    // answer: it carries the minimum, the cap and the expiry the promotion
    // alone does not. A code with no coupon row falls through to the legacy
    // promotion-slug lookup below.
    const byCode = await this.codes.resolve(this.prisma, couponCode, subtotalMinor, customerId);
    if ('discountMinor' in byCode) {
      return byCode.discountMinor;
    }
    if (byCode.reason !== 'UNKNOWN') {
      return 0;
    }

    const now = new Date();
    const promotion = await this.prisma.promotion.findUnique({
      where: { slug: couponCode.trim().toLowerCase() },
    });

    if (
      !promotion ||
      !promotion.active ||
      (promotion.startsAt !== null && promotion.startsAt > now) ||
      (promotion.endsAt !== null && promotion.endsAt <= now)
    ) {
      return 0;
    }

    if (promotion.percentOff !== null) {
      // Rounded down, so rounding always favours the customer's total being
      // predictable rather than a fraction of an agora appearing from nowhere.
      return Math.floor((subtotalMinor * promotion.percentOff) / 100);
    }

    if (promotion.amountOffMinor !== null) {
      return Math.min(subtotalMinor, promotion.amountOffMinor);
    }

    return 0;
  }

  private toLine(offer: PricedOffer, quantity: number): PricedLine {
    const unitPriceMinor = offer.priceAmountMinor;
    const isCoins = offer.product.type === 'GAME_CURRENCY';
    return {
      // Stable across requests for the same offer, so the client can reconcile
      // a line without the server holding cart state.
      id: `line_${offer.id}`,
      offer,
      quantity,
      unitPriceMinor,
      totalPriceMinor: unitPriceMinor * quantity,
      currency: offer.priceCurrency,
      // Stated by the server so the cart can say what it delivers without
      // looking the variant up again, and so a custom amount, whose variant is
      // hidden from the catalog, still shows its coins.
      coins: isCoins ? (offer.variant.quantityValue ?? 0) * quantity : 0,
      bonusCoins: isCoins ? launchBonusOf(offer.variant.metadata) * quantity : 0,
    };
  }

  private requireValidQuantity(value: unknown): number {
    const quantity = Number(value);

    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
      throw badRequestError('Quantity must be a whole number of at least 1', 'INVALID_QUANTITY');
    }

    if (quantity > ABSOLUTE_MAX_QUANTITY) {
      throw badRequestError(
        `Quantity may not exceed ${ABSOLUTE_MAX_QUANTITY}`,
        'INVALID_QUANTITY',
      );
    }

    return quantity;
  }

  /**
   * An offer is purchasable only if every layer above it is live.
   *
   * A disabled product with a stale active offer must not be sellable, which is
   * why this checks the product and variant rather than the offer alone.
   */
  private requirePurchasable(offer: PricedOffer): void {
    if (!offer.active || !offer.product.active || !offer.variant.active) {
      throw notFoundError(`Offer ${offer.id} is not available`, 'OFFER_NOT_FOUND');
    }

    if (offer.fulfillmentMethod === 'NOT_SUPPORTED') {
      // We do not know how to deliver it, so we do not sell it.
      throw badRequestError(
        `Offer ${offer.id} has no supported fulfillment method`,
        'OFFER_UNAVAILABLE',
      );
    }
  }

  private requireAvailable(offer: PricedOffer, quantity: number): void {
    const allowed = this.availableQuantity(offer);

    if (allowed <= 0) {
      throw badRequestError(`Offer ${offer.id} is out of stock`, 'OFFER_UNAVAILABLE');
    }

    if (quantity > allowed) {
      throw badRequestError(
        `Only ${allowed} of offer ${offer.id} may be ordered`,
        'INSUFFICIENT_STOCK',
      );
    }
  }

  /**
   * How many of an offer may be bought right now.
   *
   * Reserved units are subtracted because they belong to somebody else's
   * checkout, and the per-order cap applies on top. An offer with no inventory
   * row yields zero rather than unlimited: not knowing the stock is a reason not
   * to sell, not a reason to sell freely.
   */
  private availableQuantity(offer: PricedOffer): number {
    const cap = Math.min(offer.maxPerOrder, ABSOLUTE_MAX_QUANTITY);

    if (!offer.inventory) {
      return 0;
    }

    if (offer.inventory.status === 'OUT_OF_STOCK' || offer.inventory.status === 'DISCONTINUED') {
      return 0;
    }

    if (offer.inventory.quantityAvailable === null) {
      // Unlimited stock, which is the normal case for a service fulfilled by
      // hand rather than from a pool of codes.
      return cap;
    }

    const free = offer.inventory.quantityAvailable - offer.inventory.quantityReserved;
    return Math.max(0, Math.min(cap, free));
  }

  private async loadOffer(offerId: string): Promise<PricedOffer> {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        inventory: true,
        product: true,
        variant: true,
        platform: true,
        region: true,
      },
    });

    if (!offer) {
      // Same answer as a disabled offer: an id that is not for sale tells the
      // caller nothing about whether it ever existed.
      throw notFoundError(`Offer ${offerId} not found`, 'OFFER_NOT_FOUND');
    }

    return offer as PricedOffer;
  }

  private async loadOffers(offerIds: readonly string[]): Promise<PricedOffer[]> {
    const offers = await this.prisma.offer.findMany({
      where: { id: { in: [...offerIds] } },
      include: {
        inventory: true,
        product: true,
        variant: true,
        platform: true,
        region: true,
      },
    });

    return offers as PricedOffer[];
  }

  /**
   * Everything this cart needs to ask the customer.
   *
   * Offers store only what is specific to them, such as a player id for an
   * in-game service. The fields every order needs regardless of contents are
   * added here, which matters most for the email address: without it there is
   * nowhere to send the code, and an offer that simply forgot to declare it
   * would otherwise produce a checkout that completes with no way to deliver.
   *
   * This mirrors `requirementsForCart` in the frontend deliberately, so the two
   * ask for the same things and neither can be bypassed by using the other.
   */
  requirementsFor(offers: readonly PricedOffer[]) {
    const byKey = new Map<string, ReturnType<typeof sanitizeRequirements>[number]>();

    for (const requirement of BASE_REQUIREMENTS) {
      byKey.set(requirement.key, requirement);
    }

    for (const offer of offers) {
      for (const requirement of sanitizeRequirements(offer.checkoutRequirements)) {
        const existing = byKey.get(requirement.key);
        // When two offers both ask for a field, the stricter wins: required
        // beats optional, so removing an item can never quietly relax a rule
        // another item still depends on.
        if (!existing || (requirement.required && !existing.required)) {
          byKey.set(requirement.key, requirement);
        }
      }
    }

    // Terms last, because it is the final thing a customer agrees to.
    byKey.delete(TERMS_REQUIREMENT.key);
    return [...byKey.values(), TERMS_REQUIREMENT];
  }
}
