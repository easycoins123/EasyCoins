import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { generateId } from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { planCoinTrades } from './coin-trade';

/**
 * Turning a paid coin order into a delivery instruction, without a person.
 *
 * Everything needed is already in the database the moment payment settles: the
 * variant carries `quantityValue` (how many coins were bought), the offer
 * carries the platform, and the checkout carries the customer's public handle.
 * So the instruction can be written by the system, and the operator's job
 * shrinks to the one step nobody can automate away for them: performing the
 * buy.
 *
 * **This is best-effort on purpose.** If anything here fails, the fulfillment
 * stays `PENDING` and appears in the operator queue exactly as before. A paid
 * order must never be damaged by the automation that was supposed to speed it
 * up, so every failure degrades to manual rather than to a lost order.
 */

/**
 * Cards the customer is asked to list.
 *
 * Cheap, common, and plentiful on every platform's market, so the listing is
 * findable and the customer is not asked to buy something expensive first. The
 * pool is rotated rather than fixed: one account repeatedly buying the same
 * card at unusual prices is the easiest possible pattern to spot.
 *
 * VERIFY EACH SEASON. These are real cards in the current title; a name that no
 * longer exists produces an instruction the customer cannot follow. Move this
 * to a table once an operator needs to change it without a deploy.
 */
const PLAYER_POOL: readonly string[] = [
  'Bronze Common Goalkeeper',
  'Bronze Common Defender',
  'Bronze Common Midfielder',
  'Bronze Common Striker',
  'Silver Common Goalkeeper',
  'Silver Common Defender',
  'Silver Common Midfielder',
  'Silver Common Striker',
];

/** Product types whose delivery is a transfer-market trade. */
const TRADEABLE_TYPES = ['GAME_CURRENCY'] as const;

@Injectable()
export class AutoFulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Plans every unplanned coin fulfillment on an order.
   *
   * Called after payment commits. Idempotent: a fulfillment that already has an
   * instruction, or that an operator has already moved, is skipped, so a retry
   * or a duplicate webhook cannot issue a second instruction.
   */
  async planOrder(orderId: string): Promise<number> {
    const fulfillments = await this.prisma.fulfillment.findMany({
      where: {
        orderId,
        status: 'PENDING',
        customerInstruction: { equals: Prisma.DbNull },
      },
      include: {
        order: { select: { metadata: true } },
        orderItem: {
          include: {
            product: { select: { type: true } },
            variant: { select: { quantityValue: true, metadata: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    let planned = 0;
    // Coins an applied reward adds to the order. Delivered once, with the
    // first coin item, so two coin lines cannot each add them.
    let rewardCoinsLeft = rewardCoinsOf(fulfillments[0]?.order.metadata);

    for (const fulfillment of fulfillments) {
      const { product, variant, quantity } = fulfillment.orderItem;

      if (!TRADEABLE_TYPES.includes(product.type as (typeof TRADEABLE_TYPES)[number])) {
        continue; // A gift card is not delivered by a trade.
      }
      if (!variant.quantityValue) {
        // Nothing to compute from. An operator decides the amount by hand.
        this.logger.warn('coin fulfillment has no quantity on its variant', {
          fulfillmentId: fulfillment.id,
          orderId,
        });
        continue;
      }

      // Quantity multiplies the variant: two 100K packs is 200K in one delivery.
      // The launch bonus the customer was promised on the shelf is part of the
      // variant's metadata and is delivered with it, not remembered by hand.
      const coins = (variant.quantityValue + launchBonusOf(variant.metadata)) * quantity + rewardCoinsLeft;
      rewardCoinsLeft = 0;

      try {
        await this.issue(fulfillment.id, coins);
        planned += 1;
      } catch (error) {
        // Logged and left PENDING. The queue is the fallback, and it always works.
        this.logger.error('could not plan a coin delivery automatically', {
          fulfillmentId: fulfillment.id,
          orderId,
          coins,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    return planned;
  }

  /** Writes one instruction and moves the job to `WAITING_FOR_CUSTOMER`. */
  private async issue(fulfillmentId: string, coins: number): Promise<void> {
    // Throws `CoinTradePlanError` for an amount the market cannot carry. The
    // caller logs it and leaves the job for an operator, which is the right
    // outcome: it means the order needs a human, not that it is broken.
    const plan = planCoinTrades(coins);
    const playerName = pickPlayer(fulfillmentId);

    const instruction = {
      kind: 'TRADE' as const,
      playerName,
      requestedCoins: plan.requestedCoins,
      deliveredCoins: plan.deliveredCoins,
      trades: plan.trades.map((trade) => ({
        sequence: trade.sequence,
        binPrice: trade.binPrice,
        netCoins: trade.netCoins,
      })),
      issuedAt: new Date().toISOString(),
      issuedBy: 'system' as const,
    };

    // Conditional on the status the row still being PENDING, so an operator who
    // claimed it a moment ago is not overwritten.
    const claimed = await this.prisma.fulfillment.updateMany({
      where: { id: fulfillmentId, status: 'PENDING' },
      data: { status: 'WAITING_FOR_CUSTOMER', customerInstruction: instruction },
    });

    if (claimed.count !== 1) {
      return; // Someone got there first. Nothing to do and nothing wrong.
    }

    // The item carries its own copy of the status for the order view; leaving
    // it PENDING while the fulfillment waits on the customer makes the two
    // disagree on the same page.
    const withItem = await this.prisma.fulfillment.findUniqueOrThrow({
      where: { id: fulfillmentId },
      select: { orderId: true, orderItemId: true },
    });
    await this.prisma.orderItem.update({
      where: { id: withItem.orderItemId },
      data: { fulfillmentStatus: 'WAITING_FOR_CUSTOMER' },
    });

    await this.prisma.fulfillmentEvent.create({
      data: {
        id: generateId('fev'),
        fulfillmentId,
        type: 'TRADE_INSTRUCTION_ISSUED',
        statusBefore: 'PENDING',
        statusAfter: 'WAITING_FOR_CUSTOMER',
        detail: { playerName, requestedCoins: plan.requestedCoins, trades: plan.trades.length },
        // SYSTEM, not an operator: the audit trail must not imply a person did
        // this, or a later dispute is answered with a name that was never there.
        actorType: 'SYSTEM',
        actorId: null,
      },
    });

    // The order is the least advanced of its items, and this one is now waiting
    // on the customer rather than on us. Guarded so a cancelled or refunded
    // order is never dragged back into the fulfillment part of its life.
    await this.prisma.order.updateMany({
      where: { id: withItem.orderId, status: 'FULFILLMENT_PENDING' },
      data: { status: 'FULFILLMENT_PROCESSING' },
    });

    this.logger.info('coin delivery planned automatically', {
      fulfillmentId,
      coins: plan.requestedCoins,
      listings: plan.trades.length,
    });
  }
}

/** Launch bonus coins on a variant, per unit. Zero when the campaign is off. */
function launchBonusOf(metadata: unknown): number {
  const bonus = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['launchBonus'] : undefined;
  return typeof bonus === 'number' && bonus > 0 ? Math.round(bonus) : 0;
}

/** Coins an applied reward adds to an order, from the order's own record. */
function rewardCoinsOf(metadata: unknown): number {
  const value = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['rewardCoins'] : undefined;
  return typeof value === 'number' && value > 0 ? Math.round(value) : 0;
}

/**
 * Chooses a card from the pool, stably.
 *
 * Derived from the fulfillment id rather than random, so re-running the planner
 * for the same job produces the same instruction. A random pick would tell a
 * customer to list one card and then, after a retry, a different one.
 */
function pickPlayer(fulfillmentId: string): string {
  let hash = 0;
  for (let index = 0; index < fulfillmentId.length; index += 1) {
    hash = (hash * 31 + fulfillmentId.charCodeAt(index)) >>> 0;
  }
  return PLAYER_POOL[hash % PLAYER_POOL.length];
}
