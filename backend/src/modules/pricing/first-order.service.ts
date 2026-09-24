import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { PrismaService } from '../../database/prisma.service';
import { QUALIFYING_ORDER_STATUSES, RewardOwner } from '../growth/growth-shared';
import { mulDivFloor } from './ladder-economics';
import { LaunchOfferConfig } from './pricing-config';
import { PricingConfigService } from './pricing-config.service';

type Db = Prisma.TransactionClient | PrismaService;

export interface FirstOrderDecision {
  /** The offer is on and inside its window, whatever the customer's history. */
  readonly live: boolean;
  readonly eligible: boolean;
  /** Why not, when not eligible while live. */
  readonly reason: 'NOT_LIVE' | 'NOT_FIRST_ORDER' | 'ORDER_TOO_SMALL' | 'NO_COINS' | 'REDEMPTIONS_EXHAUSTED' | null;
  readonly bonusCoins: number;
  readonly launch: LaunchOfferConfig;
}

/**
 * FIRST KICK: the welcome benefit on a customer's first paid order.
 *
 * Paid in coins with the order, never as money off, so it cannot push a
 * ladder price below what the economics allowed. Eligibility is decided
 * here, on the server, from what it can see: the signed-in account, the
 * browser session, and at order creation the contact email too, so a second
 * "first" order from a fresh browser with a known email does not qualify.
 */
@Injectable()
export class FirstOrderService {
  constructor(private readonly config: PricingConfigService) {}

  /** Whether the offer is switched on and inside its dates right now. */
  isLive(launch: LaunchOfferConfig, now = new Date()): boolean {
    if (!launch.enabled) {
      return false;
    }
    if (launch.startsAt && now < new Date(launch.startsAt)) {
      return false;
    }
    if (launch.endsAt && now >= new Date(launch.endsAt)) {
      return false;
    }
    return true;
  }

  /** Bonus coins for a cart that buys `coinsBought` coins, capped. */
  bonusFor(launch: LaunchOfferConfig, coinsBought: number): number {
    if (coinsBought <= 0) {
      return 0;
    }
    const raw = mulDivFloor(coinsBought, launch.benefit.percentBps, 10_000);
    // Whole thousands, so the figure reads like the rest of the shelf.
    const rounded = Math.floor(raw / 1_000) * 1_000;
    return Math.min(launch.benefit.capCoins, rounded);
  }

  /**
   * True when nobody matching the owner (or the email) has a qualifying order.
   * The email is only known at checkout; before that the answer is provisional.
   */
  async isFirstOrder(
    db: Db,
    owner: RewardOwner,
    contactEmail: string | null,
    excludeOrderId?: string,
  ): Promise<boolean> {
    const matchers: Prisma.OrderWhereInput[] = [];
    if (owner.customerId) {
      matchers.push({ customerId: owner.customerId });
    }
    if (owner.sessionId) {
      matchers.push({ sessionId: owner.sessionId });
    }
    if (contactEmail) {
      matchers.push({ contactEmail: { equals: contactEmail, mode: 'insensitive' } });
    }
    if (owner.customerId) {
      // A signed-in customer's account email counts as well as the order email.
      const customer = await db.customer.findUnique({ where: { id: owner.customerId }, select: { email: true } });
      if (customer?.email) {
        matchers.push({ contactEmail: { equals: customer.email, mode: 'insensitive' } });
      }
    }
    if (matchers.length === 0) {
      // Nobody at all: no history to check, but also nobody to attribute the
      // benefit to. Provisional yes; the email check at checkout decides.
      return true;
    }
    const prior = await db.order.count({
      where: {
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
        status: { in: [...QUALIFYING_ORDER_STATUSES] },
        OR: matchers,
      },
    });
    return prior === 0;
  }

  async redemptionsSoFar(db: Db, launchId: string): Promise<number> {
    return db.order.count({
      where: {
        status: { in: [...QUALIFYING_ORDER_STATUSES] },
        metadata: { path: ['campaignId'], equals: launchId },
      },
    });
  }

  /** The whole decision for a cart, in one call. */
  async decide(
    db: Db,
    input: { owner: RewardOwner; contactEmail: string | null; coinsBought: number; subtotalMinor: number; excludeOrderId?: string },
  ): Promise<FirstOrderDecision> {
    const { launch } = await this.config.get();
    const live = this.isLive(launch);
    const none = (reason: FirstOrderDecision['reason']): FirstOrderDecision => ({ live, eligible: false, reason, bonusCoins: 0, launch });
    if (!live) {
      return none('NOT_LIVE');
    }
    if (input.coinsBought <= 0) {
      return none('NO_COINS');
    }
    if (input.subtotalMinor < launch.benefit.minOrderMinor) {
      return none('ORDER_TOO_SMALL');
    }
    if (launch.maxRedemptions !== null && (await this.redemptionsSoFar(db, launch.id)) >= launch.maxRedemptions) {
      return none('REDEMPTIONS_EXHAUSTED');
    }
    if (!(await this.isFirstOrder(db, input.owner, input.contactEmail, input.excludeOrderId))) {
      return none('NOT_FIRST_ORDER');
    }
    const bonusCoins = this.bonusFor(launch, input.coinsBought);
    if (bonusCoins <= 0) {
      return none('NO_COINS');
    }
    return { live, eligible: true, reason: null, bonusCoins, launch };
  }
}
