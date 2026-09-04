import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { LocalizedText } from './growth-config';
import { GrowthConfigService } from './growth-config.service';
import { QUALIFYING_ORDER_STATUSES } from './growth-shared';

export type TrustMetricKey = 'completedOrders' | 'coinsDelivered' | 'medianFulfillmentMinutes' | 'repeatCustomers' | 'verifiedReviews';

export interface TrustMetric {
  readonly key: TrustMetricKey;
  readonly label: LocalizedText;
  readonly unit: 'count' | 'coins' | 'minutes';
  /** Present only when published. */
  readonly value: number | null;
  readonly published: boolean;
  /** How many observations the value rests on. */
  readonly sampleSize: number;
  readonly threshold: number;
}

export interface TrustSnapshot {
  readonly enabled: boolean;
  readonly asOf: string;
  readonly metrics: readonly TrustMetric[];
}

export interface RawTrustMetrics {
  readonly completedOrders: number;
  readonly coinsDelivered: number;
  readonly medianFulfillmentMinutes: number | null;
  readonly fulfillmentSamples: number;
  readonly repeatCustomers: number;
  readonly verifiedReviews: number;
}

const LABELS: Readonly<Record<TrustMetricKey, LocalizedText>> = {
  completedOrders: { he: 'הזמנות שסופקו', en: 'Orders delivered' },
  coinsDelivered: { he: 'קוינס שסופקו', en: 'Coins delivered' },
  medianFulfillmentMinutes: { he: 'זמן אספקה חציוני', en: 'Median delivery time' },
  repeatCustomers: { he: 'לקוחות שחזרו', en: 'Returning customers' },
  verifiedReviews: { he: 'ביקורות מרכישה מאומתת', en: 'Verified purchase reviews' },
};

/**
 * Trust from the books, not from copy.
 *
 * Every figure is computed from completed orders and published rows, and
 * every figure is withheld until it rests on enough of them. The storefront
 * renders a metric only when `published` is true, so a young shop says
 * nothing about its numbers rather than something small dressed up. The
 * owner sees the raw values through the admin API and sets the thresholds.
 */
@Injectable()
export class TrustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GrowthConfigService,
  ) {}

  async raw(): Promise<RawTrustMetrics> {
    const qualifying = [...QUALIFYING_ORDER_STATUSES];

    const [completedOrders, coinsRow, rewardCoinsRow, medianRow, repeatRow, verifiedReviews] = await Promise.all([
      this.prisma.order.count({ where: { status: 'FULFILLED' } }),
      this.prisma.$queryRaw<{ coins: bigint | number | null }[]>`
        SELECT COALESCE(SUM((COALESCE(v.quantity_value, 0) + COALESCE((v.metadata->>'launchBonus')::int, 0)) * oi.quantity), 0) AS coins
          FROM order_items oi
          JOIN product_variants v ON v.id = oi.variant_id
          JOIN products p ON p.id = oi.product_id
          JOIN orders o ON o.id = oi.order_id
         WHERE o.status = 'FULFILLED'
           AND p.type = 'GAME_CURRENCY'
      `,
      this.prisma.$queryRaw<{ coins: bigint | number | null }[]>`
        SELECT COALESCE(SUM((metadata->>'rewardCoins')::int), 0) AS coins
          FROM orders
         WHERE status = 'FULFILLED'
           AND metadata ? 'rewardCoins'
      `,
      this.prisma.$queryRaw<{ median: number | null; samples: bigint | number }[]>`
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) AS median, COUNT(*) AS samples
          FROM (
            SELECT EXTRACT(EPOCH FROM (MAX(f.delivered_at) - o.paid_at)) / 60 AS minutes
              FROM orders o
              JOIN fulfillments f ON f.order_id = o.id
             WHERE o.status = 'FULFILLED'
               AND o.paid_at IS NOT NULL
               AND f.delivered_at IS NOT NULL
             GROUP BY o.id, o.paid_at
          ) t
      `,
      this.prisma.$queryRaw<{ repeat: bigint | number }[]>`
        SELECT COUNT(*) AS repeat
          FROM (
            SELECT customer_id
              FROM orders
             WHERE customer_id IS NOT NULL
               AND status::text = ANY(${qualifying}::text[])
             GROUP BY customer_id
            HAVING COUNT(*) >= 2
          ) t
      `,
      this.prisma.review.count({ where: { published: true, verifiedPurchase: true } }),
    ]);

    const median = medianRow[0]?.median;
    return {
      completedOrders,
      coinsDelivered: Number(coinsRow[0]?.coins ?? 0) + Number(rewardCoinsRow[0]?.coins ?? 0),
      medianFulfillmentMinutes: median === null || median === undefined ? null : Math.round(Number(median)),
      fulfillmentSamples: Number(medianRow[0]?.samples ?? 0),
      repeatCustomers: Number(repeatRow[0]?.repeat ?? 0),
      verifiedReviews,
    };
  }

  /** The published view: a value appears only past its threshold. */
  async snapshot(): Promise<TrustSnapshot> {
    const [growth, raw] = await Promise.all([this.config.get(), this.raw()]);
    const { thresholds } = growth.trust;
    const enabled = growth.trust.enabled;

    const metric = (key: TrustMetricKey, unit: TrustMetric['unit'], value: number | null, sampleSize: number, threshold: number): TrustMetric => {
      const published = enabled && value !== null && sampleSize >= threshold;
      return { key, label: LABELS[key], unit, value: published ? value : null, published, sampleSize, threshold };
    };

    return {
      enabled,
      asOf: new Date().toISOString(),
      metrics: [
        metric('completedOrders', 'count', raw.completedOrders, raw.completedOrders, thresholds.completedOrders),
        metric('coinsDelivered', 'coins', raw.coinsDelivered, raw.coinsDelivered, thresholds.coinsDelivered),
        metric('medianFulfillmentMinutes', 'minutes', raw.medianFulfillmentMinutes, raw.fulfillmentSamples, thresholds.fulfillmentSamples),
        metric('repeatCustomers', 'count', raw.repeatCustomers, raw.repeatCustomers, thresholds.repeatCustomers),
        metric('verifiedReviews', 'count', raw.verifiedReviews, raw.verifiedReviews, thresholds.verifiedReviews),
      ],
    };
  }
}

// Referenced so the import is used when the enum list is inlined by Prisma.
void Prisma;
