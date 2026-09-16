import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Fulfillment, FulfillmentStatus } from '@prisma/client';

import { conflictError, notFoundError, validationError } from '../../common/errors/api-error';
import { generateId } from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { planCoinTrades, CoinTradePlanError } from './coin-trade';

/**
 * The operator side of fulfillment.
 *
 * A paid order opens one `fulfillments` row per item, all `PENDING`, and until
 * now nothing moved them. This is what moves them: a queue an operator works
 * through, and the state machine that keeps the moves legal.
 *
 * Three rules hold everywhere in this file:
 *
 * 1. **Every transition is claimed with a conditional UPDATE.** Two operators
 *    hitting "deliver" at the same moment must not both succeed, and the guard
 *    for that is the database, not a check-then-write in application code.
 * 2. **Nothing is delivered before the money is in.** The order's paid state is
 *    re-read inside the transaction, not trusted from when the job was queued.
 *    An order refunded between the two must not deliver.
 * 3. **Every operator action is attributed.** `FulfillmentEvent` records the
 *    transition, `AuditLog` records who did it. A shared login would make both
 *    useless, which is why operator tokens are named.
 */

/** Transitions the state machine permits. Anything absent is rejected. */
const ALLOWED_TRANSITIONS: Readonly<Record<FulfillmentStatus, readonly FulfillmentStatus[]>> = {
  PENDING: ['PROCESSING', 'CANCELLED', 'FAILED'],
  PROCESSING: ['WAITING_FOR_CUSTOMER', 'READY', 'DELIVERED', 'FAILED', 'CANCELLED', 'PENDING'],
  WAITING_FOR_CUSTOMER: ['PROCESSING', 'READY', 'DELIVERED', 'FAILED', 'CANCELLED'],
  READY: ['DELIVERED', 'FAILED', 'CANCELLED'],
  // Terminal. A delivered order that needs undoing goes through refund, which
  // is a money operation, not a fulfillment one.
  DELIVERED: ['REFUNDED'],
  FAILED: ['PENDING', 'CANCELLED', 'REFUNDED'],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

/** Order states in which delivering is legitimate. */
const DELIVERABLE_ORDER_STATES = ['PAID', 'PROCESSING', 'FULFILLMENT_PENDING', 'FULFILLMENT_PROCESSING'] as const;

/**
 * Fulfillment states ordered least to most advanced.
 *
 * An order reports the *least* advanced of its items, so an order with one item
 * delivered and one pending is not "delivered". Partial delivery reported as
 * complete is how a customer stops chasing an item they never received.
 */
const PROGRESS_ORDER: readonly FulfillmentStatus[] = [
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PENDING',
  'WAITING_FOR_CUSTOMER',
  'PROCESSING',
  'READY',
  'DELIVERED',
];

export interface Operator {
  readonly name: string;
}

export interface QueueFilters {
  readonly status?: FulfillmentStatus;
  /** Only jobs nobody is working on. */
  readonly unclaimed?: boolean;
  /** Only jobs older than their published ETA. */
  readonly overdue?: boolean;
  /** One order's jobs. What support reaches for when a customer asks about theirs. */
  readonly orderId?: string;
  readonly limit: number;
  readonly offset: number;
}

/** A player card the customer is told to list. Public data, never a credential. */
export interface TradeInstructionInput {
  readonly playerName: string;
  readonly coins: number;
  readonly note?: string;
}

@Injectable()
export class FulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * The operator queue: open jobs, oldest first.
   *
   * Oldest first rather than newest, because the customer who has waited
   * longest is the one closest to asking for their money back.
   */
  async queue(filters: QueueFilters) {
    const where: Prisma.FulfillmentWhereInput = {};

    if (filters.orderId) {
      // An explicit order overrides the default "open work only" view: support
      // looking up an order needs to see it whatever state it reached.
      where.orderId = filters.orderId;
    }

    if (filters.status) {
      where.status = filters.status;
    } else if (!filters.orderId) {
      // The default view is work that still needs doing.
      where.status = { in: ['PENDING', 'PROCESSING', 'WAITING_FOR_CUSTOMER', 'READY'] };
    }

    if (filters.unclaimed) {
      where.operatorId = null;
    }

    if (filters.overdue) {
      where.estimatedReadyAt = { lt: new Date() };
    }

    const [rows, total] = await Promise.all([
      this.prisma.fulfillment.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: filters.limit,
        skip: filters.offset,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              contactEmail: true,
              totalMinor: true,
              currency: true,
              createdAt: true,
              // The operator needs the customer's answers to do the job: which
              // platform, which public handle. The vocabulary that fills this
              // has no credential key, so there is nothing sensitive to leak.
              checkoutValues: true,
            },
          },
          orderItem: {
            select: {
              id: true,
              offerId: true,
              displayName: true,
              displayVariant: true,
              quantity: true,
              fulfillmentMethod: true,
            },
          },
        },
      }),
      this.prisma.fulfillment.count({ where }),
    ]);

    return { rows, total };
  }

  async findOne(fulfillmentId: string) {
    const fulfillment = await this.prisma.fulfillment.findUnique({
      where: { id: fulfillmentId },
      include: {
        order: true,
        orderItem: true,
        events: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!fulfillment) {
      throw notFoundError('fulfillment not found');
    }

    return fulfillment;
  }

  /**
   * Claims a job for one operator.
   *
   * The `operatorId: null` predicate is the whole mechanism: whoever's UPDATE
   * lands first gets the job, and the second operator is told so rather than
   * silently taking it over and doing the work twice.
   */
  async claim(fulfillmentId: string, operator: Operator): Promise<Fulfillment> {
    const claimed = await this.prisma.fulfillment.updateMany({
      where: {
        id: fulfillmentId,
        operatorId: null,
        status: { in: ['PENDING', 'WAITING_FOR_CUSTOMER'] },
      },
      data: { operatorId: operator.name, status: 'PROCESSING' },
    });

    if (claimed.count !== 1) {
      const existing = await this.prisma.fulfillment.findUnique({ where: { id: fulfillmentId } });

      if (!existing) {
        throw notFoundError('fulfillment not found');
      }
      if (existing.operatorId && existing.operatorId !== operator.name) {
        throw conflictError(`already claimed by ${existing.operatorId}`, 'ALREADY_CLAIMED');
      }
      if (existing.operatorId === operator.name) {
        return existing; // Idempotent: re-claiming your own job is not an error.
      }
      throw conflictError(`cannot claim a fulfillment in ${existing.status}`, 'INVALID_STATE');
    }

    const updated = await this.prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
    await this.record(fulfillmentId, 'CLAIMED', 'PENDING', 'PROCESSING', operator, null);
    await this.rollUpOrderStatus(updated.orderId);

    return updated;
  }

  /** Puts a claimed job back in the queue for someone else. */
  async release(fulfillmentId: string, operator: Operator): Promise<Fulfillment> {
    const released = await this.prisma.fulfillment.updateMany({
      where: { id: fulfillmentId, operatorId: operator.name, status: 'PROCESSING' },
      data: { operatorId: null, status: 'PENDING' },
    });

    if (released.count !== 1) {
      throw conflictError('only the operator holding a processing job can release it', 'NOT_HOLDER');
    }

    await this.record(fulfillmentId, 'RELEASED', 'PROCESSING', 'PENDING', operator, null);
    const updated = await this.prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
    await this.rollUpOrderStatus(updated.orderId);

    return updated;
  }

  /**
   * Writes the transfer-market instructions the customer must follow.
   *
   * This is the "Buy the Player" delivery: the customer lists a named card at an
   * exact price and our farm account buys it. The instruction goes to
   * `customerInstruction`, which the order page shows *before* delivery, unlike
   * `deliveryPayload` which is withheld until after.
   *
   * The job moves to `WAITING_FOR_CUSTOMER`, which is the honest state: nothing
   * further can happen until they list the card.
   */
  async issueTradeInstruction(
    fulfillmentId: string,
    input: TradeInstructionInput,
    operator: Operator,
  ): Promise<Fulfillment> {
    const fulfillment = await this.prisma.fulfillment.findUnique({
      where: { id: fulfillmentId },
      include: { order: { select: { status: true } } },
    });

    if (!fulfillment) {
      throw notFoundError('fulfillment not found');
    }

    this.assertOrderIsPaid(fulfillment.order.status);
    this.assertTransition(fulfillment.status, 'WAITING_FOR_CUSTOMER');
    this.assertHolder(fulfillment, operator);

    const playerName = input.playerName.trim();
    if (playerName.length < 2 || playerName.length > 80) {
      throw validationError('playerName must be between 2 and 80 characters', [
        {
          field: 'playerName',
          message: { he: 'שם השחקן חייב להיות בין 2 ל-80 תווים.', en: 'Player name must be 2-80 characters.' },
        },
      ]);
    }

    let plan;
    try {
      plan = planCoinTrades(input.coins);
    } catch (error) {
      if (error instanceof CoinTradePlanError) {
        throw validationError(error.message, [
          {
            field: 'coins',
            message: { he: 'כמות הקוינס אינה ניתנת לאספקה במרקט.', en: 'That coin amount cannot be delivered on the market.' },
          },
        ]);
      }
      throw error;
    }

    const instruction = {
      kind: 'TRADE' as const,
      playerName,
      note: input.note?.trim() || undefined,
      requestedCoins: plan.requestedCoins,
      deliveredCoins: plan.deliveredCoins,
      trades: plan.trades.map((trade) => ({
        sequence: trade.sequence,
        binPrice: trade.binPrice,
        netCoins: trade.netCoins,
      })),
      issuedAt: new Date().toISOString(),
    };

    const claimed = await this.prisma.fulfillment.updateMany({
      where: { id: fulfillmentId, status: fulfillment.status },
      data: { status: 'WAITING_FOR_CUSTOMER', customerInstruction: instruction },
    });

    if (claimed.count !== 1) {
      throw conflictError('the fulfillment changed while the instruction was being written', 'STALE');
    }

    await this.record(
      fulfillmentId,
      'TRADE_INSTRUCTION_ISSUED',
      fulfillment.status,
      'WAITING_FOR_CUSTOMER',
      operator,
      // The plan, not the customer's details. An audit trail of what we asked
      // them to do is what makes a later dispute answerable.
      { playerName, requestedCoins: plan.requestedCoins, trades: plan.trades.length },
    );

    const updated = await this.prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
    await this.rollUpOrderStatus(updated.orderId);

    return updated;
  }

  /**
   * Marks a job delivered.
   *
   * Re-reads the order's paid state inside the transaction. The order may have
   * been refunded since the job was opened, and delivering against a refund is
   * giving the product away.
   */
  async markDelivered(
    fulfillmentId: string,
    payload: Prisma.InputJsonValue,
    operator: Operator,
  ): Promise<Fulfillment> {
    const updated = await this.prisma.runInTransaction(async (tx) => {
      const fulfillment = await tx.fulfillment.findUnique({
        where: { id: fulfillmentId },
        include: { order: { select: { status: true } } },
      });

      if (!fulfillment) {
        throw notFoundError('fulfillment not found');
      }

      this.assertOrderIsPaid(fulfillment.order.status);
      this.assertTransition(fulfillment.status, 'DELIVERED');
      this.assertHolder(fulfillment, operator);

      const claimed = await tx.fulfillment.updateMany({
        where: { id: fulfillmentId, status: fulfillment.status },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          deliveryPayload: payload,
          operatorId: operator.name,
          failureReason: Prisma.DbNull,
        },
      });

      if (claimed.count !== 1) {
        throw conflictError('the fulfillment was changed by someone else', 'STALE');
      }

      await tx.orderItem.update({
        where: { id: fulfillment.orderItemId },
        data: { fulfillmentStatus: 'DELIVERED' },
      });

      return tx.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
    });

    await this.record(fulfillmentId, 'DELIVERED', 'PROCESSING', 'DELIVERED', operator, null);
    await this.rollUpOrderStatus(updated.orderId);

    this.logger.info('fulfillment delivered', {
      fulfillmentId,
      orderId: updated.orderId,
      operator: operator.name,
    });

    return updated;
  }

  /**
   * Marks a job failed with a reason the customer can be shown.
   *
   * The reason is localised and written for a customer, not a developer. It
   * reaches them, so "supplier timeout on attempt 3" is not an acceptable value.
   */
  async markFailed(
    fulfillmentId: string,
    reason: { he: string; en?: string },
    operator: Operator,
  ): Promise<Fulfillment> {
    const fulfillment = await this.prisma.fulfillment.findUnique({ where: { id: fulfillmentId } });

    if (!fulfillment) {
      throw notFoundError('fulfillment not found');
    }
    this.assertTransition(fulfillment.status, 'FAILED');
    this.assertHolder(fulfillment, operator);

    if (!reason.he || reason.he.trim().length < 3) {
      throw validationError('a Hebrew failure reason is required; the customer is shown it', [
        {
          field: 'reason.he',
          message: { he: 'נדרשת סיבת כשל בעברית.', en: 'A Hebrew failure reason is required.' },
        },
      ]);
    }

    const claimed = await this.prisma.fulfillment.updateMany({
      where: { id: fulfillmentId, status: fulfillment.status },
      data: {
        status: 'FAILED',
        failureReason: reason,
        attempts: { increment: 1 },
        operatorId: operator.name,
      },
    });

    if (claimed.count !== 1) {
      throw conflictError('the fulfillment was changed by someone else', 'STALE');
    }

    await this.record(fulfillmentId, 'FAILED', fulfillment.status, 'FAILED', operator, {
      reason: reason.he,
    });

    const updated = await this.prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
    await this.rollUpOrderStatus(updated.orderId);

    this.logger.warn('fulfillment failed', {
      fulfillmentId,
      orderId: updated.orderId,
      operator: operator.name,
    });

    return updated;
  }

  /** Returns a failed job to the queue so it can be attempted again. */
  async retry(fulfillmentId: string, operator: Operator): Promise<Fulfillment> {
    const fulfillment = await this.prisma.fulfillment.findUnique({ where: { id: fulfillmentId } });

    if (!fulfillment) {
      throw notFoundError('fulfillment not found');
    }
    this.assertTransition(fulfillment.status, 'PENDING');

    const claimed = await this.prisma.fulfillment.updateMany({
      where: { id: fulfillmentId, status: fulfillment.status },
      data: { status: 'PENDING', operatorId: null, failureReason: Prisma.DbNull },
    });

    if (claimed.count !== 1) {
      throw conflictError('the fulfillment was changed by someone else', 'STALE');
    }

    await this.record(fulfillmentId, 'RETRIED', fulfillment.status, 'PENDING', operator, null);
    const updated = await this.prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
    await this.rollUpOrderStatus(updated.orderId);

    return updated;
  }

  // --- internals -----------------------------------------------------------

  /**
   * Recomputes the order's status from its items.
   *
   * The order is the least advanced of its fulfillments. Computed rather than
   * stored per event, because a status assembled from a sequence of updates
   * drifts the first time one of them is missed.
   */
  private async rollUpOrderStatus(orderId: string): Promise<void> {
    const fulfillments = await this.prisma.fulfillment.findMany({
      where: { orderId },
      select: { status: true },
    });

    if (fulfillments.length === 0) {
      return;
    }

    const least = fulfillments
      .map((f) => f.status)
      .reduce((lowest, status) =>
        PROGRESS_ORDER.indexOf(status) < PROGRESS_ORDER.indexOf(lowest) ? status : lowest,
      );

    const orderStatus =
      least === 'DELIVERED'
        ? 'FULFILLED'
        : least === 'FAILED'
          ? 'FAILED'
          : least === 'PENDING'
            ? 'FULFILLMENT_PENDING'
            : 'FULFILLMENT_PROCESSING';

    // Only moves an order that is still in the fulfillment part of its life. A
    // cancelled or refunded order is not dragged back by a stray item update.
    await this.prisma.order.updateMany({
      where: {
        id: orderId,
        status: { in: ['PAID', 'PROCESSING', 'FULFILLMENT_PENDING', 'FULFILLMENT_PROCESSING'] },
      },
      data: { status: orderStatus },
    });
  }

  /** Writes the transition to the fulfillment's own history and to the audit log. */
  private async record(
    fulfillmentId: string,
    type: string,
    before: FulfillmentStatus | null,
    after: FulfillmentStatus | null,
    operator: Operator,
    detail: Prisma.InputJsonValue | null,
  ): Promise<void> {
    await this.prisma.fulfillmentEvent.create({
      data: {
        id: generateId('fev'),
        fulfillmentId,
        type,
        statusBefore: before,
        statusAfter: after,
        detail: detail ?? undefined,
        actorType: 'OPERATOR',
        actorId: operator.name,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        eventType: `fulfillment.${type.toLowerCase()}`,
        entityType: 'fulfillment',
        entityId: fulfillmentId,
        actorType: 'OPERATOR',
        actorId: operator.name,
        afterState: after ? { status: after } : undefined,
      },
    });
  }

  private assertTransition(from: FulfillmentStatus, to: FulfillmentStatus): void {
    if (from === to) {
      return; // Repeating an action you already took is not an error.
    }
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw conflictError(`cannot move a fulfillment from ${from} to ${to}`, 'INVALID_TRANSITION');
    }
  }

  private assertOrderIsPaid(status: string): void {
    if (!DELIVERABLE_ORDER_STATES.includes(status as (typeof DELIVERABLE_ORDER_STATES)[number])) {
      throw conflictError(
        `the order is ${status}; nothing is delivered against an order that is not paid`,
        'ORDER_NOT_PAYABLE',
      );
    }
  }

  /** An unclaimed job may be acted on; someone else's may not. */
  private assertHolder(fulfillment: { operatorId: string | null }, operator: Operator): void {
    if (fulfillment.operatorId && fulfillment.operatorId !== operator.name) {
      throw conflictError(`claimed by ${fulfillment.operatorId}`, 'ALREADY_CLAIMED');
    }
  }
}
