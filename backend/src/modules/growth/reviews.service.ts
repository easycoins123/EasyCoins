import { Injectable } from '@nestjs/common';
import type { CustomerSession, Prisma } from '@prisma/client';

import { conflictError, notFoundError } from '../../common/errors/api-error';
import { generateId } from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { GrowthConfigService } from './growth-config.service';
import { requireReadableOrder } from './growth-shared';

export interface SubmitReviewInput {
  readonly orderId: string;
  readonly rating: number;
  readonly title?: string;
  readonly body: string;
}

/**
 * Verified-purchase reviews.
 *
 * A review can be written only against a delivered order the caller owns,
 * and only once per order. That is what `verifiedPurchase` means on the row:
 * not a badge the seed hands out, but a paid, delivered order behind the
 * words. New reviews wait for an operator unless the owner turns on
 * auto-publishing; either way the storefront shows verified reviews only.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GrowthConfigService,
    private readonly logger: AppLogger,
  ) {}

  async submit(session: CustomerSession | null, input: SubmitReviewInput): Promise<{ id: string; published: boolean; verifiedPurchase: true }> {
    const order = requireReadableOrder(
      await this.prisma.order.findUnique({
        where: { id: input.orderId },
        include: { items: { orderBy: { id: 'asc' }, include: { product: { select: { type: true } } } }, customer: { select: { displayName: true } } },
      }),
      session,
    );
    if (order.status !== 'FULFILLED') {
      throw conflictError(
        `Order ${order.id} is ${order.status}; only a delivered order can be reviewed`,
        'REVIEW_ORDER_NOT_DELIVERED',
        { he: 'אפשר לדרג הזמנה רק אחרי שסופקה.', en: 'An order can be reviewed once it has been delivered.' },
      );
    }
    const existing = await this.prisma.review.findUnique({ where: { orderId: order.id } });
    if (existing) {
      throw conflictError(
        `Order ${order.id} already has a review`,
        'REVIEW_EXISTS',
        { he: 'כבר כתבתם ביקורת על ההזמנה הזו. תודה!', en: 'You already reviewed this order. Thank you!' },
      );
    }

    const growth = await this.config.get();
    const coinItem = order.items.find((item) => item.product.type === 'GAME_CURRENCY') ?? order.items[0];
    const review = await this.prisma.review.create({
      data: {
        id: generateId('rev'),
        productId: coinItem?.productId ?? null,
        customerId: order.customerId,
        orderId: order.id,
        authorDisplayName: authorName(order.customer?.displayName, order.checkoutValues),
        rating: input.rating,
        title: input.title?.trim() || null,
        body: input.body.trim(),
        verifiedPurchase: true,
        published: growth.reviews.autoPublishVerified,
      },
    });
    this.logger.info('verified review submitted', { reviewId: review.id, orderId: order.id, published: review.published });
    return { id: review.id, published: review.published, verifiedPurchase: true };
  }

  async adminList(published?: boolean) {
    const rows = await this.prisma.review.findMany({
      where: published === undefined ? {} : { published },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      orderId: row.orderId,
      authorDisplayName: row.authorDisplayName,
      rating: row.rating,
      title: row.title,
      body: row.body,
      verifiedPurchase: row.verifiedPurchase,
      published: row.published,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async setPublished(id: string, published: boolean, operator: string): Promise<void> {
    const updated = await this.prisma.review.updateMany({ where: { id }, data: { published } });
    if (updated.count !== 1) {
      throw notFoundError(`Review ${id} not found`, 'REVIEW_NOT_FOUND');
    }
    await this.prisma.auditLog.create({
      data: {
        eventType: published ? 'review.published' : 'review.unpublished',
        entityType: 'review',
        entityId: id,
        actorType: 'OPERATOR',
        actorId: operator,
        afterState: { published } as Prisma.InputJsonValue,
      },
    });
  }
}

/** First name only, from the account or the checkout form; never an email. */
function authorName(displayName: string | null | undefined, checkoutValues: unknown): string {
  const fromAccount = displayName?.trim().split(/\s+/)[0];
  if (fromAccount) {
    return fromAccount;
  }
  const values = (checkoutValues ?? {}) as Record<string, unknown>;
  const fullName = typeof values['FULL_NAME'] === 'string' ? values['FULL_NAME'].trim().split(/\s+/)[0] : '';
  return fullName || 'לקוח/ה מאומת/ת';
}
