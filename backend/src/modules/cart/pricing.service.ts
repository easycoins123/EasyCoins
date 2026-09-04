import { Injectable } from '@nestjs/common';
import type { Inventory, Offer, Platform, Product, ProductVariant, Region } from '@prisma/client';

import { badRequestError, notFoundError } from '../../common/errors/api-error';
import { CheckoutRequirement, sanitizeRequirements } from '../../common/checkout/requirement-keys';
import { PrismaService } from '../../database/prisma.service';

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
}

export interface PricedCart {
  readonly lines: readonly PricedLine[];
  readonly currency: string;
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly totalMinor: number;
  readonly issues: readonly CartIssue[];
}

export interface CartIssue {
  readonly code: string;
  readonly offerId?: string;
  readonly message: { he: string; en: string };
}

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
 * True when the line's variant carries launch bonus coins, set by the catalog
 * seed as `metadata.launchBonus`. The single fact behind "one benefit per order".
 */
function carriesLaunchBonus(line: PricedLine): boolean {
  const metadata = (line.offer as { variant?: { metadata?: unknown } }).variant?.metadata;
  const bonus = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['launchBonus'] : undefined;
  return typeof bonus === 'number' && bonus > 0;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

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
    options: { couponCode?: string | null } = {},
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

    return this.total(lines, options.couponCode ?? null, issues);
  }

  /**
   * Adds up priced lines. The only arithmetic that produces a total.
   *
   * Integer minor units throughout, so there is no floating-point rounding to
   * argue about at the till.
   */
  private async totalise(
    lines: readonly PricedLine[],
    couponCode: string | null,
  ): Promise<{ currency: string; subtotalMinor: number; discountMinor: number; totalMinor: number }> {
    const currency = lines[0]?.currency ?? 'ILS';
    const subtotalMinor = lines.reduce((sum, line) => sum + line.totalPriceMinor, 0);
    // One benefit per order. A line that already carries the launch bonus takes
    // no code, whatever the code is; the storefront only repeats this answer.
    const discountMinor = lines.some(carriesLaunchBonus) ? 0 : await this.discountFor(subtotalMinor, couponCode);

    return {
      currency,
      subtotalMinor,
      discountMinor,
      // Clamped so a misconfigured promotion can never produce a negative total,
      // which is a refund dressed up as a purchase.
      totalMinor: Math.max(0, subtotalMinor - discountMinor),
    };
  }

  private async total(
    lines: readonly PricedLine[],
    couponCode: string | null,
    issues: CartIssue[],
  ): Promise<PricedCart> {
    const totals = await this.totalise(lines, couponCode);

    if (couponCode && lines.length > 0 && lines.some(carriesLaunchBonus)) {
      issues.push({
        code: 'COUPON_NOT_COMBINABLE',
        message: {
          he: 'בונוס ההשקה כבר בהזמנה. הטבה אחת להזמנה.',
          en: 'The launch bonus is already on this order. One benefit per order.',
        },
      });
    } else if (couponCode && totals.discountMinor === 0 && lines.length > 0) {
      issues.push({
        code: 'COUPON_NOT_APPLICABLE',
        message: {
          he: 'הקוד שהוזן אינו תקף לעגלה הזו.',
          en: 'That code does not apply to this cart.',
        },
      });
    }

    return { lines, ...totals, issues };
  }

  /**
   * Resolves a coupon against the database.
   *
   * A code that does not exist, has expired or has not started yet is worth
   * exactly nothing. The client never states a discount, so an invalid code
   * costs the customer nothing and gains them nothing.
   */
  async discountFor(subtotalMinor: number, couponCode: string | null): Promise<number> {
    if (!couponCode || subtotalMinor <= 0) {
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
    return {
      // Stable across requests for the same offer, so the client can reconcile
      // a line without the server holding cart state.
      id: `line_${offer.id}`,
      offer,
      quantity,
      unitPriceMinor,
      totalPriceMinor: unitPriceMinor * quantity,
      currency: offer.priceCurrency,
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
