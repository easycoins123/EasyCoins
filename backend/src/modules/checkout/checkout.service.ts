import { Injectable } from '@nestjs/common';
import type { CheckoutItem, CheckoutSession, CustomerSession, Prisma } from '@prisma/client';

import { badRequestError, notFoundError } from '../../common/errors/api-error';
import {
  CheckoutRequirement,
  FIELD_MAX_LENGTH,
  isBooleanField,
  isCheckoutFieldKey,
} from '../../common/checkout/requirement-keys';
import { generateId } from '../../common/crypto/tokens';
import { PrismaService } from '../../database/prisma.service';
import { PricingService, RequestedLine } from '../cart/pricing.service';
import { ownerOfSession } from '../growth/growth-shared';

/** How long a checkout session stays usable. Prices are only honoured this long. */
const CHECKOUT_TTL_MINUTES = 30;

/**
 * A checkout plus its lines, each carrying the product and variant its offer
 * points at. Loaded together so the response never needs a second query. The
 * variant's quantity and metadata ride along so the response can state the
 * coins each line delivers without a catalog lookup.
 */
export const CHECKOUT_INCLUDE = {
  items: {
    include: {
      offer: {
        select: {
          productId: true,
          variantId: true,
          variant: { select: { quantityValue: true, metadata: true } },
          product: { select: { type: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
  },
} as const;

export type CheckoutItemWithOffer = CheckoutItem & {
  offer: {
    productId: string;
    variantId: string;
    variant: { quantityValue: number | null; metadata: unknown };
    product: { type: string };
  };
};

export type CheckoutSessionWithItems = CheckoutSession & { items: CheckoutItemWithOffer[] };

export interface FieldIssue {
  readonly field: string;
  readonly message: { he: string; en: string };
}

/**
 * Checkout, owned by the server.
 *
 * Creating a session freezes what the customer is buying and what it costs, at
 * prices this service resolved from the catalog. From that point the client can
 * only read the session and submit contact details against it. It cannot alter a
 * line, a price or a total, because no endpoint accepts one.
 *
 * The snapshot exists so that a price change mid-checkout does not silently
 * move the amount a customer is about to approve. What they saw is what the
 * session holds, until it expires.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Opens a checkout session from a cart.
   *
   * The cart arrives as offer ids and quantities. Everything else, including
   * every figure the customer will be asked to approve, is computed here.
   */
  async createSession(
    requested: readonly RequestedLine[],
    options: { session: CustomerSession; couponCode?: string | null; rewardId?: string | null },
  ): Promise<CheckoutSessionWithItems> {
    const priced = await this.pricing.priceCart(requested, {
      couponCode: options.couponCode,
      rewardId: options.rewardId,
      owner: ownerOfSession(options.session),
    });
    const couponApplied = priced.benefits.applied.some((benefit) => benefit.kind === 'COUPON');

    if (priced.lines.length === 0) {
      throw badRequestError('Cannot open a checkout with an empty cart', 'CART_EMPTY');
    }

    const currencies = new Set(priced.lines.map((line) => line.currency));
    if (currencies.size > 1) {
      // One session carries one total, so it carries one currency. Mixing them
      // would mean adding sums that are not comparable.
      throw badRequestError(
        'A checkout may not mix currencies',
        'MIXED_CURRENCY_CART',
      );
    }

    const requirements = this.pricing.requirementsFor(priced.lines.map((line) => line.offer));
    const sessionId = generateId('cs');

    // One transaction: a session without its items would be a checkout for
    // nothing, and a partial write here becomes a wrong total later.
    return this.prisma.runInTransaction(async (tx) => {
      await tx.checkoutSession.create({
        data: {
          id: sessionId,
          customerId: options.session.customerId,
          sessionId: options.session.id,
          status: 'OPEN',
          currency: priced.currency,
          regionId: priced.lines[0].offer.regionId,
          subtotalMinor: priced.subtotalMinor,
          discountMinor: priced.discountMinor,
          totalMinor: priced.totalMinor,
          // Only a code the stacking policy accepted is recorded; a code that
          // was set aside is not on the order and must not look as if it were.
          couponCode: couponApplied ? options.couponCode ?? null : null,
          // Likewise the reward: the pricing sets `rewardId` only when the
          // reward actually applies, and the snapshot freezes its effect.
          rewardId: priced.benefits.rewardId,
          benefitsSnapshot: priced.benefits as unknown as Prisma.InputJsonValue,
          pricingSnapshot: {
            pricedAt: new Date().toISOString(),
            lines: priced.lines.map((line) => ({
              offerId: line.offer.id,
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor,
              totalPriceMinor: line.totalPriceMinor,
            })),
          } satisfies Prisma.InputJsonValue,
          requirementsSnapshot: requirements as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + CHECKOUT_TTL_MINUTES * 60 * 1000),
        },
      });

      await tx.checkoutItem.createMany({
        data: priced.lines.map((line) => ({
          id: generateId('ci'),
          checkoutSessionId: sessionId,
          offerId: line.offer.id,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          totalPriceMinor: line.totalPriceMinor,
          regionId: line.offer.regionId,
          platformId: line.offer.platformId,
          fulfillmentMethod: line.offer.fulfillmentMethod,
          displayName: line.offer.product.name as Prisma.InputJsonValue,
          displayVariant: line.offer.variant.name as Prisma.InputJsonValue,
          imageUrl: this.primaryImage(line.offer.product.images),
        })),
      });

      return (await tx.checkoutSession.findUniqueOrThrow({
        where: { id: sessionId },
        include: CHECKOUT_INCLUDE,
      })) as CheckoutSessionWithItems;
    });
  }

  /**
   * Loads a checkout session the caller owns.
   *
   * Not found rather than forbidden, for the same reason as orders: confirming
   * that a session id exists is information a stranger has no right to.
   */
  async requireOwned(
    checkoutSessionId: string,
    session: CustomerSession | null,
  ): Promise<CheckoutSessionWithItems> {
    const checkout = (await this.prisma.checkoutSession.findUnique({
      where: { id: checkoutSessionId },
      include: CHECKOUT_INCLUDE,
    })) as CheckoutSessionWithItems | null;

    if (!checkout || !this.canRead(checkout, session)) {
      throw notFoundError(
        `Checkout ${checkoutSessionId} not readable by this caller`,
        'CHECKOUT_SESSION_NOT_FOUND',
      );
    }

    return checkout;
  }

  /**
   * The ownership rule, matching orders exactly.
   *
   * A signed-in customer owns their sessions; an anonymous visitor owns the ones
   * their browser session opened. A checkout owned by nobody is unreachable
   * rather than public.
   */
  private canRead(
    checkout: Pick<CheckoutSession, 'customerId' | 'sessionId'>,
    session: CustomerSession | null,
  ): boolean {
    if (!session) {
      return false;
    }

    if (checkout.customerId !== null && session.customerId !== null) {
      return checkout.customerId === session.customerId;
    }

    if (checkout.sessionId !== null) {
      return checkout.sessionId === session.id;
    }

    return false;
  }

  /**
   * Validates submitted details against the session's own requirements.
   *
   * The requirements come from the snapshot rather than from the request, so a
   * client cannot invent a field, and a field the offers never asked for is
   * rejected rather than stored.
   */
  async submitDetails(
    checkout: CheckoutSessionWithItems,
    values: Record<string, unknown>,
  ): Promise<{ checkout: CheckoutSessionWithItems; issues: FieldIssue[] }> {
    if (checkout.expiresAt <= new Date()) {
      throw badRequestError('This checkout has expired', 'CHECKOUT_SESSION_EXPIRED');
    }

    // Details stay editable until the checkout leaves the customer's hands. Once
    // a payment is under way or the order exists, changing the contact details
    // would mean changing where a code is delivered after it was approved.
    if (checkout.status !== 'OPEN' && checkout.status !== 'READY_FOR_PAYMENT') {
      throw badRequestError(
        'This checkout is no longer accepting details',
        'CHECKOUT_SESSION_CLOSED',
      );
    }

    const requirements = this.requirements(checkout);
    const allowed = new Map(requirements.map((requirement) => [requirement.key, requirement]));

    const issues: FieldIssue[] = [];
    const accepted: Record<string, string | boolean> = {};

    for (const [key, raw] of Object.entries(values)) {
      const requirement = isCheckoutFieldKey(key) ? allowed.get(key) : undefined;

      if (!requirement) {
        // A key outside the vocabulary, or one no offer in this checkout asked
        // for, is dropped rather than stored. This is the point at which an
        // invented field stops being customer-facing data.
        issues.push({
          field: key,
          message: {
            he: 'השדה הזה אינו חלק מהתשלום הנוכחי.',
            en: 'That field is not part of this checkout.',
          },
        });
        continue;
      }

      const value = this.coerce(requirement, raw);
      if (value === undefined) {
        issues.push({ field: key, message: this.invalidMessage(requirement) });
        continue;
      }

      accepted[key] = value;
    }

    for (const requirement of requirements) {
      if (!requirement.required) {
        continue;
      }
      const value = accepted[requirement.key];
      const missing =
        value === undefined ||
        (typeof value === 'string' && value.trim() === '') ||
        (isBooleanField(requirement.key) && value !== true);

      if (missing) {
        issues.push({ field: requirement.key, message: this.requiredMessage(requirement) });
      }
    }

    // Details are stored even when incomplete, so a customer who comes back to a
    // half-filled checkout does not start again. The status only advances once
    // there is nothing left to fix.
    const updated = (await this.prisma.checkoutSession.update({
      where: { id: checkout.id },
      data: {
        contactValues: accepted as Prisma.InputJsonValue,
        status: issues.length === 0 ? 'READY_FOR_PAYMENT' : 'OPEN',
      },
      include: CHECKOUT_INCLUDE,
    })) as CheckoutSessionWithItems;

    return { checkout: updated, issues };
  }

  /** The requirements this session froze when it was created. */
  requirements(checkout: CheckoutSession): CheckoutRequirement[] {
    const snapshot = checkout.requirementsSnapshot;
    return Array.isArray(snapshot) ? (snapshot as unknown as CheckoutRequirement[]) : [];
  }

  /**
   * Converts a submitted value to the type its field actually holds.
   *
   * Returns undefined for anything that does not fit, which becomes a field
   * error rather than a stored value of the wrong shape.
   */
  private coerce(
    requirement: CheckoutRequirement,
    raw: unknown,
  ): string | boolean | undefined {
    if (isBooleanField(requirement.key)) {
      // An acknowledgement is either given or not. A string "false" is not
      // consent, and neither is any other truthy-looking value.
      return raw === true || raw === false ? raw : undefined;
    }

    if (typeof raw !== 'string') {
      return undefined;
    }

    const trimmed = raw.trim();
    const limit = Math.min(requirement.maxLength ?? FIELD_MAX_LENGTH[requirement.key], FIELD_MAX_LENGTH[requirement.key]);

    if (trimmed.length > limit) {
      return undefined;
    }

    if (requirement.pattern) {
      try {
        if (trimmed !== '' && !new RegExp(requirement.pattern).test(trimmed)) {
          return undefined;
        }
      } catch {
        // A stored pattern that will not compile is a data problem. Ignoring it
        // keeps checkout working; the length limit above still applies.
      }
    }

    if (requirement.options && requirement.options.length > 0 && trimmed !== '') {
      const permitted = requirement.options.some((option) => option.value === trimmed);
      if (!permitted) {
        return undefined;
      }
    }

    return trimmed;
  }

  private invalidMessage(requirement: CheckoutRequirement) {
    return {
      he: `הערך שהוזן בשדה "${requirement.label.he}" אינו תקין.`,
      en: `The value for "${requirement.label.en ?? requirement.label.he}" is not valid.`,
    };
  }

  private requiredMessage(requirement: CheckoutRequirement) {
    return {
      he: `יש למלא את השדה "${requirement.label.he}".`,
      en: `"${requirement.label.en ?? requirement.label.he}" is required.`,
    };
  }

  private primaryImage(images: unknown): string | null {
    if (!Array.isArray(images) || images.length === 0) {
      return null;
    }
    const first = images[0] as Record<string, unknown> | null;
    return first && typeof first['url'] === 'string' ? first['url'] : null;
  }
}
