import { Injectable } from '@nestjs/common';
import type { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';

import { conflictError } from '../../common/errors/api-error';
import { generateId } from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { AutoFulfillmentService } from '../fulfillment/auto-fulfillment.service';
import { GrowthEventsService } from '../growth/growth-events.service';
import { RewardsService } from '../growth/rewards.service';
import { InventoryService } from '../orders/inventory.service';
import { NotificationService } from '../notifications/notification.service';
import { ProviderPaymentStatus } from './providers/payment-provider';

/** Payment states from which a payment can still move. */
const LIVE_PAYMENT_STATES: PaymentStatus[] = ['CREATED', 'REQUIRES_ACTION', 'PROCESSING'];

/** Order states from which an order can still be paid. */
const PAYABLE_ORDER_STATES: OrderStatus[] = ['PENDING_PAYMENT', 'PAYMENT_PROCESSING'];

export interface SettlementOutcome {
  readonly intentId: string;
  readonly orderId: string;
  readonly paymentStatus: PaymentStatus;
  readonly orderStatus: OrderStatus;
  /** False when the event changed nothing, which is the normal duplicate case. */
  readonly changed: boolean;
}

/**
 * The only place that moves an order, its payment and its stock.
 *
 * Controllers do not write statuses. Neither does the provider adapter. Keeping
 * every transition here is what makes the legal combinations enumerable, and it
 * is why a state like "order paid, payment failed, stock still held" cannot be
 * assembled by two callers each doing half a job.
 *
 * The rules, in the order they matter:
 *
 * - A payment settles once. The transition out of a live state is a conditional
 *   UPDATE, so a duplicate webhook changes no rows and is reported as a no-op
 *   rather than applied twice.
 * - Stock is committed in the same transaction that marks the order paid, and
 *   released in the same transaction that cancels it. There is no window in
 *   which the two disagree.
 * - Settlement and expiry both gate on the order row. PostgreSQL serialises the
 *   two updates, so exactly one wins. If expiry wins first, a late success is
 *   still recorded, but the order is marked as needing a refund instead of being
 *   quietly marked paid over released stock.
 * - Notifications are dispatched after the transaction commits, never inside it.
 *   A mail provider being down must not roll back a payment.
 */
@Injectable()
export class PaymentStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationService,
    private readonly autoFulfillment: AutoFulfillmentService,
    private readonly rewards: RewardsService,
    private readonly growth: GrowthEventsService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Applies a provider outcome to an intent.
   *
   * Safe to call with the same outcome any number of times: only the first call
   * moves anything.
   */
  async settle(
    intentId: string,
    providerStatus: ProviderPaymentStatus,
    options: { failureCode?: string; requestId?: string } = {},
  ): Promise<SettlementOutcome> {
    const outcome = await this.prisma.runInTransaction(async (tx) => {
      const intent = await tx.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });

      if (!LIVE_PAYMENT_STATES.includes(intent.status)) {
        // Already terminal. A duplicate delivery lands here and must change
        // nothing at all.
        const order = await tx.order.findUniqueOrThrow({ where: { id: intent.orderId } });
        return {
          intentId,
          orderId: intent.orderId,
          paymentStatus: intent.status,
          orderStatus: order.status,
          changed: false,
        };
      }

      switch (providerStatus) {
        case 'SUCCEEDED':
          return this.applySuccess(tx, intent.id, intent.orderId);
        case 'FAILED':
          return this.applyFailure(tx, intent.id, intent.orderId, options.failureCode);
        case 'CANCELLED':
          return this.applyCancellation(tx, intent.id, intent.orderId);
        case 'PROCESSING':
        case 'REQUIRES_ACTION':
          return this.applyInProgress(tx, intent.id, intent.orderId, providerStatus);
        default:
          // CREATED tells us nothing new.
          return {
            intentId,
            orderId: intent.orderId,
            paymentStatus: intent.status,
            orderStatus: (await tx.order.findUniqueOrThrow({ where: { id: intent.orderId } })).status,
            changed: false,
          };
      }
    });

    if (outcome.changed) {
      this.logger.info('payment settled', {
        intentId: outcome.intentId,
        orderId: outcome.orderId,
        paymentStatus: outcome.paymentStatus,
        orderStatus: outcome.orderStatus,
      });

      // Outside the transaction on purpose. A notification failure is logged and
      // dropped; it can never undo a payment that has already committed.
      await this.notifyAfterCommit(outcome);
    }

    return outcome;
  }

  /**
   * The order is paid: commit the stock and hand it to fulfillment.
   *
   * The order update is the gate. If it changes no rows the order left the
   * payable states while this was running, which in practice means expiry got
   * there first.
   */
  private async applySuccess(
    tx: Prisma.TransactionClient,
    intentId: string,
    orderId: string,
  ): Promise<SettlementOutcome> {
    const claimedPayment = await tx.paymentIntent.updateMany({
      where: { id: intentId, status: { in: LIVE_PAYMENT_STATES } },
      data: { status: 'SUCCEEDED', failureCode: null },
    });

    if (claimedPayment.count !== 1) {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      return {
        intentId,
        orderId,
        paymentStatus: 'SUCCEEDED',
        orderStatus: order.status,
        changed: false,
      };
    }

    const claimedOrder = await tx.order.updateMany({
      where: { id: orderId, status: { in: PAYABLE_ORDER_STATES } },
      data: { status: 'PAID' },
    });

    if (claimedOrder.count !== 1) {
      // Expiry won the race and the stock has already gone back on the shelf.
      // The money is real, so the payment stays SUCCEEDED and the order is
      // flagged for a refund. Marking it paid here would claim we hold stock we
      // released, and silently discarding the success would lose a payment.
      await tx.order.updateMany({
        where: { id: orderId, status: { in: ['CANCELLED', 'FAILED'] } },
        data: {
          status: 'REFUND_PENDING',
          statusMessage: {
            he: 'התשלום התקבל לאחר שההזמנה בוטלה. ההזמנה ממתינה לזיכוי.',
            en: 'Payment arrived after the order was cancelled. A refund is pending.',
          },
        },
      });
      // The order will be refunded, so a reward it was holding goes back.
      await this.rewards.releaseForOrder(tx, orderId);

      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      this.logger.warn('payment succeeded after the order was already closed', {
        intentId,
        orderId,
        orderStatus: order.status,
      });

      return {
        intentId,
        orderId,
        paymentStatus: 'SUCCEEDED',
        orderStatus: order.status,
        changed: true,
      };
    }

    // Same transaction as the order status, so paid and committed are one fact.
    await this.inventory.commit(tx, orderId);
    await this.openFulfillments(tx, orderId);
    // A reward the order was holding is spent by the same fact.
    await this.rewards.redeemForOrder(tx, orderId);

    await tx.order.update({
      where: { id: orderId },
      data: { status: 'FULFILLMENT_PENDING', paidAt: new Date() },
    });

    await tx.checkoutSession.updateMany({
      where: { order: { id: orderId } },
      data: { status: 'COMPLETED' },
    });

    return {
      intentId,
      orderId,
      paymentStatus: 'SUCCEEDED',
      orderStatus: 'FULFILLMENT_PENDING',
      changed: true,
    };
  }

  /**
   * The payment was declined.
   *
   * The order stays where it is. A decline is not the end of a purchase: the
   * customer can try another instrument, and their stock stays held until the
   * reservation expires on its own. Releasing it here would punish a customer
   * whose first card was refused.
   */
  private async applyFailure(
    tx: Prisma.TransactionClient,
    intentId: string,
    orderId: string,
    failureCode?: string,
  ): Promise<SettlementOutcome> {
    const claimed = await tx.paymentIntent.updateMany({
      where: { id: intentId, status: { in: LIVE_PAYMENT_STATES } },
      data: { status: 'FAILED', failureCode: failureCode ?? null },
    });

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });

    return {
      intentId,
      orderId,
      paymentStatus: 'FAILED',
      orderStatus: order.status,
      changed: claimed.count === 1,
    };
  }

  /** The customer walked away: cancel the order and put the stock back. */
  private async applyCancellation(
    tx: Prisma.TransactionClient,
    intentId: string,
    orderId: string,
  ): Promise<SettlementOutcome> {
    const claimed = await tx.paymentIntent.updateMany({
      where: { id: intentId, status: { in: LIVE_PAYMENT_STATES } },
      data: { status: 'CANCELLED' },
    });

    if (claimed.count !== 1) {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      return { intentId, orderId, paymentStatus: 'CANCELLED', orderStatus: order.status, changed: false };
    }

    const claimedOrder = await tx.order.updateMany({
      where: { id: orderId, status: { in: PAYABLE_ORDER_STATES } },
      data: { status: 'CANCELLED' },
    });

    if (claimedOrder.count === 1) {
      await this.inventory.release(tx, orderId);
      await this.growth.onOrderClosed(tx, orderId);
    }

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    return { intentId, orderId, paymentStatus: 'CANCELLED', orderStatus: order.status, changed: true };
  }

  private async applyInProgress(
    tx: Prisma.TransactionClient,
    intentId: string,
    orderId: string,
    providerStatus: 'PROCESSING' | 'REQUIRES_ACTION',
  ): Promise<SettlementOutcome> {
    const claimed = await tx.paymentIntent.updateMany({
      where: { id: intentId, status: { in: LIVE_PAYMENT_STATES } },
      data: { status: providerStatus },
    });

    await tx.order.updateMany({
      where: { id: orderId, status: 'PENDING_PAYMENT' },
      data: { status: 'PAYMENT_PROCESSING' },
    });

    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    return {
      intentId,
      orderId,
      paymentStatus: providerStatus,
      orderStatus: order.status,
      changed: claimed.count === 1,
    };
  }

  /**
   * Opens a fulfillment record per order item.
   *
   * They start PENDING and nothing advances them yet. No code is invented and
   * nothing is marked delivered: an operator, or a supplier integration that
   * does not exist, has to do that.
   */
  private async openFulfillments(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const items = await tx.orderItem.findMany({ where: { orderId }, select: { id: true, fulfillmentMethod: true } });

    for (const item of items) {
      // The unique constraint on order_item_id is the real guard; skipping
      // duplicates keeps a re-run from failing the whole transaction.
      await tx.fulfillment.createMany({
        data: {
          id: generateId('ful'),
          orderId,
          orderItemId: item.id,
          method: item.fulfillmentMethod,
          status: 'PENDING',
        },
        skipDuplicates: true,
      });
    }
  }

  /**
   * Expires payments that were never completed, and frees what they held.
   *
   * Safe to run concurrently with itself and with settlement. Each intent is
   * claimed by a conditional UPDATE, and each order by another, so two instances
   * sweeping at once divide the work rather than duplicating it.
   */
  async expireStalePayments(olderThan: Date): Promise<{ intents: number; ordersCancelled: number }> {
    const claimed = await this.prisma.$queryRaw<{ id: string; order_id: string }[]>`
      UPDATE payment_intents
         SET status = 'EXPIRED', updated_at = NOW()
       WHERE status IN ('CREATED', 'REQUIRES_ACTION')
         AND created_at <= ${olderThan}
      RETURNING id, order_id
    `;

    let ordersCancelled = 0;

    for (const intent of claimed) {
      await this.prisma.runInTransaction(async (tx) => {
        const stillLive = await tx.paymentIntent.count({
          where: { orderId: intent.order_id, status: { in: LIVE_PAYMENT_STATES } },
        });

        if (stillLive > 0) {
          // Another attempt is under way for this order, so the order itself is
          // not abandoned.
          return;
        }

        const cancelled = await tx.order.updateMany({
          where: { id: intent.order_id, status: { in: PAYABLE_ORDER_STATES } },
          data: {
            status: 'CANCELLED',
            statusMessage: {
              he: 'ההזמנה בוטלה מכיוון שהתשלום לא הושלם בזמן.',
              en: 'The order was cancelled because payment was not completed in time.',
            },
          },
        });

        if (cancelled.count === 1) {
          await this.inventory.release(tx, intent.order_id);
          await this.growth.onOrderClosed(tx, intent.order_id);
          ordersCancelled += 1;
        }
      });
    }

    if (claimed.length > 0) {
      this.logger.info('expired stale payments', {
        intents: claimed.length,
        ordersCancelled,
      });
    }

    return { intents: claimed.length, ordersCancelled };
  }

  /** Refuses a transition the state machine does not allow. */
  assertPayable(orderStatus: OrderStatus): void {
    if (!PAYABLE_ORDER_STATES.includes(orderStatus)) {
      throw conflictError(
        `An order in ${orderStatus} cannot be paid`,
        orderStatus === 'PAID' || orderStatus === 'FULFILLMENT_PENDING'
          ? 'ORDER_ALREADY_PAID'
          : 'ORDER_NOT_PAYABLE',
      );
    }
  }

  private async notifyAfterCommit(outcome: SettlementOutcome): Promise<void> {
    if (outcome.orderStatus === 'FULFILLMENT_PENDING') {
      // Runs before the notification so the customer's email can carry the
      // listing instruction rather than "we will be in touch". Best-effort and
      // self-contained: a failure here leaves the job in the operator queue.
      try {
        await this.autoFulfillment.planOrder(outcome.orderId);
      } catch (error) {
        this.logger.error('automatic fulfillment planning failed', {
          orderId: outcome.orderId,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }

      // What a paid order earns: the EasyDrop, a founders seat, a streak step,
      // a referral, a campaign reward. After the commit, never inside it, and
      // every step idempotent, so a replayed event earns nothing twice.
      try {
        await this.growth.onOrderPaid(outcome.orderId);
      } catch (error) {
        this.logger.error('growth programmes failed after payment', {
          orderId: outcome.orderId,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    try {
      if (outcome.orderStatus === 'FULFILLMENT_PENDING') {
        await this.notifications.orderPaid(outcome.orderId);
      } else if (outcome.orderStatus === 'CANCELLED') {
        await this.notifications.orderCancelled(outcome.orderId);
      }
    } catch (error) {
      // Deliberately swallowed. The payment is committed; a failed notification
      // is an operational problem, not a reason to unwind money.
      this.logger.error('failed to send an order notification', {
        orderId: outcome.orderId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
