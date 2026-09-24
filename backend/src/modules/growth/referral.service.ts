import { Injectable } from '@nestjs/common';
import type { CustomerSession, Order, Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';

import { generateId } from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { RateLimitRule, RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { PrismaService } from '../../database/prisma.service';
import { LocalizedText } from './growth-config';
import { GrowthConfigService } from './growth-config.service';
import { QUALIFYING_ORDER_STATUSES, addDays, isUniqueViolation, ownerOf } from './growth-shared';
import { RewardsService } from './rewards.service';

type Db = Prisma.TransactionClient | PrismaService;

/** Attaching a code costs a row; a script must not be able to write thousands. */
const ATTACH_PER_IP: RateLimitRule = { name: 'referral:attach:ip', limit: 30, windowSeconds: 60 * 60 };

/** No 0/O, 1/I/L: a code is read aloud and typed from a phone. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface ReferralSummary {
  readonly enabled: boolean;
  readonly code: string | null;
  readonly path: string | null;
  readonly friendReward: LocalizedText;
  readonly referrerReward: LocalizedText;
  readonly stats: { readonly pending: number; readonly rewarded: number; readonly rejected: number };
  readonly monthlyCap: number;
}

export type AttachOutcome = 'ATTACHED' | 'ALREADY_ATTACHED' | 'SELF' | 'EXISTING_CUSTOMER' | 'UNKNOWN_CODE' | 'DISABLED';

export interface AttachResult {
  readonly attached: boolean;
  readonly outcome: AttachOutcome;
  readonly friendReward: LocalizedText | null;
}

/**
 * Friend brings friend, with a ledger and without loopholes.
 *
 * A click earns nothing and a registration earns nothing. The referred
 * visitor's FIRST paid order, and only that, qualifies the attribution; both
 * rewards are written then, in one transaction, against that order. The
 * rules that refuse an attribution are listed in `qualifyOnPaid`, each with a
 * stored reason so a dispute can be answered from the row.
 */
@Injectable()
export class ReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GrowthConfigService,
    private readonly rewards: RewardsService,
    private readonly rateLimit: RateLimitService,
    private readonly logger: AppLogger,
  ) {}

  /** The customer's code, minted on first request. */
  async codeFor(customerId: string): Promise<string> {
    const existing = await this.prisma.referralCode.findUnique({ where: { customerId } });
    if (existing) {
      return existing.code;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateCode();
      try {
        const created = await this.prisma.referralCode.create({ data: { customerId, code } });
        return created.code;
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        const raced = await this.prisma.referralCode.findUnique({ where: { customerId } });
        if (raced) {
          return raced.code;
        }
      }
    }
    throw new Error('could not mint a unique referral code');
  }

  async summary(customerId: string): Promise<ReferralSummary> {
    const growth = await this.config.get();
    if (!growth.referral.enabled) {
      return {
        enabled: false,
        code: null,
        path: null,
        friendReward: growth.referral.friendReward.title,
        referrerReward: growth.referral.referrerReward.title,
        stats: { pending: 0, rewarded: 0, rejected: 0 },
        monthlyCap: growth.referral.maxRewardsPerReferrerPerMonth,
      };
    }
    const code = await this.codeFor(customerId);
    const grouped = await this.prisma.referralAttribution.groupBy({
      by: ['status'],
      where: { referrerCustomerId: customerId },
      _count: { _all: true },
    });
    const count = (status: string) => grouped.find((row) => row.status === status)?._count._all ?? 0;
    return {
      enabled: true,
      code,
      path: `/r/${code}`,
      friendReward: growth.referral.friendReward.title,
      referrerReward: growth.referral.referrerReward.title,
      stats: { pending: count('PENDING') + count('QUALIFIED'), rewarded: count('REWARDED'), rejected: count('REJECTED') },
      monthlyCap: growth.referral.maxRewardsPerReferrerPerMonth,
    };
  }

  /**
   * Records that this visitor came through a code.
   *
   * Refused outright for the code's own customer and for anyone who has
   * already bought here: a referral programme rewards new customers, and the
   * cheapest abuse is a customer referring themselves through a second tab.
   * One attribution per visitor; the first code wins.
   */
  async attach(rawCode: string, session: CustomerSession, ip: string | null): Promise<AttachResult> {
    const growth = await this.config.get();
    if (!growth.referral.enabled) {
      return { attached: false, outcome: 'DISABLED', friendReward: null };
    }
    await this.rateLimit.consume(ATTACH_PER_IP, ip ?? 'unknown');

    const code = rawCode.trim().toUpperCase();
    const referral = await this.prisma.referralCode.findUnique({ where: { code } });
    if (!referral) {
      return { attached: false, outcome: 'UNKNOWN_CODE', friendReward: null };
    }
    if (session.customerId && session.customerId === referral.customerId) {
      return { attached: false, outcome: 'SELF', friendReward: null };
    }
    if (session.customerId) {
      const bought = await this.prisma.order.count({
        where: { customerId: session.customerId, status: { in: [...QUALIFYING_ORDER_STATUSES] } },
      });
      if (bought > 0) {
        return { attached: false, outcome: 'EXISTING_CUSTOMER', friendReward: null };
      }
    }

    const existing = await this.prisma.referralAttribution.findFirst({
      where: {
        OR: [
          ...(session.customerId ? [{ referredCustomerId: session.customerId }] : []),
          { referredSessionId: session.id },
        ],
      },
    });
    if (existing) {
      return { attached: true, outcome: 'ALREADY_ATTACHED', friendReward: growth.referral.friendReward.title };
    }

    try {
      await this.prisma.referralAttribution.create({
        data: {
          id: generateId('ref'),
          code,
          referrerCustomerId: referral.customerId,
          referredCustomerId: session.customerId,
          referredSessionId: session.id,
          requestIp: ip,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { attached: true, outcome: 'ALREADY_ATTACHED', friendReward: growth.referral.friendReward.title };
      }
      throw error;
    }
    this.logger.info('referral attached', { referrer: referral.customerId, authenticated: session.customerId !== null });
    return { attached: true, outcome: 'ATTACHED', friendReward: growth.referral.friendReward.title };
  }

  /**
   * The moment of truth: a paid order by a referred visitor.
   *
   * Every refusal is recorded on the attribution with its reason. The order of
   * checks matters only for the message; none of them can be bypassed by
   * ordering, because all of them must pass.
   */
  async qualifyOnPaid(db: Db, order: Pick<Order, 'id' | 'customerId' | 'sessionId' | 'contactEmail' | 'totalMinor' | 'status' | 'paidAt' | 'createdAt'>): Promise<void> {
    const growth = await this.config.get();
    if (!growth.referral.enabled) {
      return;
    }
    const attribution = await db.referralAttribution.findFirst({
      where: {
        status: 'PENDING',
        OR: [
          ...(order.customerId ? [{ referredCustomerId: order.customerId }] : []),
          ...(order.sessionId ? [{ referredSessionId: order.sessionId }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!attribution) {
      return;
    }

    const reject = async (reason: string) => {
      await db.referralAttribution.update({ where: { id: attribution.id }, data: { status: 'REJECTED', reason, orderId: order.id } });
      this.logger.info('referral rejected', { attributionId: attribution.id, reason });
    };

    const paidAt = order.paidAt ?? order.createdAt;
    if (paidAt.getTime() - attribution.createdAt.getTime() > growth.referral.attributionDays * 24 * 60 * 60 * 1000) {
      return reject('ATTRIBUTION_EXPIRED');
    }
    if (order.customerId && order.customerId === attribution.referrerCustomerId) {
      return reject('SELF_REFERRAL');
    }
    const referrer = await db.customer.findUnique({ where: { id: attribution.referrerCustomerId }, select: { email: true, status: true } });
    if (!referrer || referrer.status !== 'ACTIVE') {
      return reject('REFERRER_INACTIVE');
    }
    if (referrer.email.toLowerCase() === order.contactEmail.toLowerCase()) {
      return reject('SAME_EMAIL');
    }
    const priorOrders = await db.order.count({
      where: {
        id: { not: order.id },
        status: { in: [...QUALIFYING_ORDER_STATUSES] },
        OR: [
          ...(order.customerId ? [{ customerId: order.customerId }] : []),
          ...(order.sessionId ? [{ sessionId: order.sessionId }] : []),
          { contactEmail: order.contactEmail },
        ],
      },
    });
    if (priorOrders > 0) {
      return reject('NOT_FIRST_ORDER');
    }
    if (order.totalMinor < growth.referral.minFriendOrderMinor) {
      return reject('ORDER_TOO_SMALL');
    }
    const monthAgo = addDays(new Date(), -30);
    const rewardedThisMonth = await db.referralAttribution.count({
      where: { referrerCustomerId: attribution.referrerCustomerId, status: 'REWARDED', updatedAt: { gte: monthAgo } },
    });
    if (rewardedThisMonth >= growth.referral.maxRewardsPerReferrerPerMonth) {
      return reject('REFERRER_MONTHLY_CAP');
    }

    // Claim the attribution first: only one order can ever qualify it.
    const claimed = await db.referralAttribution.updateMany({
      where: { id: attribution.id, status: 'PENDING' },
      data: {
        status: 'REWARDED',
        orderId: order.id,
        ...(order.customerId && !attribution.referredCustomerId ? { referredCustomerId: order.customerId } : {}),
      },
    });
    if (claimed.count !== 1) {
      return;
    }

    await this.rewards.issue(db, {
      owner: { customerId: attribution.referrerCustomerId, sessionId: null },
      source: 'REFERRAL_REFERRER',
      sourceOrderId: order.id,
      template: growth.referral.referrerReward,
      defaultExpiresInDays: 60,
      metadata: { attributionId: attribution.id },
    });
    await this.rewards.issue(db, {
      owner: ownerOf(order),
      source: 'REFERRAL_FRIEND',
      sourceOrderId: order.id,
      template: growth.referral.friendReward,
      defaultExpiresInDays: 60,
      metadata: { attributionId: attribution.id },
    });
    this.logger.info('referral rewarded', { attributionId: attribution.id, orderId: order.id });
  }
}

function generateCode(): string {
  let code = 'EC';
  for (let index = 0; index < 6; index += 1) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}
