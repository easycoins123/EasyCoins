import { Injectable } from '@nestjs/common';
import type { CustomerSession, Prisma } from '@prisma/client';

import { conflictError, validationError } from '../../common/errors/api-error';
import { generateId } from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { PrismaService } from '../../database/prisma.service';
import { CheckoutService } from '../checkout/checkout.service';
import type { CartBenefits } from '../cart/pricing.service';
import { RewardsService } from '../growth/rewards.service';
import { CreatorCodesService } from '../pricing/creator-codes.service';
import { FirstOrderService } from '../pricing/first-order.service';
import { InventoryService } from './inventory.service';

const ENDPOINT = 'POST /orders';

/**
 * Everything an order response needs, loaded with the order itself. The
 * variant's quantity and metadata come along so an item can state the coins
 * it delivers, custom amounts included, without a catalog lookup.
 */
export const ORDER_INCLUDE = {
  items: {
    orderBy: { id: 'asc' },
    include: {
      variant: { select: { quantityValue: true, metadata: true } },
      product: { select: { type: true, metadata: true } },
    },
  },
  fulfillments: { orderBy: { id: 'asc' } },
  paymentIntents: { orderBy: { createdAt: 'desc' }, take: 1 },
} as const;

export interface CreateOrderResult {
  readonly orderId: string;
  /** 201 for a new order, 200 when an existing one was returned instead. */
  readonly status: 200 | 201;
}

/**
 * Turning a checkout into an order.
 *
 * Client input: the checkout session id, and nothing else. No price, quantity,
 * offer or product. Everything the order records is re-read from PostgreSQL
 * inside the transaction.
 *
 * Prices come from the checkout session's items, which this server wrote when
 * the session was opened. That is the quote the customer was shown, and it is
 * honoured until the session expires, so a catalog price that moves mid-checkout
 * does not change the amount being approved.
 *
 * Transaction boundary: the order row, its items, every inventory hold, the
 * checkout status change and the idempotency record commit together or not at
 * all. "Order exists but stock was never held" is therefore unreachable.
 *
 * The idempotency claim is the one write outside that transaction. It has to be:
 * a claim that rolled back with the work could not block the concurrent
 * duplicate it exists to block. It is released explicitly on failure.
 */
@Injectable()
export class OrderCreationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
    private readonly inventory: InventoryService,
    private readonly idempotency: IdempotencyService,
    private readonly rewards: RewardsService,
    private readonly firstOrder: FirstOrderService,
    private readonly codes: CreatorCodesService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Creates the order for a checkout session, or returns the one that exists.
   *
   * `idempotencyKey` is required by the contract. Without one a retried request
   * after a timeout would be indistinguishable from a second purchase.
   */
  async createFromCheckout(
    checkoutSessionId: string,
    session: CustomerSession | null,
    idempotencyKey: string | null,
  ): Promise<CreateOrderResult & { replayBody?: unknown }> {
    if (!idempotencyKey) {
      throw validationError(
        'Idempotency-Key is required when creating an order',
        [],
        'IDEMPOTENCY_KEY_REQUIRED',
      );
    }

    // Ownership first, and with the same rule as reading an order: a checkout
    // that is not yours is not found. This runs before the idempotency claim so
    // a stranger cannot use a key to learn that a session exists.
    const checkout = await this.checkout.requireOwned(checkoutSessionId, session);

    // A checkout yields exactly one order. Answering with the existing one is
    // the documented behaviour and costs nothing, so it is checked before any
    // work is claimed.
    const existing = await this.prisma.order.findUnique({
      where: { checkoutSessionId },
      select: { id: true },
    });
    if (existing) {
      // Logged as `checkoutId`: `checkoutSessionId` matches the redaction rule
      // for session material and would be blanked, and this id is the single
      // most useful field for tracing an order later. It is not a credential;
      // ownership is checked on every read.
      this.logger.info('order creation returned the existing order', {
        orderId: existing.id,
        checkoutId: checkoutSessionId,
      });
      return { orderId: existing.id, status: 200 };
    }

    const fingerprint = this.idempotency.fingerprint({ endpoint: ENDPOINT, checkoutSessionId });
    const claim = await this.idempotency.claim(idempotencyKey, ENDPOINT, fingerprint);

    if (claim.kind === 'replay') {
      this.logger.info('order creation replayed a stored response', {
        checkoutId: checkoutSessionId,
      });
      return {
        orderId: this.orderIdFrom(claim.body),
        status: claim.status === 201 ? 201 : 200,
        replayBody: claim.body,
      };
    }

    try {
      const orderId = await this.write(checkout.id, session, idempotencyKey);
      return { orderId, status: 201 };
    } catch (error) {
      // Nothing was committed, so the key must not stay claimed: the customer
      // has to be able to try again.
      await this.idempotency.release(idempotencyKey, ENDPOINT);
      throw error;
    }
  }

  /**
   * The transaction.
   *
   * Everything here either commits together or leaves no trace.
   */
  private async write(
    checkoutSessionId: string,
    session: CustomerSession | null,
    idempotencyKey: string,
  ): Promise<string> {
    const orderId = generateId('ord');

    await this.prisma.runInTransaction(async (tx) => {
      // Re-read inside the transaction. What was validated a moment ago outside
      // it is not what this transaction sees, and the order must be built from
      // the latter.
      const checkout = await tx.checkoutSession.findUniqueOrThrow({
        where: { id: checkoutSessionId },
        include: { items: { include: { offer: true } }, order: { select: { id: true } } },
      });

      if (checkout.order) {
        throw conflictError('This checkout already has an order', 'ORDER_ALREADY_EXISTS');
      }

      this.requireConvertible(checkout);

      const contactEmail = this.requireContactEmail(checkout.contactValues);
      const lines = await this.revalidateLines(tx, checkout.items);
      const totals = this.recomputeTotals(checkout, lines);

      let benefits = (checkout.benefitsSnapshot as unknown as CartBenefits | null) ?? null;
      const rewardCoins = checkout.rewardId ? benefits?.rewardCoins ?? 0 : 0;

      // The welcome benefit was decided before the email was known. Now it
      // is: a customer whose email already has a paid order is not on their
      // first order, and the coins come off before the order is written.
      let campaignCoins = benefits?.campaignId ? benefits.campaignCoins ?? 0 : 0;
      const campaignId = benefits?.campaignId ?? null;
      if (campaignId && campaignCoins > 0) {
        const stillFirst = await this.firstOrder.isFirstOrder(
          tx,
          { customerId: session?.customerId ?? null, sessionId: session?.id ?? null },
          contactEmail,
          orderId,
        );
        if (!stillFirst && benefits) {
          const welcome = benefits.applied.find((benefit) => benefit.kind === 'FIRST_ORDER');
          benefits = {
            ...benefits,
            applied: benefits.applied.filter((benefit) => benefit.kind !== 'FIRST_ORDER'),
            rejected: [
              ...benefits.rejected,
              {
                kind: 'FIRST_ORDER',
                label: welcome?.label ?? { he: 'הטבת ההצטרפות', en: 'Welcome benefit' },
                code: 'FIRST_ORDER_ONLY',
                reason: { he: 'הטבת ההצטרפות היא להזמנה הראשונה בלבד, וכתובת האימייל הזו כבר הזמינה.', en: 'The welcome benefit is for a first order only, and this email has ordered before.' },
              },
            ],
            campaignId: null,
            campaignCoins: 0,
          };
          campaignCoins = 0;
        }
      }

      const orderNumber = await this.nextOrderNumber(tx);

      await tx.order.create({
        data: {
          id: orderId,
          orderNumber,
          customerId: session?.customerId ?? null,
          sessionId: session?.id ?? null,
          checkoutSessionId: checkout.id,
          contactEmail,
          status: 'PENDING_PAYMENT',
          regionId: checkout.regionId,
          currency: checkout.currency,
          subtotalMinor: totals.subtotalMinor,
          discountMinor: totals.discountMinor,
          totalMinor: totals.totalMinor,
          // What the order owes beyond its lines: the reward it used and the
          // coins that reward adds to the delivery. Fulfillment reads this.
          metadata: {
            ...(checkout.rewardId ? { rewardId: checkout.rewardId } : {}),
            ...(rewardCoins > 0 ? { rewardCoins } : {}),
            ...(campaignCoins > 0 && campaignId ? { campaignId, campaignCoins } : {}),
            ...(benefits ? { benefits: benefits as unknown as Prisma.InputJsonValue } : {}),
          } as Prisma.InputJsonValue,
          // The order carries its own copy of what was quoted. Reading it later
          // never touches the catalog, so a price change cannot rewrite history.
          pricingSnapshot: {
            quotedAt: checkout.createdAt.toISOString(),
            orderedAt: new Date().toISOString(),
            currency: checkout.currency,
            subtotalMinor: totals.subtotalMinor,
            discountMinor: totals.discountMinor,
            totalMinor: totals.totalMinor,
            couponCode: checkout.couponCode,
            rewardId: checkout.rewardId,
            lines: lines.map((line) => ({
              offerId: line.offerId,
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor,
              totalPriceMinor: line.totalPriceMinor,
              // What the catalog said at the moment of ordering, kept beside the
              // quoted price so a later question about a discrepancy can be
              // answered from the record rather than guessed at.
              catalogPriceMinorAtOrder: line.catalogPriceMinor,
            })),
          } satisfies Prisma.InputJsonValue,
          checkoutValues: (checkout.contactValues ?? {}) as Prisma.InputJsonValue,
          couponCode: checkout.couponCode,
        },
      });

      // The reward the checkout froze is held for this order now, in the same
      // transaction and after the order row exists (the hold references it),
      // by a conditional update the customer's ownership is part of. Two
      // orders racing for one credit cannot both take it; an order that fails
      // to write leaves it untouched.
      if (checkout.rewardId) {
        await this.rewards.reserve(tx, checkout.rewardId, orderId, {
          customerId: session?.customerId ?? null,
          sessionId: session?.id ?? null,
        });
      }

      // A code that priced this order is counted once, here, against its
      // coupon row, so caps and creator attribution are facts of the record.
      const couponApplied = benefits?.applied.find((benefit) => benefit.kind === 'COUPON');
      if (checkout.couponCode && couponApplied) {
        await this.codes.recordRedemption(tx, checkout.couponCode, orderId, session?.customerId ?? null, totals.discountMinor);
      }

      await tx.orderItem.createMany({
        data: lines.map((line) => ({
          id: generateId('oi'),
          orderId,
          offerId: line.offerId,
          productId: line.productId,
          variantId: line.variantId,
          platformId: line.platformId,
          regionId: line.regionId,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          totalPriceMinor: line.totalPriceMinor,
          displayName: line.displayName as Prisma.InputJsonValue,
          displayVariant: line.displayVariant as Prisma.InputJsonValue,
          imageUrl: line.imageUrl,
          fulfillmentMethod: line.fulfillmentMethod,
          fulfillmentStatus: 'PENDING',
        })),
      });

      // Stock is held last, so a sold-out line aborts the whole order rather
      // than leaving a half-reserved one behind.
      await this.inventory.reserveAll(
        tx,
        lines.map((line) => ({ offerId: line.offerId, quantity: line.quantity })),
        { checkoutSessionId: checkout.id, orderId },
      );

      await tx.checkoutSession.update({
        where: { id: checkout.id },
        data: { status: 'PAYMENT_PENDING' },
      });

      // Recorded in the same transaction as the order it describes.
      await this.idempotency.complete(idempotencyKey, ENDPOINT, 201, { orderId }, tx);
    });

    this.logger.info('order created', {
      orderId,
      checkoutId: checkoutSessionId,
      authenticated: session?.customerId !== null && session?.customerId !== undefined,
    });

    return orderId;
  }

  /** A checkout can only become an order from the state that means "ready". */
  private requireConvertible(checkout: {
    status: string;
    expiresAt: Date;
    items: unknown[];
  }): void {
    if (checkout.expiresAt <= new Date()) {
      throw conflictError('This checkout has expired', 'SESSION_EXPIRED');
    }

    if (checkout.items.length === 0) {
      throw validationError('This checkout has no items', [], 'EMPTY_CART');
    }

    if (checkout.status === 'PAYMENT_PENDING' || checkout.status === 'COMPLETED') {
      throw conflictError('This checkout has already been ordered', 'SESSION_NOT_OPEN');
    }

    if (checkout.status !== 'READY_FOR_PAYMENT') {
      // OPEN means the customer still has fields to fill in. Converting it would
      // create an order with no way to deliver it.
      throw conflictError(
        'This checkout is not ready for payment',
        'SESSION_NOT_OPEN',
      );
    }
  }

  /**
   * An order needs somewhere to send what was bought.
   *
   * Checkout validation already requires an address, so reaching this without
   * one means the snapshot is inconsistent, and creating the order anyway would
   * produce a sale nobody could deliver.
   */
  private requireContactEmail(values: unknown): string {
    const record = (values ?? {}) as Record<string, unknown>;
    const email = record['EMAIL'];

    if (typeof email !== 'string' || email.trim() === '') {
      throw validationError(
        'This checkout has no contact email',
        [
          {
            field: 'EMAIL',
            message: { he: 'נדרשת כתובת אימייל ליצירת קשר.', en: 'A contact email is required.' },
          },
        ],
        'MISSING_CONTACT_EMAIL',
      );
    }

    return email.trim().toLowerCase();
  }

  /**
   * Confirms every line is still something we are willing to sell.
   *
   * Prices come from the checkout snapshot, not from the offer: the quote holds.
   * What is re-checked is whether the thing can be sold at all, which is a
   * different question from what it costs.
   */
  private async revalidateLines(
    tx: Prisma.TransactionClient,
    items: readonly {
      offerId: string;
      quantity: number;
      unitPriceMinor: number;
      totalPriceMinor: number;
      platformId: string;
      regionId: string;
      fulfillmentMethod: string;
      displayName: unknown;
      displayVariant: unknown;
      imageUrl: string | null;
      offer: { id: string; active: boolean; productId: string; variantId: string; priceAmountMinor: number; fulfillmentMethod: string };
    }[],
  ) {
    const offerIds = items.map((item) => item.offerId);

    const offers = await tx.offer.findMany({
      where: { id: { in: offerIds } },
      include: {
        product: { select: { active: true } },
        variant: { select: { active: true } },
      },
    });
    const byId = new Map(offers.map((offer) => [offer.id, offer]));

    return items.map((item) => {
      const offer = byId.get(item.offerId);

      if (!offer || !offer.active || !offer.product.active || !offer.variant.active) {
        throw conflictError(
          `Offer ${item.offerId} is no longer available`,
          'CART_INVALID',
        );
      }

      if (offer.fulfillmentMethod === 'NOT_SUPPORTED') {
        throw conflictError(
          `Offer ${item.offerId} has no supported fulfillment method`,
          'CART_INVALID',
        );
      }

      if (item.quantity < 1) {
        throw validationError('A line must have a positive quantity', [], 'CART_INVALID');
      }

      // The stored line has to be internally consistent. If it is not, the
      // snapshot is corrupt and charging from it would be indefensible.
      if (item.unitPriceMinor * item.quantity !== item.totalPriceMinor) {
        throw conflictError(
          `Line total for offer ${item.offerId} does not match its unit price`,
          'CART_INVALID',
        );
      }

      if (offer.priceAmountMinor !== item.unitPriceMinor) {
        // Not an error. The customer is charged what they were quoted; this is
        // recorded so the difference is explainable later.
        this.logger.info('catalog price moved after the quote', {
          offerId: offer.id,
          quotedMinor: item.unitPriceMinor,
          catalogMinor: offer.priceAmountMinor,
        });
      }

      return {
        offerId: item.offerId,
        productId: offer.productId,
        variantId: offer.variantId,
        platformId: item.platformId,
        regionId: item.regionId,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        totalPriceMinor: item.totalPriceMinor,
        catalogPriceMinor: offer.priceAmountMinor,
        displayName: item.displayName,
        displayVariant: item.displayVariant,
        imageUrl: item.imageUrl,
        fulfillmentMethod: item.fulfillmentMethod as never,
      };
    });
  }

  /**
   * Adds the lines up again rather than copying the session's totals.
   *
   * The session totals were computed by this server, but recomputing costs one
   * loop and means a corrupted or hand-edited session row cannot become the
   * amount a customer is charged.
   */
  private recomputeTotals(
    checkout: { subtotalMinor: number; discountMinor: number; totalMinor: number },
    lines: readonly { totalPriceMinor: number }[],
  ) {
    const subtotalMinor = lines.reduce((sum, line) => sum + line.totalPriceMinor, 0);

    if (subtotalMinor !== checkout.subtotalMinor) {
      throw conflictError(
        'The checkout total does not match its own lines',
        'CART_INVALID',
      );
    }

    const discountMinor = Math.max(0, Math.min(checkout.discountMinor, subtotalMinor));
    const totalMinor = subtotalMinor - discountMinor;

    if (totalMinor !== checkout.totalMinor) {
      throw conflictError(
        'The checkout total does not match its subtotal and discount',
        'CART_INVALID',
      );
    }

    return { subtotalMinor, discountMinor, totalMinor };
  }

  /**
   * The next customer-facing reference.
   *
   * A sequence rather than a count, because two concurrent orders counting rows
   * would both see the same number. Gaps from rolled-back transactions are
   * expected and preferable to a collision.
   */
  private async nextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    const [row] = await tx.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval('order_number_seq') AS nextval
    `;
    return `EC-${row.nextval.toString().padStart(6, '0')}`;
  }

  private orderIdFrom(body: unknown): string {
    if (body && typeof body === 'object' && typeof (body as Record<string, unknown>)['orderId'] === 'string') {
      return (body as Record<string, string>)['orderId'];
    }
    throw conflictError('A stored idempotent response could not be read', 'IDEMPOTENCY_REPLAY_FAILED');
  }
}
