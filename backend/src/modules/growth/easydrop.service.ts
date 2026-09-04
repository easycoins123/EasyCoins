import { Injectable } from '@nestjs/common';
import type { CustomerSession, EasyDrop, Order, Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';

import { conflictError, validationError } from '../../common/errors/api-error';
import { generateId } from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { EasyDropPool, LocalizedText, RewardTemplate } from './growth-config';
import { GrowthConfigService } from './growth-config.service';
import {
  RewardView, hasOwner, isQualifying, isUniqueViolation, ownerOf, requireReadableOrder, toRewardView,
} from './growth-shared';
import { RewardsService } from './rewards.service';

type Db = Prisma.TransactionClient | PrismaService;

/** The drop as the storefront sees it. Unrevealed cards stay closed on the wire too. */
export interface EasyDropView {
  readonly orderId: string;
  readonly tier: EasyDrop['tier'];
  readonly tierName: LocalizedText;
  readonly status: 'ISSUED' | 'REVEALED';
  readonly cardCount: number;
  readonly pickedIndex: number | null;
  readonly reward: RewardView | null;
  readonly issuedAt: string;
  readonly revealedAt: string | null;
}

/**
 * EasyDrop: a guaranteed reward after every paid order.
 *
 * Not a gamble. Every card in a drop is drawn from the pool for the order's
 * size, so whichever card the customer opens holds a real reward; the other
 * two are never shown, so there is no "you could have had". The cards are
 * drawn once, when the order is paid, and stored; the reveal only records the
 * pick. A refresh shows the same reward and a second reveal is refused by the
 * row, so nothing about the outcome can be re-rolled from a browser.
 */
@Injectable()
export class EasyDropService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GrowthConfigService,
    private readonly rewards: RewardsService,
    private readonly logger: AppLogger,
  ) {}

  /** The pool for an order total: the richest whose floor the total clears. */
  poolFor(totalMinor: number, pools: readonly EasyDropPool[]): EasyDropPool | undefined {
    return [...pools]
      .sort((a, b) => a.minTotalMinor - b.minTotalMinor)
      .filter((pool) => pool.minTotalMinor <= totalMinor && pool.cards.length > 0)
      .pop();
  }

  /**
   * Issues the drop for a paid order, or returns the one it already has.
   *
   * Called when payment settles and again, lazily, when the success page asks,
   * so a crash between the two cannot lose a customer's drop. The unique
   * order id is what makes both paths converge on one row.
   */
  async ensureForOrder(
    db: Db,
    order: Pick<Order, 'id' | 'status' | 'customerId' | 'sessionId' | 'totalMinor'>,
  ): Promise<EasyDrop | null> {
    const existing = await db.easyDrop.findUnique({ where: { orderId: order.id } });
    if (existing) {
      return existing;
    }
    const growth = await this.config.get();
    if (!growth.easydrop.enabled || !isQualifying(order.status) || !hasOwner(ownerOf(order))) {
      return null;
    }
    const pool = this.poolFor(order.totalMinor, growth.easydrop.pools);
    if (!pool) {
      return null;
    }
    const cards = drawCards(pool.cards, growth.easydrop.cardsPerDrop);
    try {
      const drop = await db.easyDrop.create({
        data: {
          id: generateId('drop'),
          orderId: order.id,
          customerId: order.customerId,
          sessionId: order.customerId ? null : order.sessionId,
          tier: pool.tier,
          status: 'ISSUED',
          cards: cards as unknown as Prisma.InputJsonValue,
        },
      });
      this.logger.info('easydrop issued', { orderId: order.id, tier: pool.tier, cards: cards.length });
      return drop;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return db.easyDrop.findUnique({ where: { orderId: order.id } });
      }
      throw error;
    }
  }

  /** The drop for an order the caller owns, issuing it if the order qualifies. */
  async forOrder(orderId: string, session: CustomerSession | null): Promise<EasyDropView | null> {
    const order = requireReadableOrder(await this.prisma.order.findUnique({ where: { id: orderId } }), session);
    const drop = await this.ensureForOrder(this.prisma, order);
    return drop ? this.view(drop) : null;
  }

  /**
   * Opens one card.
   *
   * The claim is a conditional update on the drop row: only the first reveal
   * changes it, and the reward is written in the same transaction, so a
   * failure to issue rolls the pick back rather than leaving a revealed drop
   * with nothing behind it. A repeated reveal, whichever index it names,
   * returns what was already opened.
   */
  async reveal(orderId: string, index: number, session: CustomerSession | null): Promise<EasyDropView> {
    const order = requireReadableOrder(await this.prisma.order.findUnique({ where: { id: orderId } }), session);
    const drop = await this.ensureForOrder(this.prisma, order);
    if (!drop) {
      throw conflictError(
        `Order ${orderId} has no EasyDrop`,
        'EASYDROP_NOT_AVAILABLE',
        { he: 'אין EASYDROP להזמנה הזו.', en: 'There is no EASYDROP for this order.' },
      );
    }
    if (drop.status === 'REVEALED') {
      return this.view(drop);
    }

    const cards = drop.cards as unknown as RewardTemplate[];
    if (!Number.isInteger(index) || index < 0 || index >= cards.length) {
      throw validationError('index is out of range', [
        { field: 'index', message: { he: 'בחרו קלף מתוך הקלפים המוצגים.', en: 'Choose one of the cards shown.' } },
      ], 'EASYDROP_INDEX_INVALID');
    }

    const growth = await this.config.get();
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.easyDrop.updateMany({
        where: { id: drop.id, status: 'ISSUED', pickedIndex: null },
        data: { status: 'REVEALED', pickedIndex: index, revealedAt: new Date() },
      });
      if (claimed.count !== 1) {
        // Someone (another tab, a double tap) got there first. Their pick stands.
        return tx.easyDrop.findUniqueOrThrow({ where: { id: drop.id } });
      }
      const reward = await this.rewards.issue(tx, {
        owner: ownerOf(order),
        source: 'EASYDROP',
        sourceOrderId: order.id,
        template: cards[index],
        defaultExpiresInDays: growth.easydrop.expiresInDays,
        metadata: { easyDropId: drop.id, tier: drop.tier, pickedIndex: index },
      });
      if (!reward) {
        throw conflictError('EasyDrop reward could not be issued', 'EASYDROP_REWARD_FAILED');
      }
      return tx.easyDrop.update({ where: { id: drop.id }, data: { rewardId: reward.id } });
    });

    this.logger.info('easydrop revealed', { orderId, tier: updated.tier, index: updated.pickedIndex ?? undefined });
    return this.view(updated);
  }

  private async view(drop: EasyDrop): Promise<EasyDropView> {
    const growth = await this.config.get();
    const pool = growth.easydrop.pools.find((entry) => entry.tier === drop.tier);
    const reward = drop.rewardId ? await this.prisma.customerReward.findUnique({ where: { id: drop.rewardId } }) : null;
    const cards = drop.cards as unknown as RewardTemplate[];
    return {
      orderId: drop.orderId,
      tier: drop.tier,
      tierName: pool?.name ?? { he: drop.tier, en: drop.tier },
      status: drop.status === 'REVEALED' ? 'REVEALED' : 'ISSUED',
      cardCount: cards.length,
      pickedIndex: drop.pickedIndex,
      reward: reward ? toRewardView(reward) : null,
      issuedAt: drop.issuedAt.toISOString(),
      revealedAt: drop.revealedAt?.toISOString() ?? null,
    };
  }
}

/**
 * Draws the cards for a drop, weighted, without replacement while the pool
 * lasts. A pool smaller than the number of cards is dealt again, so every
 * card still holds a reward: the guarantee is structural.
 */
export function drawCards(
  pool: readonly RewardTemplate[],
  count: number,
  random: () => number = () => randomInt(0, 1 << 30) / (1 << 30),
): RewardTemplate[] {
  const cards: RewardTemplate[] = [];
  let remaining: RewardTemplate[] = [];
  while (cards.length < count) {
    if (remaining.length === 0) {
      remaining = [...pool];
    }
    const total = remaining.reduce((sum, card) => sum + (card.weight ?? 1), 0);
    let roll = random() * total;
    let index = 0;
    for (; index < remaining.length - 1; index += 1) {
      roll -= remaining[index].weight ?? 1;
      if (roll <= 0) {
        break;
      }
    }
    const [picked] = remaining.splice(index, 1);
    // Stored without the pool weight: it means nothing to the card itself.
    const { weight: _weight, ...card } = picked;
    cards.push(card);
  }
  return cards;
}
