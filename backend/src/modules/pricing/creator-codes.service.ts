import { Injectable } from '@nestjs/common';
import type { Coupon, Prisma, Promotion } from '@prisma/client';

import { conflictError, notFoundError, validationError } from '../../common/errors/api-error';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { QUALIFYING_ORDER_STATUSES } from '../growth/growth-shared';
import { mulDivFloor } from './ladder-economics';

type Db = Prisma.TransactionClient | PrismaService;

/** The slug prefix that marks a promotion as a creator's code. */
export const CREATOR_PROMOTION_PREFIX = 'creator-';

export interface CreatorCodeInput {
  readonly code: string;
  readonly creator: string;
  readonly percentBps: number;
  readonly startsAt?: string | null;
  readonly endsAt?: string | null;
  readonly minSubtotalMinor?: number | null;
  readonly maxRedemptions?: number | null;
  readonly active?: boolean;
}

export interface CreatorCodeView {
  readonly code: string;
  readonly creator: string;
  readonly percentBps: number;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly minSubtotalMinor: number | null;
  readonly maxRedemptions: number | null;
  readonly redemptionCount: number;
  readonly active: boolean;
  readonly createdAt: string;
}

export interface ResolvedCode {
  readonly coupon: Coupon;
  readonly promotion: Promotion;
  readonly discountMinor: number;
  readonly creator: string | null;
}

/**
 * Creator codes, on the coupon tables the schema already has.
 *
 * A creator code is a coupon whose promotion slug starts with `creator-`
 * and whose description names the creator. Nothing about it is hard-coded:
 * the owner creates, pauses and caps codes from the admin, every order that
 * used one carries it in `orders.coupon_code`, and every redemption is a
 * `coupon_redemptions` row, so attribution is a query rather than a guess.
 *
 * The same lookup serves ordinary coupons, which closes an old gap: the
 * coupon table used to be written and never read.
 */
@Injectable()
export class CreatorCodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  normalize(code: string): string {
    return code.trim().toUpperCase();
  }

  /**
   * The discount a code is worth on a subtotal right now, or null with a
   * reason when it is worth nothing. Integer basis points throughout: the
   * promotion's percentage is read as a whole number of bps.
   */
  async resolve(db: Db, rawCode: string, subtotalMinor: number, customerId: string | null, now = new Date()): Promise<ResolvedCode | { reason: string }> {
    const code = this.normalize(rawCode);
    const coupon = await db.coupon.findUnique({ where: { code }, include: { promotion: true } });
    if (!coupon) {
      return { reason: 'UNKNOWN' };
    }
    if (!coupon.active || !coupon.promotion.active) {
      return { reason: 'INACTIVE' };
    }
    if (coupon.expiresAt && coupon.expiresAt <= now) {
      return { reason: 'EXPIRED' };
    }
    if (coupon.promotion.startsAt > now) {
      return { reason: 'NOT_STARTED' };
    }
    if (coupon.promotion.endsAt && coupon.promotion.endsAt <= now) {
      return { reason: 'EXPIRED' };
    }
    if (coupon.minSubtotalMinor !== null && subtotalMinor < coupon.minSubtotalMinor) {
      return { reason: 'MIN_SUBTOTAL' };
    }
    if (coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions) {
      return { reason: 'EXHAUSTED' };
    }
    if (customerId && coupon.maxPerCustomer > 0) {
      const used = await db.couponRedemption.count({ where: { couponId: coupon.id, customerId } });
      if (used >= coupon.maxPerCustomer) {
        return { reason: 'ALREADY_USED' };
      }
    }
    const discountMinor = discountOf(coupon.promotion, subtotalMinor);
    if (discountMinor <= 0) {
      return { reason: 'NO_VALUE' };
    }
    return { coupon, promotion: coupon.promotion, discountMinor, creator: creatorOf(coupon.promotion) };
  }

  /** Records that an order used a code. Called inside the order transaction. */
  async recordRedemption(db: Db, rawCode: string, orderId: string, customerId: string | null, amountMinor: number): Promise<void> {
    const code = this.normalize(rawCode);
    const coupon = await db.coupon.findUnique({ where: { code } });
    if (!coupon) {
      return; // A legacy promotion-slug code has no coupon row to count against.
    }
    await db.couponRedemption.create({
      data: { id: `cr_${orderId}`, couponId: coupon.id, orderId, customerId, amountMinor },
    });
    await db.coupon.update({ where: { id: coupon.id }, data: { redemptionCount: { increment: 1 } } });
  }

  async list(): Promise<CreatorCodeView[]> {
    const coupons = await this.prisma.coupon.findMany({
      where: { promotion: { slug: { startsWith: CREATOR_PROMOTION_PREFIX } } },
      include: { promotion: true },
      orderBy: { promotion: { startsAt: 'desc' } },
    });
    return coupons.map(toView);
  }

  async create(input: CreatorCodeInput, operator: string): Promise<CreatorCodeView> {
    const clean = this.sanitize(input);
    const existing = await this.prisma.coupon.findUnique({ where: { code: clean.code } });
    if (existing) {
      throw conflictError(`code ${clean.code} already exists`, 'CREATOR_CODE_EXISTS');
    }
    const slug = `${CREATOR_PROMOTION_PREFIX}${clean.code.toLowerCase()}`;
    const created = await this.prisma.$transaction(async (tx) => {
      const promotion = await tx.promotion.create({
        data: {
          id: `promo-${slug}`,
          slug,
          kind: 'PERCENT_OFF',
          title: { he: `קוד יוצר ${clean.code}`, en: `Creator code ${clean.code}` },
          description: { he: `קוד יוצר: ${clean.creator}`, en: `Creator code: ${clean.creator}` },
          percentOff: clean.percentBps / 100,
          amountOffMinor: null,
          currency: 'ILS',
          gameIds: [],
          productIds: [],
          regionIds: [],
          startsAt: clean.startsAt ? new Date(clean.startsAt) : new Date(),
          endsAt: clean.endsAt ? new Date(clean.endsAt) : null,
          active: clean.active,
        },
      });
      return tx.coupon.create({
        data: {
          id: `coupon-${slug}`,
          code: clean.code,
          promotionId: promotion.id,
          minSubtotalMinor: clean.minSubtotalMinor,
          maxRedemptions: clean.maxRedemptions,
          maxPerCustomer: 1,
          expiresAt: clean.endsAt ? new Date(clean.endsAt) : null,
          active: clean.active,
        },
        include: { promotion: true },
      });
    });
    await this.audit('pricing.creator_code.created', clean.code, operator, clean);
    this.logger.info('creator code created', { code: clean.code, operator });
    return toView(created);
  }

  async update(code: string, input: Partial<CreatorCodeInput>, operator: string): Promise<CreatorCodeView> {
    const normalized = this.normalize(code);
    const coupon = await this.prisma.coupon.findUnique({ where: { code: normalized }, include: { promotion: true } });
    if (!coupon || !coupon.promotion.slug.startsWith(CREATOR_PROMOTION_PREFIX)) {
      throw notFoundError(`creator code ${normalized} not found`, 'CREATOR_CODE_NOT_FOUND');
    }
    const clean = this.sanitize({
      code: normalized,
      creator: input.creator ?? creatorOf(coupon.promotion) ?? '',
      percentBps: input.percentBps ?? Math.round((coupon.promotion.percentOff ?? 0) * 100),
      startsAt: input.startsAt === undefined ? coupon.promotion.startsAt.toISOString() : input.startsAt,
      endsAt: input.endsAt === undefined ? coupon.promotion.endsAt?.toISOString() ?? null : input.endsAt,
      minSubtotalMinor: input.minSubtotalMinor === undefined ? coupon.minSubtotalMinor : input.minSubtotalMinor,
      maxRedemptions: input.maxRedemptions === undefined ? coupon.maxRedemptions : input.maxRedemptions,
      active: input.active ?? coupon.active,
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.promotion.update({
        where: { id: coupon.promotionId },
        data: {
          description: { he: `קוד יוצר: ${clean.creator}`, en: `Creator code: ${clean.creator}` },
          percentOff: clean.percentBps / 100,
          startsAt: clean.startsAt ? new Date(clean.startsAt) : coupon.promotion.startsAt,
          endsAt: clean.endsAt ? new Date(clean.endsAt) : null,
          active: clean.active,
        },
      });
      return tx.coupon.update({
        where: { id: coupon.id },
        data: {
          minSubtotalMinor: clean.minSubtotalMinor,
          maxRedemptions: clean.maxRedemptions,
          expiresAt: clean.endsAt ? new Date(clean.endsAt) : null,
          active: clean.active,
        },
        include: { promotion: true },
      });
    });
    await this.audit('pricing.creator_code.updated', clean.code, operator, clean);
    return toView(updated);
  }

  /** Orders attributed to a code: count and revenue, for the creator report. */
  async attribution(code: string): Promise<{ code: string; orders: number; revenueMinor: number; discountMinor: number }> {
    const normalized = this.normalize(code);
    const where = { couponCode: normalized, status: { in: [...QUALIFYING_ORDER_STATUSES] } };
    const [orders, sums] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.aggregate({ where, _sum: { totalMinor: true, discountMinor: true } }),
    ]);
    return {
      code: normalized,
      orders,
      revenueMinor: sums._sum?.totalMinor ?? 0,
      discountMinor: sums._sum?.discountMinor ?? 0,
    };
  }

  private sanitize(input: CreatorCodeInput): Required<Omit<CreatorCodeInput, 'startsAt' | 'endsAt' | 'minSubtotalMinor' | 'maxRedemptions'>> & {
    startsAt: string | null; endsAt: string | null; minSubtotalMinor: number | null; maxRedemptions: number | null;
  } {
    const code = this.normalize(String(input.code ?? ''));
    const fail = (field: string, message: string) => validationError(message, [{ field, message: { he: message, en: message } }], 'CREATOR_CODE_INVALID');
    if (!/^[A-Z0-9]{3,20}$/.test(code)) {
      throw fail('code', 'code must be 3 to 20 letters or digits');
    }
    const creator = String(input.creator ?? '').trim();
    if (creator.length === 0 || creator.length > 80) {
      throw fail('creator', 'creator must be 1 to 80 characters');
    }
    const percentBps = input.percentBps;
    // A code is at most 30% off: above that it is a giveaway, and the
    // ladder's own maximum discount clamps it again at pricing time.
    if (!Number.isInteger(percentBps) || percentBps < 100 || percentBps > 3_000) {
      throw fail('percentBps', 'percentBps must be an integer between 100 (1%) and 3000 (30%)');
    }
    const date = (value: string | null | undefined, field: string): string | null => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw fail(field, `${field} must be an ISO date`);
      }
      return value;
    };
    const startsAt = date(input.startsAt, 'startsAt');
    const endsAt = date(input.endsAt, 'endsAt');
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      throw fail('endsAt', 'endsAt must be after startsAt');
    }
    const minSubtotalMinor = input.minSubtotalMinor ?? null;
    if (minSubtotalMinor !== null && (!Number.isInteger(minSubtotalMinor) || minSubtotalMinor < 0 || minSubtotalMinor > 10_000_000)) {
      throw fail('minSubtotalMinor', 'minSubtotalMinor must be a non-negative integer');
    }
    const maxRedemptions = input.maxRedemptions ?? null;
    if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 10_000_000)) {
      throw fail('maxRedemptions', 'maxRedemptions must be a positive integer');
    }
    return { code, creator, percentBps, startsAt, endsAt, minSubtotalMinor, maxRedemptions, active: input.active ?? true };
  }

  private async audit(eventType: string, code: string, operator: string, state: unknown): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        eventType,
        entityType: 'creator_code',
        entityId: code,
        actorType: 'OPERATOR',
        actorId: operator,
        afterState: state as Prisma.InputJsonValue,
      },
    });
  }
}

/** The discount a promotion is worth, in whole agorot, from integer bps. */
export function discountOf(promotion: Pick<Promotion, 'percentOff' | 'amountOffMinor'>, subtotalMinor: number): number {
  if (promotion.percentOff !== null) {
    const bps = Math.round(promotion.percentOff * 100);
    return mulDivFloor(subtotalMinor, bps, 10_000);
  }
  if (promotion.amountOffMinor !== null) {
    return Math.min(subtotalMinor, promotion.amountOffMinor);
  }
  return 0;
}

export function creatorOf(promotion: Pick<Promotion, 'slug' | 'description'>): string | null {
  if (!promotion.slug.startsWith(CREATOR_PROMOTION_PREFIX)) {
    return null;
  }
  const description = promotion.description as { he?: string } | null;
  const match = description?.he?.match(/^קוד יוצר: (.+)$/);
  return match ? match[1] : null;
}

function toView(coupon: Coupon & { promotion: Promotion }): CreatorCodeView {
  return {
    code: coupon.code,
    creator: creatorOf(coupon.promotion) ?? '',
    percentBps: Math.round((coupon.promotion.percentOff ?? 0) * 100),
    startsAt: coupon.promotion.startsAt.toISOString(),
    endsAt: coupon.promotion.endsAt?.toISOString() ?? null,
    minSubtotalMinor: coupon.minSubtotalMinor,
    maxRedemptions: coupon.maxRedemptions,
    redemptionCount: coupon.redemptionCount,
    active: coupon.active && coupon.promotion.active,
    createdAt: coupon.promotion.startsAt.toISOString(),
  };
}
