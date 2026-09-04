import type { CustomerReward, CustomerSession, Order, OrderStatus, Prisma, RewardKind } from '@prisma/client';

import { notFoundError } from '../../common/errors/api-error';
import type { LocalizedText } from './growth-config';

/** The coin product every growth programme is built around. Matches the seed. */
export const COIN_PRODUCT_SLUG = 'ea-fc-ultimate-team-coins';

/**
 * Order states that mean "the customer paid and we still owe, or delivered,
 * the goods". Everything a customer earns is counted from these and nothing
 * else; a cancelled, failed or refunded order earns nothing, and stops
 * counting the moment it becomes one.
 */
export const QUALIFYING_ORDER_STATUSES: readonly OrderStatus[] = [
  'PAID', 'PROCESSING', 'FULFILLMENT_PENDING', 'FULFILLMENT_PROCESSING', 'FULFILLED',
];

/** States from which an order will never qualify again. */
export const CLOSED_ORDER_STATUSES: readonly OrderStatus[] = ['CANCELLED', 'FAILED', 'REFUND_PENDING', 'REFUNDED'];

export function isQualifying(status: OrderStatus): boolean {
  return QUALIFYING_ORDER_STATUSES.includes(status);
}

/**
 * Who holds a reward: the customer when there is one, otherwise the browser
 * session that earned it. The same rule as orders, so what a guest earns
 * follows the same path into an account as what they bought.
 */
export interface RewardOwner {
  readonly customerId: string | null;
  readonly sessionId: string | null;
}

export function ownerOf(row: { customerId: string | null; sessionId: string | null }): RewardOwner {
  return { customerId: row.customerId, sessionId: row.sessionId };
}

export function hasOwner(owner: RewardOwner): boolean {
  return owner.customerId !== null || owner.sessionId !== null;
}

/** The filter that selects rows an owner may see. Matches nothing for nobody. */
export function ownerWhere(owner: RewardOwner): Prisma.CustomerRewardWhereInput {
  if (owner.customerId) {
    return { customerId: owner.customerId };
  }
  if (owner.sessionId) {
    return { sessionId: owner.sessionId, customerId: null };
  }
  return { id: '__none__' };
}

/** The owner a session represents. */
export function ownerOfSession(session: CustomerSession | null): RewardOwner {
  return { customerId: session?.customerId ?? null, sessionId: session?.id ?? null };
}

/**
 * The ownership rule for orders, repeated here so this module does not import
 * `OrdersModule` (which, through checkout and cart, imports this one). It is
 * the same rule as `OrderAccessService.canRead`, and must stay so: a signed-in
 * customer reads their orders, a guest session reads the orders it placed,
 * and everything else is not found rather than forbidden.
 */
export function canReadOrder(order: Pick<Order, 'customerId' | 'sessionId'>, session: CustomerSession | null): boolean {
  if (!session) {
    return false;
  }
  if (order.customerId !== null && session.customerId !== null) {
    return order.customerId === session.customerId;
  }
  if (order.sessionId !== null) {
    return order.sessionId === session.id;
  }
  return false;
}

export function requireReadableOrder<T extends Pick<Order, 'id' | 'customerId' | 'sessionId'>>(
  order: T | null,
  session: CustomerSession | null,
): T {
  if (!order || !canReadOrder(order, session)) {
    throw notFoundError('Order not readable by this caller', 'ORDER_NOT_FOUND');
  }
  return order;
}

/** Reward kinds a customer applies at checkout; the rest apply by themselves. */
export const CHECKOUT_REWARD_KINDS: readonly RewardKind[] = ['NEXT_ORDER_COINS', 'NEXT_ORDER_CREDIT'];

export type RewardUsage = 'checkout' | 'automatic' | 'immediate';

/** When a reward takes effect, for the sentence under it. */
export function usageOf(kind: RewardKind): RewardUsage {
  switch (kind) {
    case 'NEXT_ORDER_COINS':
    case 'NEXT_ORDER_CREDIT':
    case 'OFFER_UNLOCK':
    case 'EXTRA_COINS':
      return 'checkout';
    case 'POINTS_MULTIPLIER':
      return 'automatic';
    case 'POINTS_BONUS':
    case 'TIER_BOOST':
    default:
      return 'immediate';
  }
}

export function localizedOf(value: unknown, fallback = ''): LocalizedText {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['he'] === 'string') {
      return { he: record['he'], en: typeof record['en'] === 'string' ? record['en'] : record['he'] };
    }
  }
  return { he: fallback, en: fallback };
}

/** A reward as the storefront sees it. Nothing here identifies another customer. */
export interface RewardView {
  readonly id: string;
  readonly source: string;
  readonly kind: RewardKind;
  readonly value: number;
  readonly title: LocalizedText;
  readonly status: string;
  readonly usage: RewardUsage;
  readonly minOrderMinor: number | null;
  readonly expiresAt: string | null;
  readonly sourceOrderId: string | null;
  readonly redeemedOrderId: string | null;
  readonly createdAt: string;
}

export function toRewardView(reward: CustomerReward): RewardView {
  return {
    id: reward.id,
    source: reward.source,
    kind: reward.kind,
    value: reward.value,
    title: localizedOf(reward.title),
    status: reward.status,
    usage: usageOf(reward.kind),
    minOrderMinor: reward.minOrderMinor,
    expiresAt: reward.expiresAt?.toISOString() ?? null,
    sourceOrderId: reward.sourceOrderId,
    redeemedOrderId: reward.redeemedOrderId,
    createdAt: reward.createdAt.toISOString(),
  };
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}
