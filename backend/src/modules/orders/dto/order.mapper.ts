import type { Fulfillment, Order, OrderItem, PaymentIntent } from '@prisma/client';

import { toBenefitsDto } from '../../cart/dto/cart.mapper';
import { NO_BENEFITS, type CartBenefits } from '../../cart/pricing.service';

/**
 * Order rows to the wire shape the Angular mapper already parses.
 *
 * Two field names differ from the database on purpose, and this is the only
 * place that knows it: the column is `orderNumber` but the contract calls it
 * `reference`, and `displayVariant` is sent as `displayVariantName`. Renaming
 * either side to match would have meant changing a frozen frontend contract or
 * a schema that reads better as it is.
 */

type Money = { amountMinor: number; currency: string };

const money = (amountMinor: number, currency: string): Money => ({ amountMinor, currency });

export interface OrderResponse {
  id: string;
  reference: string;
  customerId: string | null;
  contactEmail: string;
  status: string;
  items: unknown[];
  totals: { subtotal: Money; discount: Money; total: Money };
  fulfillments: unknown[];
  payment: unknown | null;
  checkoutValues: Record<string, unknown>;
  couponCode: string | null;
  rewardId: string | null;
  rewardCoins: number;
  campaignId: string | null;
  campaignCoins: number;
  benefits: ReturnType<typeof toBenefitsDto>;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  statusMessage: unknown | null;
}

/** The variant and product fields an item response derives its coins from. */
export type OrderItemWithVariant = OrderItem & {
  variant?: { quantityValue: number | null; metadata: unknown };
  product?: { type: string; metadata?: unknown };
};

export type OrderWithRelations = Order & {
  items: OrderItemWithVariant[];
  fulfillments: Fulfillment[];
  paymentIntents: PaymentIntent[];
};

function launchBonusOf(metadata: unknown): number {
  const bonus = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['launchBonus'] : undefined;
  return typeof bonus === 'number' && bonus > 0 ? Math.round(bonus) : 0;
}

function toItem(item: OrderItemWithVariant, currency: string) {
  const isCoins = item.product?.type === 'GAME_CURRENCY';
  return {
    id: item.id,
    offerId: item.offerId,
    productId: item.productId,
    variantId: item.variantId,
    platformId: item.platformId,
    regionId: item.regionId,
    quantity: item.quantity,
    unitPrice: money(item.unitPriceMinor, currency),
    totalPrice: money(item.totalPriceMinor, currency),
    fulfillmentMethod: item.fulfillmentMethod,
    fulfillmentStatus: item.fulfillmentStatus,
    displayName: item.displayName,
    displayVariantName: item.displayVariant,
    imageUrl: item.imageUrl,
    coins: isCoins ? (item.variant?.quantityValue ?? 0) * item.quantity : 0,
    bonusCoins: isCoins ? launchBonusOf(item.variant?.metadata) * item.quantity : 0,
    // The game edition the product belonged to when it was sold. Read from
    // the product's own record, so an FC26 order stays an FC26 order after
    // FC27 goes on sale.
    edition: editionOf(item.variant?.metadata) ?? editionOf(item.product?.metadata) ?? (isCoins ? 'fc26' : null),
  };
}

function editionOf(metadata: unknown): string | null {
  const value = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['edition'] : undefined;
  return typeof value === 'string' && /^fc\d\d$/.test(value) ? value : null;
}

/** What the order carried beyond its lines, read from its own record. */
function growthOf(order: Order): { rewardId: string | null; rewardCoins: number; campaignId: string | null; campaignCoins: number; benefits: CartBenefits } {
  const metadata = (order.metadata ?? {}) as Record<string, unknown>;
  const rewardCoins = typeof metadata['rewardCoins'] === 'number' ? metadata['rewardCoins'] : 0;
  const campaignCoins = typeof metadata['campaignCoins'] === 'number' ? metadata['campaignCoins'] : 0;
  const campaignId = typeof metadata['campaignId'] === 'string' ? metadata['campaignId'] : null;
  const benefits = metadata['benefits'] && typeof metadata['benefits'] === 'object'
    ? (metadata['benefits'] as unknown as CartBenefits)
    : NO_BENEFITS;
  return {
    rewardId: typeof metadata['rewardId'] === 'string' ? metadata['rewardId'] : null,
    rewardCoins,
    campaignId,
    campaignCoins,
    benefits,
  };
}

/**
 * A delivered code is released only once the order is paid.
 *
 * The check is here, at the boundary, rather than only in the fulfillment
 * service: whatever route reaches this mapper, an unpaid order cannot leak the
 * thing the customer has not yet paid for.
 */
function toFulfillment(fulfillment: Fulfillment, orderIsPaid: boolean) {
  return {
    id: fulfillment.id,
    orderId: fulfillment.orderId,
    orderItemId: fulfillment.orderItemId,
    method: fulfillment.method,
    status: fulfillment.status,
    updatedAt: fulfillment.updatedAt.toISOString(),
    estimatedReadyAt: fulfillment.estimatedReadyAt?.toISOString() ?? null,
    /**
     * What the customer has to do for delivery to be possible.
     *
     * Released on the same condition as the delivery payload, and for the same
     * reason: it is part of what they bought. Unlike the payload it is shown
     * *before* delivery rather than after, because the customer performs the
     * listing and cannot do it without being told the exact price.
     *
     * It carries a card name and a number. There is no credential in it,
     * because none is ever collected.
     */
    instruction: orderIsPaid ? (fulfillment.customerInstruction ?? null) : null,
    delivery:
      orderIsPaid && fulfillment.deliveredAt
        ? {
            deliveredAt: fulfillment.deliveredAt.toISOString(),
            payload: fulfillment.deliveryPayload ?? { kind: 'NONE' },
          }
        : null,
    failureReason: fulfillment.failureReason,
  };
}

/** Statuses in which the customer has actually paid. */
const PAID_STATUSES = new Set([
  'PAID',
  'PROCESSING',
  'FULFILLMENT_PENDING',
  'FULFILLMENT_PROCESSING',
  'FULFILLED',
  'REFUND_PENDING',
  'REFUNDED',
]);

/**
 * The internal EXPIRED payment status has no member in the frontend domain.
 * Sending it would make the client fall back to PROCESSING and tell someone
 * their payment was still in flight, so it is reported as CANCELLED instead.
 */
function toWirePaymentStatus(status: string): string {
  return status === 'EXPIRED' ? 'CANCELLED' : status;
}

function toPayment(intent: PaymentIntent | undefined) {
  if (!intent) {
    return null;
  }
  return {
    id: intent.id,
    orderId: intent.orderId,
    provider: intent.provider,
    amount: money(intent.amountMinor, intent.currency),
    status: toWirePaymentStatus(intent.status),
    action: { kind: 'NONE' },
    createdAt: intent.createdAt.toISOString(),
    updatedAt: intent.updatedAt.toISOString(),
  };
}

export function toOrderResponse(order: OrderWithRelations): OrderResponse {
  const paid = PAID_STATUSES.has(order.status);
  const growth = growthOf(order);

  return {
    id: order.id,
    reference: order.orderNumber,
    customerId: order.customerId,
    contactEmail: order.contactEmail,
    status: order.status,
    items: order.items.map((item) => toItem(item, order.currency)),
    totals: {
      subtotal: money(order.subtotalMinor, order.currency),
      discount: money(order.discountMinor, order.currency),
      total: money(order.totalMinor, order.currency),
    },
    fulfillments: order.fulfillments.map((f) => toFulfillment(f, paid)),
    // The most recent intent is the one the customer is looking at.
    payment: toPayment(order.paymentIntents[0]),
    checkoutValues: (order.checkoutValues as Record<string, unknown>) ?? {},
    couponCode: order.couponCode,
    rewardId: growth.rewardId,
    rewardCoins: growth.rewardCoins,
    campaignId: growth.campaignId,
    campaignCoins: growth.campaignCoins,
    benefits: toBenefitsDto(growth.benefits),
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    statusMessage: order.statusMessage,
  };
}

/** The smaller payload the order page polls every few seconds. */
export function toOrderStatusResponse(order: OrderWithRelations) {
  const paid = PAID_STATUSES.has(order.status);
  return {
    orderId: order.id,
    status: order.status,
    fulfillments: order.fulfillments.map((f) => toFulfillment(f, paid)),
    updatedAt: order.updatedAt.toISOString(),
    statusMessage: order.statusMessage,
  };
}
