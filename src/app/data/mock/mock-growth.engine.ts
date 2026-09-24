import {
  CartBenefits, ClubSummary, ClubTier, EasyDrop, LocalizedText, Money, Order, OrderStatus, Reward, RewardKind,
  RewardSource, RewardWallet, TrustSnapshot, conflictError, isRedeemableAtCheckout, localized, validationError,
} from '../../domain';
import {
  MOCK_CLUB_TIERS, MOCK_EASYDROP, MOCK_FOUNDERS, MOCK_POINTS_PER_SHEKEL, MOCK_REFERRAL, MOCK_STREAK,
  MOCK_TRUST_THRESHOLDS, MockDropPool, MockRewardTemplate,
} from './growth.seed';
import { MockBackendService, MockDrop } from './mock-backend.service';

/**
 * The growth programmes of the in-memory backend.
 *
 * Plain functions over the mock's state, so the payment simulator, the cart
 * pricer and the growth API can all call them without injecting each other.
 * They follow the real server's rules (see `backend/src/modules/growth`): one
 * drop per paid order, drawn once; a reveal recorded once; rewards held,
 * spent and returned with the order; points and tiers computed from paid
 * orders every time. Single-owner, because the mock has one visitor.
 */

const QUALIFYING: readonly OrderStatus[] = [
  OrderStatus.Paid, OrderStatus.Processing, OrderStatus.FulfillmentPending, OrderStatus.FulfillmentProcessing, OrderStatus.Fulfilled,
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function isQualifyingOrder(order: Order): boolean {
  return QUALIFYING.includes(order.status);
}

export function qualifyingOrders(backend: MockBackendService, customerOnly = false): Order[] {
  return [...backend.orders.values()]
    .filter((order) => isQualifyingOrder(order) && (!customerOnly || order.customerId === backend.currentCustomerId))
    .sort((a, b) => (a.paidAt ?? a.createdAt).localeCompare(b.paidAt ?? b.createdAt));
}

// --- rewards -----------------------------------------------------------------

function usageOf(kind: RewardKind): Reward['usage'] {
  switch (kind) {
    case 'NEXT_ORDER_COINS':
    case 'NEXT_ORDER_CREDIT':
    case 'OFFER_UNLOCK':
    case 'EXTRA_COINS':
      return 'checkout';
    case 'POINTS_MULTIPLIER':
      return 'automatic';
    default:
      return 'immediate';
  }
}

/** Issues a reward once per source and order, like the real ledger's unique constraint. */
export function issueReward(
  backend: MockBackendService,
  template: MockRewardTemplate,
  source: RewardSource,
  sourceOrderId: string,
  expiresInDays = MOCK_EASYDROP.expiresInDays,
): Reward {
  const existing = [...backend.rewards.values()].find((reward) => reward.source === source && reward.sourceOrderId === sourceOrderId);
  if (existing) {
    return existing;
  }
  const immediate = template.kind === 'POINTS_BONUS' || template.kind === 'TIER_BOOST';
  const now = new Date();
  const reward: Reward = {
    id: backend.nextId('rwd'),
    source,
    kind: template.kind,
    value: template.value,
    title: template.title,
    status: immediate ? 'REDEEMED' : 'AVAILABLE',
    usage: usageOf(template.kind),
    minOrder: template.minOrderMinor !== undefined ? { amountMinor: template.minOrderMinor, currency: 'ILS' } : undefined,
    expiresAt: template.kind === 'POINTS_BONUS'
      ? undefined
      : new Date(now.getTime() + (template.kind === 'TIER_BOOST' ? 30 : expiresInDays) * DAY_MS).toISOString(),
    sourceOrderId,
    redeemedOrderId: immediate ? sourceOrderId : undefined,
    createdAt: now.toISOString(),
  };
  backend.rewards.set(reward.id, reward);
  return reward;
}

function updateReward(backend: MockBackendService, id: string, patch: Partial<Reward>): void {
  const current = backend.rewards.get(id);
  if (current) {
    backend.rewards.set(id, { ...current, ...patch });
  }
}

export function wallet(backend: MockBackendService): RewardWallet {
  const now = Date.now();
  for (const reward of backend.rewards.values()) {
    if (reward.status === 'AVAILABLE' && reward.expiresAt && Date.parse(reward.expiresAt) <= now) {
      updateReward(backend, reward.id, { status: 'EXPIRED' });
    }
  }
  const all = [...backend.rewards.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    available: all.filter((reward) => reward.status === 'AVAILABLE' || reward.status === 'RESERVED'),
    history: all.filter((reward) => reward.status !== 'AVAILABLE' && reward.status !== 'RESERVED'),
  };
}

export interface RedeemableCheck {
  readonly reward?: Reward;
  readonly eligible: boolean;
  readonly reason?: { readonly code: string; readonly message: LocalizedText };
}

export function redeemable(backend: MockBackendService, rewardId: string, subtotalMinor: number, hasCoinLine: boolean): RedeemableCheck {
  const reward = backend.rewards.get(rewardId);
  if (!reward) {
    return { eligible: false, reason: { code: 'REWARD_NOT_FOUND', message: localized('ההטבה לא נמצאה.', 'That reward was not found.') } };
  }
  if (reward.usage !== 'checkout') {
    return { reward, eligible: false, reason: { code: 'REWARD_NOT_CHECKOUT', message: localized('ההטבה הזו חלה מעצמה ולא בקופה.', 'This reward applies on its own, not at checkout.') } };
  }
  if (reward.status !== 'AVAILABLE') {
    return { reward, eligible: false, reason: { code: 'REWARD_NOT_AVAILABLE', message: localized('ההטבה כבר נוצלה או אינה זמינה.', 'This reward was already used or is no longer available.') } };
  }
  if (reward.expiresAt && Date.parse(reward.expiresAt) <= Date.now()) {
    return { reward, eligible: false, reason: { code: 'REWARD_EXPIRED', message: localized('תוקף ההטבה פג.', 'This reward has expired.') } };
  }
  if (reward.minOrder && subtotalMinor < reward.minOrder.amountMinor) {
    const shekels = Math.ceil(reward.minOrder.amountMinor / 100);
    return { reward, eligible: false, reason: { code: 'REWARD_MIN_ORDER', message: localized(`ההטבה תקפה להזמנה מ־${shekels} ₪.`, `This reward applies to orders from ₪${shekels}.`) } };
  }
  if (reward.kind === 'NEXT_ORDER_COINS' && !hasCoinLine) {
    return { reward, eligible: false, reason: { code: 'REWARD_NEEDS_COINS', message: localized('בונוס קוינס מצטרף להזמנת קוינס בלבד.', 'A coin bonus attaches to a coin order only.') } };
  }
  return { reward, eligible: true };
}

export function reserveReward(backend: MockBackendService, rewardId: string, orderId: string): void {
  const reward = backend.rewards.get(rewardId);
  if (!reward || reward.status !== 'AVAILABLE') {
    throw conflictError(`Reward ${rewardId} is no longer available`, localized(
      'ההטבה שבחרתם כבר לא זמינה. הסירו אותה מהעגלה ונסו שוב.',
      'The reward you chose is no longer available. Remove it from the cart and try again.',
    ));
  }
  updateReward(backend, rewardId, { status: 'RESERVED', redeemedOrderId: orderId });
}

export function redeemForOrder(backend: MockBackendService, orderId: string): void {
  for (const reward of backend.rewards.values()) {
    if (reward.redeemedOrderId === orderId && reward.status === 'RESERVED') {
      updateReward(backend, reward.id, { status: 'REDEEMED' });
    }
  }
}

export function releaseForOrder(backend: MockBackendService, orderId: string): void {
  for (const reward of backend.rewards.values()) {
    if (reward.redeemedOrderId === orderId && reward.status === 'RESERVED') {
      updateReward(backend, reward.id, { status: 'AVAILABLE', redeemedOrderId: undefined });
    }
  }
}

// --- EasyDrop ----------------------------------------------------------------

export function poolFor(totalMinor: number): MockDropPool | undefined {
  return [...MOCK_EASYDROP.pools]
    .sort((a, b) => a.minTotalMinor - b.minTotalMinor)
    .filter((pool) => pool.minTotalMinor <= totalMinor && pool.cards.length > 0)
    .pop();
}

export function drawCards(pool: readonly MockRewardTemplate[], count: number): MockRewardTemplate[] {
  const cards: MockRewardTemplate[] = [];
  let remaining: MockRewardTemplate[] = [];
  while (cards.length < count) {
    if (remaining.length === 0) {
      remaining = [...pool];
    }
    const total = remaining.reduce((sum, card) => sum + (card.weight ?? 1), 0);
    let roll = Math.random() * total;
    let index = 0;
    for (; index < remaining.length - 1; index += 1) {
      roll -= remaining[index].weight ?? 1;
      if (roll <= 0) {
        break;
      }
    }
    const [picked] = remaining.splice(index, 1);
    const { weight: _weight, ...card } = picked;
    cards.push(card);
  }
  return cards;
}

export function ensureDrop(backend: MockBackendService, order: Order): MockDrop | undefined {
  const existing = backend.drops.get(order.id);
  if (existing) {
    return existing;
  }
  if (!MOCK_EASYDROP.enabled || !isQualifyingOrder(order)) {
    return undefined;
  }
  const pool = poolFor(order.totals.total.amountMinor);
  if (!pool) {
    return undefined;
  }
  const drop: MockDrop = {
    orderId: order.id,
    tier: pool.tier,
    tierName: pool.name,
    status: 'ISSUED',
    cards: drawCards(pool.cards, MOCK_EASYDROP.cardsPerDrop),
    issuedAt: backend.now(),
  };
  backend.drops.set(order.id, drop);
  return drop;
}

export function dropView(backend: MockBackendService, drop: MockDrop): EasyDrop {
  return {
    orderId: drop.orderId,
    tier: drop.tier,
    tierName: drop.tierName,
    status: drop.status,
    cardCount: drop.cards.length,
    pickedIndex: drop.pickedIndex,
    reward: drop.rewardId ? backend.rewards.get(drop.rewardId) : undefined,
    issuedAt: drop.issuedAt,
    revealedAt: drop.revealedAt,
  };
}

export function revealDrop(backend: MockBackendService, orderId: string, index: number): EasyDrop {
  const order = backend.orders.get(orderId);
  const drop = order ? ensureDrop(backend, order) : undefined;
  if (!drop) {
    throw conflictError(`Order ${orderId} has no EasyDrop`, localized('אין EASYDROP להזמנה הזו.', 'There is no EASYDROP for this order.'));
  }
  if (drop.status === 'REVEALED') {
    return dropView(backend, drop);
  }
  if (!Number.isInteger(index) || index < 0 || index >= drop.cards.length) {
    throw validationError('index is out of range', [{ field: 'index', message: localized('בחרו קלף מתוך הקלפים המוצגים.', 'Choose one of the cards shown.') }]);
  }
  const reward = issueReward(backend, drop.cards[index], 'EASYDROP', orderId);
  const revealed: MockDrop = { ...drop, status: 'REVEALED', pickedIndex: index, rewardId: reward.id, revealedAt: backend.now() };
  backend.drops.set(orderId, revealed);
  return dropView(backend, revealed);
}

// --- what a paid order sets in motion -----------------------------------------

export function onOrderPaid(backend: MockBackendService, order: Order): void {
  if (!isQualifyingOrder(order)) {
    return;
  }
  // A waiting multiplier attaches to this order by itself.
  const multiplier = [...backend.rewards.values()].find((reward) => reward.kind === 'POINTS_MULTIPLIER' && reward.status === 'AVAILABLE');
  if (multiplier) {
    updateReward(backend, multiplier.id, { status: 'REDEEMED', redeemedOrderId: order.id });
  }
  ensureDrop(backend, order);

  if (order.customerId) {
    if (MOCK_FOUNDERS.enabled && !backend.founderSeats.has(order.customerId) && backend.founderSeats.size < MOCK_FOUNDERS.cap) {
      backend.founderSeats.set(order.customerId, backend.founderSeats.size + 1);
      issueReward(backend, MOCK_FOUNDERS.reward, 'FOUNDER', order.id, 365);
    }
    if (MOCK_STREAK.enabled) {
      const position = streakPosition(qualifyingOrders(backend, true), order.id);
      const step = MOCK_STREAK.rewards.find((entry) => entry.purchase === position);
      if (step) {
        issueReward(backend, step.reward, 'STREAK', order.id);
      }
    }
  }

  // Referral: the first paid order after arriving through a friend's link.
  if (backend.referral?.status === 'PENDING' && MOCK_REFERRAL.enabled) {
    const prior = qualifyingOrders(backend).filter((candidate) => candidate.id !== order.id).length;
    if (prior === 0 && order.customerId !== 'cust_mock_referrer') {
      issueReward(backend, MOCK_REFERRAL.friendReward, 'REFERRAL_FRIEND', order.id, 60);
      backend.referral = { ...backend.referral, status: 'REWARDED' };
    } else {
      backend.referral = { ...backend.referral, status: 'REJECTED' };
    }
  }
}

function streakLength(orders: readonly Order[], windowDays: number): number {
  let chain = 0;
  let previous: number | null = null;
  for (const order of orders) {
    const at = Date.parse(order.paidAt ?? order.createdAt);
    chain = previous !== null && at - previous <= windowDays * DAY_MS ? chain + 1 : 1;
    previous = at;
  }
  return chain;
}

function streakPosition(orders: readonly Order[], orderId: string): number {
  let chain = 0;
  let previous: number | null = null;
  for (const order of orders) {
    const at = Date.parse(order.paidAt ?? order.createdAt);
    chain = previous !== null && at - previous <= MOCK_STREAK.windowDays * DAY_MS ? chain + 1 : 1;
    previous = at;
    if (order.id === orderId) {
      return chain;
    }
  }
  return 0;
}

// --- EASYCLUB ----------------------------------------------------------------

function tierIndexFor(points: number, tiers: readonly ClubTier[]): number {
  let index = 0;
  tiers.forEach((tier, position) => {
    if (points >= tier.minPoints) {
      index = position;
    }
  });
  return index;
}

export function club(backend: MockBackendService): ClubSummary {
  const orders = qualifyingOrders(backend, true);
  const rewards = [...backend.rewards.values()];
  const now = Date.now();
  const multipliers = new Map<string, number>();
  for (const reward of rewards) {
    if (reward.kind === 'POINTS_MULTIPLIER' && reward.status === 'REDEEMED' && reward.redeemedOrderId) {
      multipliers.set(reward.redeemedOrderId, Math.max(multipliers.get(reward.redeemedOrderId) ?? 100, reward.value));
    }
  }
  const base = orders.reduce((sum, order) => sum + Math.floor((order.totals.total.amountMinor / 100) * MOCK_POINTS_PER_SHEKEL * ((multipliers.get(order.id) ?? 100) / 100)), 0);
  const bonus = rewards
    .filter((reward) => reward.kind === 'POINTS_BONUS' && reward.status === 'REDEEMED')
    .filter((reward) => !reward.sourceOrderId || isQualifyingOrder(backend.orders.get(reward.sourceOrderId) ?? ({ status: OrderStatus.Cancelled } as Order)))
    .reduce((sum, reward) => sum + reward.value, 0);
  const total = base + bonus;
  const tiers = MOCK_CLUB_TIERS;
  const naturalIndex = tierIndexFor(total, tiers);
  const boosts = rewards.filter((reward) => reward.kind === 'TIER_BOOST' && reward.status === 'REDEEMED' && (!reward.expiresAt || Date.parse(reward.expiresAt) > now));
  const boostTiers = boosts.reduce((sum, reward) => sum + reward.value, 0);
  const boostedIndex = Math.min(tiers.length - 1, naturalIndex + boostTiers);
  const next = tiers[naturalIndex + 1];
  const current = tiers[boostedIndex];
  const chain = streakLength(orders, MOCK_STREAK.windowDays);
  const last = orders.length > 0 ? Date.parse(orders[orders.length - 1].paidAt ?? orders[orders.length - 1].createdAt) : null;
  const activeUntil = last !== null ? last + MOCK_STREAK.windowDays * DAY_MS : null;
  const lapsed = activeUntil !== null && activeUntil <= now;
  const streakCount = lapsed ? 0 : chain;
  const nextStep = MOCK_STREAK.rewards.find((entry) => entry.purchase > streakCount);
  const seat = backend.currentCustomerId ? backend.founderSeats.get(backend.currentCustomerId) : undefined;
  const lifetime: Money = { amountMinor: orders.reduce((sum, order) => sum + order.totals.total.amountMinor, 0), currency: 'ILS' };

  return {
    tier: { id: current.id, name: current.name, index: boostedIndex },
    boost: boostTiers > 0 ? { tiers: boostTiers, until: boosts.map((reward) => reward.expiresAt).filter((value): value is string => value !== undefined).sort().pop() } : undefined,
    points: { total, base, bonus, perShekel: MOCK_POINTS_PER_SHEKEL },
    nextTier: next
      ? {
        id: next.id,
        name: next.name,
        minPoints: next.minPoints,
        pointsToGo: Math.max(0, next.minPoints - total),
        percent: Math.min(100, Math.round(((total - tiers[naturalIndex].minPoints) / (next.minPoints - tiers[naturalIndex].minPoints)) * 100)),
      }
      : undefined,
    tiers,
    perks: current.perks,
    orders: { count: orders.length, lifetime, lastPaidAt: last !== null ? new Date(last).toISOString() : undefined },
    streak: {
      enabled: MOCK_STREAK.enabled,
      count: streakCount,
      windowDays: MOCK_STREAK.windowDays,
      activeUntil: lapsed || activeUntil === null ? undefined : new Date(activeUntil).toISOString(),
      nextRewardAt: nextStep?.purchase,
      nextRewardTitle: nextStep?.reward.title,
    },
    founders: {
      enabled: MOCK_FOUNDERS.enabled,
      name: MOCK_FOUNDERS.name,
      cap: MOCK_FOUNDERS.cap,
      taken: backend.founderSeats.size,
      remaining: Math.max(0, MOCK_FOUNDERS.cap - backend.founderSeats.size),
      reward: MOCK_FOUNDERS.reward.title,
      seatNumber: seat,
    },
    rewards: wallet(backend),
    referral: {
      enabled: MOCK_REFERRAL.enabled,
      code: MOCK_REFERRAL.code,
      path: `/r/${MOCK_REFERRAL.code}`,
      friendReward: MOCK_REFERRAL.friendReward.title,
      referrerReward: MOCK_REFERRAL.referrerReward.title,
      stats: { pending: 0, rewarded: 0, rejected: 0 },
      monthlyCap: MOCK_REFERRAL.monthlyCap,
    },
  };
}

// --- trust -------------------------------------------------------------------

export function trust(backend: MockBackendService): TrustSnapshot {
  const fulfilled = [...backend.orders.values()].filter((order) => order.status === OrderStatus.Fulfilled);
  const coins = fulfilled.reduce((sum, order) => sum + order.items.reduce((lines, item) => lines + (item.coins ?? 0) + (item.bonusCoins ?? 0), 0) + order.rewardCoins, 0);
  const metric = (key: TrustSnapshot['metrics'][number]['key'], label: LocalizedText, unit: 'count' | 'coins' | 'minutes', value: number | undefined, sampleSize: number, threshold: number) => {
    const published = value !== undefined && sampleSize >= threshold;
    return { key, label, unit, value: published ? value : undefined, published, sampleSize, threshold };
  };
  return {
    enabled: true,
    asOf: backend.now(),
    metrics: [
      metric('completedOrders', localized('הזמנות שסופקו', 'Orders delivered'), 'count', fulfilled.length, fulfilled.length, MOCK_TRUST_THRESHOLDS.completedOrders),
      metric('coinsDelivered', localized('קוינס שסופקו', 'Coins delivered'), 'coins', coins, coins, MOCK_TRUST_THRESHOLDS.coinsDelivered),
      metric('medianFulfillmentMinutes', localized('זמן אספקה חציוני', 'Median delivery time'), 'minutes', undefined, 0, MOCK_TRUST_THRESHOLDS.fulfillmentSamples),
      metric('repeatCustomers', localized('לקוחות שחזרו', 'Returning customers'), 'count', 0, 0, MOCK_TRUST_THRESHOLDS.repeatCustomers),
      metric('verifiedReviews', localized('ביקורות מרכישה מאומתת', 'Verified purchase reviews'), 'count', 0, 0, MOCK_TRUST_THRESHOLDS.verifiedReviews),
    ],
  };
}

/** Benefits for a cart that has none: the shape every screen can read. */
export const MOCK_NO_BENEFITS: CartBenefits = { applied: [], rejected: [], rewardCoins: 0, campaignCoins: 0 };

export { isRedeemableAtCheckout };
