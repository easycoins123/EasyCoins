import { Injectable } from '@nestjs/common';
import type { CustomerReward, FounderSeat, Order, Prisma } from '@prisma/client';

import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { ClubTier, LocalizedText } from './growth-config';
import { GrowthConfigService } from './growth-config.service';
import { QUALIFYING_ORDER_STATUSES, RewardView, addDays, isQualifying } from './growth-shared';
import { ReferralService, ReferralSummary } from './referral.service';
import { RewardsService } from './rewards.service';

type Db = Prisma.TransactionClient | PrismaService;

export interface StreakState {
  readonly enabled: boolean;
  /** Paid orders in the current chain; zero once the window has lapsed. */
  readonly count: number;
  readonly windowDays: number;
  readonly activeUntil: string | null;
  /** The purchase number that earns the next streak reward, if any is left. */
  readonly nextRewardAt: number | null;
  readonly nextRewardTitle: LocalizedText | null;
}

export interface FoundersState {
  readonly enabled: boolean;
  readonly name: LocalizedText;
  readonly cap: number;
  readonly taken: number;
  readonly remaining: number;
  readonly reward: LocalizedText | null;
}

export interface ClubSummary {
  readonly tier: { readonly id: ClubTier['id']; readonly name: LocalizedText; readonly index: number };
  readonly boost: { readonly tiers: number; readonly until: string | null } | null;
  readonly points: { readonly total: number; readonly base: number; readonly bonus: number; readonly perShekel: number };
  readonly nextTier: { readonly id: ClubTier['id']; readonly name: LocalizedText; readonly minPoints: number; readonly pointsToGo: number; readonly percent: number } | null;
  readonly tiers: readonly ClubTier[];
  readonly perks: readonly LocalizedText[];
  readonly orders: { readonly count: number; readonly lifetimeMinor: number; readonly lastPaidAt: string | null };
  readonly streak: StreakState;
  readonly founders: FoundersState & { readonly seatNumber: number | null };
  readonly rewards: { readonly available: RewardView[]; readonly history: RewardView[] };
  readonly referral: ReferralSummary;
}

type PaidOrder = Pick<Order, 'id' | 'totalMinor' | 'paidAt' | 'createdAt' | 'status'>;

/**
 * EASYCLUB: tier, points, streak, founders.
 *
 * Nothing here is stored as a running total. Points are computed from the
 * customer's paid orders and the reward ledger on every read, so a refunded
 * order stops counting by itself and there is no second number to keep in
 * step. The cost is a few indexed queries per account page, which is cheap;
 * the benefit is that the number on the screen can always be explained from
 * the rows behind it.
 */
@Injectable()
export class EasyClubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GrowthConfigService,
    private readonly rewards: RewardsService,
    private readonly referral: ReferralService,
    private readonly logger: AppLogger,
  ) {}

  async summary(customerId: string): Promise<ClubSummary> {
    const growth = await this.config.get();
    const [orders, rewardRows, seat, seatsTaken, rewards, referral] = await Promise.all([
      this.paidOrders(customerId),
      this.prisma.customerReward.findMany({
        where: { customerId },
        include: { sourceOrder: { select: { status: true } } },
      }),
      this.prisma.founderSeat.findUnique({ where: { customerId } }),
      this.prisma.founderSeat.count(),
      this.rewards.listForOwner({ customerId, sessionId: null }),
      this.referral.summary(customerId),
    ]);

    const now = new Date();
    const points = this.points(orders, rewardRows, growth.easyclub.pointsPerShekel);
    const tiers = growth.easyclub.tiers;
    const naturalIndex = tierIndexFor(points.total, tiers);
    const boostRows = rewardRows.filter((reward) => reward.kind === 'TIER_BOOST' && reward.status === 'REDEEMED' && (!reward.expiresAt || reward.expiresAt > now));
    const boostTiers = boostRows.reduce((sum, reward) => sum + reward.value, 0);
    const boostedIndex = Math.min(tiers.length - 1, naturalIndex + boostTiers);
    const boostUntil = boostRows.map((reward) => reward.expiresAt).filter((date): date is Date => date !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const next = tiers[naturalIndex + 1];
    const current = tiers[boostedIndex];
    const lastPaid = orders.length > 0 ? paidTime(orders[orders.length - 1]) : null;

    return {
      tier: { id: current.id, name: current.name, index: boostedIndex },
      boost: boostTiers > 0 ? { tiers: boostTiers, until: boostUntil?.toISOString() ?? null } : null,
      points: { ...points, perShekel: growth.easyclub.pointsPerShekel },
      nextTier: next
        ? {
          id: next.id,
          name: next.name,
          minPoints: next.minPoints,
          pointsToGo: Math.max(0, next.minPoints - points.total),
          percent: Math.min(100, Math.round(((points.total - tiers[naturalIndex].minPoints) / (next.minPoints - tiers[naturalIndex].minPoints)) * 100)),
        }
        : null,
      tiers,
      perks: current.perks,
      orders: {
        count: orders.length,
        lifetimeMinor: orders.reduce((sum, order) => sum + order.totalMinor, 0),
        lastPaidAt: lastPaid?.toISOString() ?? null,
      },
      streak: this.streakState(orders, growth.streak, now),
      founders: { ...(await this.foundersState(seatsTaken)), seatNumber: seat?.seatNumber ?? null },
      rewards,
      referral,
    };
  }

  /** The public founders counter: configuration plus the real number of seats. */
  async foundersStatus(): Promise<FoundersState> {
    return this.foundersState(await this.prisma.founderSeat.count());
  }

  /**
   * Seats a customer among the founders if there is a seat left.
   *
   * The seat number is the count plus one, claimed by insert: two customers
   * paying at the same instant race on the unique seat number and the loser
   * retries with the next one. Idempotent per customer through the primary
   * key, so a replayed event cannot seat someone twice.
   */
  async assignFounderSeat(db: Db, customerId: string, orderId: string): Promise<FounderSeat | null> {
    const growth = await this.config.get();
    if (!growth.founders.enabled) {
      return null;
    }
    const existing = await db.founderSeat.findUnique({ where: { customerId } });
    if (existing) {
      return existing;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const taken = await db.founderSeat.count();
      if (taken >= growth.founders.cap) {
        return null;
      }
      try {
        const seat = await db.founderSeat.create({ data: { customerId, seatNumber: taken + 1, orderId } });
        if (growth.founders.reward) {
          await this.rewards.issue(db, {
            owner: { customerId, sessionId: null },
            source: 'FOUNDER',
            sourceOrderId: orderId,
            template: growth.founders.reward,
            defaultExpiresInDays: 365,
            metadata: { seatNumber: seat.seatNumber },
          });
        }
        this.logger.info('founder seated', { customerId, seatNumber: seat.seatNumber });
        return seat;
      } catch (error) {
        const seated = await db.founderSeat.findUnique({ where: { customerId } });
        if (seated) {
          return seated;
        }
        if (attempt === 4) {
          throw error;
        }
      }
    }
    return null;
  }

  /**
   * Issues the streak reward a paid order earns, if it is the second or third
   * (or whichever purchases the owner configured) inside the window.
   */
  async rewardStreak(db: Db, order: Pick<Order, 'id' | 'customerId' | 'status'>): Promise<CustomerReward | null> {
    const growth = await this.config.get();
    if (!growth.streak.enabled || !order.customerId || !isQualifying(order.status)) {
      return null;
    }
    const orders = await this.paidOrders(order.customerId, db);
    const position = streakPositionOf(orders, order.id, growth.streak.windowDays);
    const step = growth.streak.rewards.find((entry) => entry.purchase === position);
    if (!step) {
      return null;
    }
    return this.rewards.issue(db, {
      owner: { customerId: order.customerId, sessionId: null },
      source: 'STREAK',
      sourceOrderId: order.id,
      template: step.reward,
      defaultExpiresInDays: 30,
      metadata: { purchase: position },
    });
  }

  /** How many qualifying orders an owner has, excluding one. */
  async priorPaidOrderCount(owner: { customerId: string | null; sessionId: string | null }, excludingOrderId: string): Promise<number> {
    if (!owner.customerId && !owner.sessionId) {
      return 0;
    }
    return this.prisma.order.count({
      where: {
        id: { not: excludingOrderId },
        status: { in: [...QUALIFYING_ORDER_STATUSES] },
        ...(owner.customerId ? { customerId: owner.customerId } : { sessionId: owner.sessionId }),
      },
    });
  }

  private async paidOrders(customerId: string, db: Db = this.prisma): Promise<PaidOrder[]> {
    const rows = await db.order.findMany({
      where: { customerId, status: { in: [...QUALIFYING_ORDER_STATUSES] } },
      select: { id: true, totalMinor: true, paidAt: true, createdAt: true, status: true },
    });
    return rows.sort((a, b) => paidTime(a).getTime() - paidTime(b).getTime());
  }

  private points(
    orders: readonly PaidOrder[],
    rewardRows: readonly (CustomerReward & { sourceOrder: { status: Order['status'] } | null })[],
    perShekel: number,
  ): { total: number; base: number; bonus: number } {
    const multipliers = new Map<string, number>();
    for (const reward of rewardRows) {
      if (reward.kind === 'POINTS_MULTIPLIER' && reward.status === 'REDEEMED' && reward.redeemedOrderId) {
        multipliers.set(reward.redeemedOrderId, Math.max(multipliers.get(reward.redeemedOrderId) ?? 100, reward.value));
      }
    }
    const base = orders.reduce((sum, order) => {
      const multiplier = (multipliers.get(order.id) ?? 100) / 100;
      return sum + Math.floor((order.totalMinor / 100) * perShekel * multiplier);
    }, 0);
    const bonus = rewardRows
      .filter((reward) => reward.kind === 'POINTS_BONUS' && reward.status === 'REDEEMED')
      // A bonus earned by an order that was later refunded no longer counts.
      .filter((reward) => !reward.sourceOrder || isQualifying(reward.sourceOrder.status))
      .reduce((sum, reward) => sum + reward.value, 0);
    return { total: base + bonus, base, bonus };
  }

  private streakState(orders: readonly PaidOrder[], config: { enabled: boolean; windowDays: number; rewards: readonly { purchase: number; reward: { title: LocalizedText } }[] }, now: Date): StreakState {
    const chain = streakLength(orders, config.windowDays);
    const last = orders.length > 0 ? paidTime(orders[orders.length - 1]) : null;
    const activeUntil = last ? addDays(last, config.windowDays) : null;
    const lapsed = activeUntil !== null && activeUntil <= now;
    const count = lapsed ? 0 : chain;
    const nextStep = [...config.rewards].sort((a, b) => a.purchase - b.purchase).find((entry) => entry.purchase > count);
    return {
      enabled: config.enabled,
      count,
      windowDays: config.windowDays,
      activeUntil: lapsed ? null : activeUntil?.toISOString() ?? null,
      nextRewardAt: config.enabled && nextStep ? nextStep.purchase : null,
      nextRewardTitle: config.enabled && nextStep ? nextStep.reward.title : null,
    };
  }

  private async foundersState(taken: number): Promise<FoundersState> {
    const growth = await this.config.get();
    return {
      enabled: growth.founders.enabled,
      name: growth.founders.name,
      cap: growth.founders.cap,
      taken,
      remaining: Math.max(0, growth.founders.cap - taken),
      reward: growth.founders.reward?.title ?? null,
    };
  }
}

function paidTime(order: Pick<Order, 'paidAt' | 'createdAt'>): Date {
  return order.paidAt ?? order.createdAt;
}

/** The tier a points total lands in: the last threshold it clears. */
export function tierIndexFor(points: number, tiers: readonly ClubTier[]): number {
  let index = 0;
  tiers.forEach((tier, position) => {
    if (points >= tier.minPoints) {
      index = position;
    }
  });
  return index;
}

/** Length of the chain ending at the last order, each within the window of the previous. */
export function streakLength(orders: readonly Pick<Order, 'paidAt' | 'createdAt'>[], windowDays: number): number {
  let chain = 0;
  let previous: Date | null = null;
  for (const order of orders) {
    const at = paidTime(order);
    chain = previous && at.getTime() - previous.getTime() <= windowDays * 24 * 60 * 60 * 1000 ? chain + 1 : 1;
    previous = at;
  }
  return chain;
}

/** The position (1-based) of one order in the chain it belongs to. */
export function streakPositionOf(orders: readonly PaidOrder[], orderId: string, windowDays: number): number {
  let chain = 0;
  let previous: Date | null = null;
  for (const order of orders) {
    const at = paidTime(order);
    chain = previous && at.getTime() - previous.getTime() <= windowDays * 24 * 60 * 60 * 1000 ? chain + 1 : 1;
    previous = at;
    if (order.id === orderId) {
      return chain;
    }
  }
  return 0;
}
