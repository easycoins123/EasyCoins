import { Injectable } from '@nestjs/common';
import type { CustomerReward, Prisma, RewardKind, RewardSource } from '@prisma/client';

import { conflictError } from '../../common/errors/api-error';
import { generateId } from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { RewardTemplate } from './growth-config';
import { GrowthConfigService } from './growth-config.service';
import {
  CHECKOUT_REWARD_KINDS, CLOSED_ORDER_STATUSES, RewardOwner, RewardView, addDays, hasOwner, isUniqueViolation,
  ownerWhere, toRewardView,
} from './growth-shared';

type Db = Prisma.TransactionClient | PrismaService;

export interface IssueRewardInput {
  readonly owner: RewardOwner;
  readonly source: RewardSource;
  readonly sourceOrderId: string;
  readonly template: RewardTemplate;
  /** Applies when the template names no expiry of its own. */
  readonly defaultExpiresInDays: number;
  readonly metadata?: Record<string, unknown>;
}

export interface RedeemableCheck {
  readonly reward: CustomerReward | null;
  readonly eligible: boolean;
  readonly reason?: { readonly code: string; readonly he: string; readonly en: string };
}

export interface ReconcileResult {
  readonly expired: number;
  readonly revoked: number;
  readonly released: number;
}

/**
 * The reward ledger.
 *
 * Every write here is either an insert guarded by a unique constraint or a
 * conditional update whose row count decides the outcome. There is no
 * read-then-write anywhere in this file, so two requests racing for the same
 * reward (a double-clicked reveal, two tabs placing orders with one credit)
 * cannot both succeed.
 */
@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GrowthConfigService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Issues a reward from a template, once per source and order.
   *
   * What "issued" means depends on the kind. Points and tier boosts take
   * effect at once and are recorded as already redeemed against the order
   * that earned them; everything a customer applies later starts AVAILABLE
   * with an expiry. Returns the existing row when the same source already
   * issued one for the order, which is how a replayed event mints nothing.
   */
  async issue(db: Db, input: IssueRewardInput): Promise<CustomerReward | null> {
    if (!hasOwner(input.owner)) {
      return null;
    }
    const { template } = input;
    if (template.kind === 'EXTRA_COINS') {
      // Not deliverable yet; refused by configuration validation as well.
      return null;
    }
    const now = new Date();
    const growth = await this.config.get();
    const expiresInDays = template.expiresInDays ?? input.defaultExpiresInDays;

    const immediate = template.kind === 'POINTS_BONUS' || template.kind === 'TIER_BOOST';
    const data: Prisma.CustomerRewardUncheckedCreateInput = {
      id: generateId('rwd'),
      customerId: input.owner.customerId,
      sessionId: input.owner.customerId ? null : input.owner.sessionId,
      source: input.source,
      kind: template.kind,
      value: template.value,
      title: template.title as unknown as Prisma.InputJsonValue,
      status: immediate ? 'REDEEMED' : 'AVAILABLE',
      sourceOrderId: input.sourceOrderId,
      redeemedOrderId: immediate ? input.sourceOrderId : null,
      minOrderMinor: template.minOrderMinor ?? null,
      expiresAt: template.kind === 'TIER_BOOST'
        ? addDays(now, growth.easyclub.tierBoostDays)
        : template.kind === 'POINTS_BONUS'
          ? null
          : addDays(now, expiresInDays),
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
    };

    try {
      const reward = await db.customerReward.create({ data });
      this.logger.info('reward issued', {
        rewardId: reward.id,
        source: reward.source,
        kind: reward.kind,
        value: reward.value,
        orderId: input.sourceOrderId,
      });
      return reward;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return db.customerReward.findUnique({
          where: { reward_once_per_source_order: { source: input.source, sourceOrderId: input.sourceOrderId } },
        });
      }
      throw error;
    }
  }

  /**
   * Whether a reward may be applied to a cart right now, and if not, why.
   *
   * Ownership is part of the check: a reward id that belongs to someone else
   * is "not found", exactly like an order.
   */
  async redeemable(
    owner: RewardOwner,
    rewardId: string,
    cart: { subtotalMinor: number; hasCoinLine: boolean },
  ): Promise<RedeemableCheck> {
    const reward = await this.prisma.customerReward.findFirst({ where: { id: rewardId, ...ownerWhere(owner) } });
    if (!reward) {
      return { reward: null, eligible: false, reason: { code: 'REWARD_NOT_FOUND', he: 'ההטבה לא נמצאה.', en: 'That reward was not found.' } };
    }
    if (!CHECKOUT_REWARD_KINDS.includes(reward.kind)) {
      return { reward, eligible: false, reason: { code: 'REWARD_NOT_CHECKOUT', he: 'ההטבה הזו חלה מעצמה ולא בקופה.', en: 'This reward applies on its own, not at checkout.' } };
    }
    if (reward.status !== 'AVAILABLE') {
      return { reward, eligible: false, reason: { code: 'REWARD_NOT_AVAILABLE', he: 'ההטבה כבר נוצלה או אינה זמינה.', en: 'This reward was already used or is no longer available.' } };
    }
    if (reward.expiresAt && reward.expiresAt <= new Date()) {
      return { reward, eligible: false, reason: { code: 'REWARD_EXPIRED', he: 'תוקף ההטבה פג.', en: 'This reward has expired.' } };
    }
    if (reward.minOrderMinor !== null && cart.subtotalMinor < reward.minOrderMinor) {
      const shekels = Math.ceil(reward.minOrderMinor / 100);
      return {
        reward,
        eligible: false,
        reason: { code: 'REWARD_MIN_ORDER', he: `ההטבה תקפה להזמנה מ־${shekels} ₪.`, en: `This reward applies to orders from ₪${shekels}.` },
      };
    }
    if (reward.kind === 'NEXT_ORDER_COINS' && !cart.hasCoinLine) {
      return { reward, eligible: false, reason: { code: 'REWARD_NEEDS_COINS', he: 'בונוס קוינס מצטרף להזמנת קוינס בלבד.', en: 'A coin bonus attaches to a coin order only.' } };
    }
    return { reward, eligible: true };
  }

  /**
   * Holds a reward for an order being created. Inside the order transaction,
   * so an order that fails to write leaves the reward untouched.
   */
  async reserve(tx: Prisma.TransactionClient, rewardId: string, orderId: string, owner: RewardOwner): Promise<void> {
    const claimed = await tx.customerReward.updateMany({
      where: {
        id: rewardId,
        status: 'AVAILABLE',
        ...ownerWhere(owner),
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: { status: 'RESERVED', redeemedOrderId: orderId },
    });
    if (claimed.count !== 1) {
      throw conflictError(
        `Reward ${rewardId} is no longer available`,
        'REWARD_NOT_AVAILABLE',
        { he: 'ההטבה שבחרתם כבר לא זמינה. הסירו אותה מהעגלה ונסו שוב.', en: 'The reward you chose is no longer available. Remove it from the cart and try again.' },
      );
    }
  }

  /** The order was paid: what it held is spent. */
  async redeemForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
    const result = await tx.customerReward.updateMany({
      where: { redeemedOrderId: orderId, status: 'RESERVED' },
      data: { status: 'REDEEMED' },
    });
    return result.count;
  }

  /** The order died before payment: what it held goes back to the customer. */
  async releaseForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<number> {
    const result = await tx.customerReward.updateMany({
      where: { redeemedOrderId: orderId, status: 'RESERVED' },
      data: { status: 'AVAILABLE', redeemedOrderId: null },
    });
    return result.count;
  }

  /**
   * Spends one waiting points multiplier on a paid order, automatically.
   *
   * A multiplier changes no price and no delivery, so it is not a checkout
   * choice; it attaches to the next paid order by itself. One at most.
   */
  async applyMultiplier(db: Db, owner: RewardOwner, orderId: string): Promise<CustomerReward | null> {
    if (!hasOwner(owner)) {
      return null;
    }
    const waiting = await db.customerReward.findFirst({
      where: {
        ...ownerWhere(owner),
        kind: 'POINTS_MULTIPLIER',
        status: 'AVAILABLE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!waiting) {
      return null;
    }
    const claimed = await db.customerReward.updateMany({
      where: { id: waiting.id, status: 'AVAILABLE' },
      data: { status: 'REDEEMED', redeemedOrderId: orderId },
    });
    return claimed.count === 1 ? db.customerReward.findUnique({ where: { id: waiting.id } }) : null;
  }

  /** Everything an owner holds or held, expiry applied first. */
  async listForOwner(owner: RewardOwner): Promise<{ available: RewardView[]; history: RewardView[] }> {
    if (!hasOwner(owner)) {
      return { available: [], history: [] };
    }
    await this.prisma.customerReward.updateMany({
      where: { ...ownerWhere(owner), status: 'AVAILABLE', expiresAt: { lte: new Date() } },
      data: { status: 'EXPIRED' },
    });
    const rows = await this.prisma.customerReward.findMany({
      where: ownerWhere(owner),
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const views = rows.map(toRewardView);
    return {
      available: views.filter((reward) => reward.status === 'AVAILABLE' || reward.status === 'RESERVED'),
      history: views.filter((reward) => reward.status !== 'AVAILABLE' && reward.status !== 'RESERVED'),
    };
  }

  /** Rewards of given kinds an owner currently holds in a status. */
  async find(owner: RewardOwner, kinds: readonly RewardKind[], statuses: readonly CustomerReward['status'][]): Promise<CustomerReward[]> {
    if (!hasOwner(owner)) {
      return [];
    }
    return this.prisma.customerReward.findMany({
      where: { ...ownerWhere(owner), kind: { in: [...kinds] }, status: { in: [...statuses] } },
    });
  }

  /**
   * Keeps the ledger honest against what happened to the orders behind it.
   *
   * Run by housekeeping. Each step is a conditional bulk update, so two
   * instances sweeping at once divide the rows rather than double-count.
   */
  async reconcile(now = new Date()): Promise<ReconcileResult> {
    const expired = await this.prisma.customerReward.updateMany({
      where: { status: 'AVAILABLE', expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });

    // A reward earned by an order that was later cancelled or refunded is
    // withdrawn if it has not been spent. A spent one stays spent: the customer
    // has already received what it bought, and clawing it back is a support
    // conversation, not a background job.
    const revoked = await this.prisma.customerReward.updateMany({
      where: {
        status: { in: ['AVAILABLE', 'RESERVED'] },
        sourceOrder: { status: { in: [...CLOSED_ORDER_STATUSES] } },
      },
      data: { status: 'REVOKED' },
    });

    // A hold on an order that never got paid is returned. The state machine
    // does this at the moment of cancellation; this is the net under it.
    const released = await this.prisma.customerReward.updateMany({
      where: {
        status: 'RESERVED',
        redeemedOrder: { status: { in: [...CLOSED_ORDER_STATUSES] } },
      },
      data: { status: 'AVAILABLE', redeemedOrderId: null },
    });

    return { expired: expired.count, revoked: revoked.count, released: released.count };
  }
}
