import { ClubTier, EasyDropTier, GrowthProgrammes, LocalizedText, RewardKind, localized } from '../../domain';

/**
 * Growth configuration for the in-memory backend.
 *
 * A mirror of the conservative defaults in
 * `backend/src/modules/growth/growth-config.ts`, so mock mode shows the same
 * programmes a fresh backend would. Change the backend first; this follows.
 * Nothing here is read in HTTP mode.
 */

export interface MockRewardTemplate {
  readonly kind: RewardKind;
  readonly value: number;
  readonly title: LocalizedText;
  readonly weight?: number;
  readonly minOrderMinor?: number;
}

export interface MockDropPool {
  readonly tier: EasyDropTier;
  readonly name: LocalizedText;
  readonly minTotalMinor: number;
  readonly cards: readonly MockRewardTemplate[];
}

export const MOCK_EASYDROP = {
  enabled: true,
  cardsPerDrop: 3,
  expiresInDays: 30,
  pools: [
    {
      tier: 'DROP' as const,
      name: localized('DROP', 'DROP'),
      minTotalMinor: 0,
      cards: [
        { kind: 'NEXT_ORDER_COINS' as const, value: 10_000, weight: 50, minOrderMinor: 3_100, title: localized('+10K קוינס להזמנה הבאה', '+10K coins on your next order') },
        { kind: 'POINTS_BONUS' as const, value: 50, weight: 30, title: localized('+50 EasyPoints', '+50 EasyPoints') },
        { kind: 'NEXT_ORDER_CREDIT' as const, value: 300, weight: 20, minOrderMinor: 3_900, title: localized('₪3 זיכוי להזמנה הבאה', '₪3 credit on your next order') },
      ],
    },
    {
      tier: 'DROP_PLUS' as const,
      name: localized('DROP+', 'DROP+'),
      minTotalMinor: 6_000,
      cards: [
        { kind: 'NEXT_ORDER_COINS' as const, value: 25_000, weight: 45, minOrderMinor: 5_800, title: localized('+25K קוינס להזמנה הבאה', '+25K coins on your next order') },
        { kind: 'POINTS_MULTIPLIER' as const, value: 200, weight: 25, title: localized('EasyPoints כפולים בהזמנה הבאה', 'Double EasyPoints on your next order') },
        { kind: 'NEXT_ORDER_CREDIT' as const, value: 500, weight: 30, minOrderMinor: 5_800, title: localized('₪5 זיכוי להזמנה הבאה', '₪5 credit on your next order') },
      ],
    },
    {
      tier: 'VIP' as const,
      name: localized('VIP DROP', 'VIP DROP'),
      minTotalMinor: 15_000,
      cards: [
        { kind: 'NEXT_ORDER_COINS' as const, value: 50_000, weight: 45, minOrderMinor: 10_900, title: localized('+50K קוינס להזמנה הבאה', '+50K coins on your next order') },
        { kind: 'NEXT_ORDER_CREDIT' as const, value: 1_000, weight: 30, minOrderMinor: 10_900, title: localized('₪10 זיכוי להזמנה הבאה', '₪10 credit on your next order') },
        { kind: 'TIER_BOOST' as const, value: 1, weight: 25, title: localized('קפיצת דרגה ב־EASYCLUB ל־30 יום', 'A tier up in EASYCLUB for 30 days') },
      ],
    },
  ] satisfies readonly MockDropPool[],
};

export const MOCK_CLUB_TIERS: readonly ClubTier[] = [
  { id: 'STARTER', name: localized('STARTER', 'STARTER'), minPoints: 0, perks: [localized('EASYDROP אחרי כל הזמנה ששולמה', 'An EASYDROP after every paid order'), localized('היסטוריית הטבות בחשבון', 'Reward history in your account')] },
  { id: 'PRO', name: localized('PRO', 'PRO'), minPoints: 250, perks: [localized('כל מה שב־STARTER', 'Everything in STARTER'), localized('גישה מוקדמת לדרופים שמסומנים PRO', 'Early access to drops marked PRO')] },
  { id: 'ELITE', name: localized('ELITE', 'ELITE'), minPoints: 750, perks: [localized('כל מה שב־PRO', 'Everything in PRO'), localized('דרופים ל־ELITE בלבד כשייפתחו', 'ELITE-only drops when they open')] },
  { id: 'ICON', name: localized('ICON', 'ICON'), minPoints: 2_000, perks: [localized('כל מה שב־ELITE', 'Everything in ELITE'), localized('קו ישיר לתמיכה במייל', 'A direct line to support by email')] },
];

export const MOCK_POINTS_PER_SHEKEL = 1;

export const MOCK_FOUNDERS = {
  enabled: true,
  cap: 100,
  name: localized('FIRST XI', 'FIRST XI'),
  reward: { kind: 'POINTS_BONUS' as const, value: 100, title: localized('+100 EasyPoints, מייסד/ת', '+100 EasyPoints, founder') },
};

export const MOCK_STREAK = {
  enabled: true,
  windowDays: 60,
  rewards: [
    { purchase: 2, reward: { kind: 'POINTS_BONUS' as const, value: 100, title: localized('+100 EasyPoints, הזמנה שנייה', '+100 EasyPoints, second order') } },
    { purchase: 3, reward: { kind: 'POINTS_BONUS' as const, value: 200, title: localized('+200 EasyPoints, הזמנה שלישית', '+200 EasyPoints, third order') } },
  ],
};

export const MOCK_REFERRAL = {
  enabled: true,
  code: 'ECMOCK01',
  referrerReward: { kind: 'NEXT_ORDER_COINS' as const, value: 25_000, minOrderMinor: 3_100, title: localized('+25K קוינס, חבר שהבאתם הזמין', '+25K coins, a friend you brought ordered') },
  friendReward: { kind: 'NEXT_ORDER_COINS' as const, value: 10_000, minOrderMinor: 3_100, title: localized('+10K קוינס להזמנה הבאה, הגעתם דרך חבר', '+10K coins on your next order, you came through a friend') },
  monthlyCap: 10,
};

export const MOCK_CUSTOM_COINS = {
  enabled: true,
  minCoins: 100_000,
  maxCoins: 10_000_000,
  stepCoins: 10_000,
};

export const MOCK_TRUST_THRESHOLDS = {
  completedOrders: 25,
  coinsDelivered: 25_000_000,
  fulfillmentSamples: 20,
  repeatCustomers: 10,
  verifiedReviews: 5,
};

export function mockProgrammes(foundersTaken: number, platformIds: readonly string[]): GrowthProgrammes {
  return {
    easydrop: {
      enabled: MOCK_EASYDROP.enabled,
      cardsPerDrop: MOCK_EASYDROP.cardsPerDrop,
      expiresInDays: MOCK_EASYDROP.expiresInDays,
      tiers: MOCK_EASYDROP.pools.map((pool) => ({ tier: pool.tier, name: pool.name, minTotal: { amountMinor: pool.minTotalMinor, currency: 'ILS' } })),
    },
    easyclub: { pointsPerShekel: MOCK_POINTS_PER_SHEKEL, tiers: MOCK_CLUB_TIERS },
    founders: {
      enabled: MOCK_FOUNDERS.enabled,
      name: MOCK_FOUNDERS.name,
      cap: MOCK_FOUNDERS.cap,
      taken: foundersTaken,
      remaining: Math.max(0, MOCK_FOUNDERS.cap - foundersTaken),
      reward: MOCK_FOUNDERS.reward.title,
    },
    streak: { enabled: MOCK_STREAK.enabled, windowDays: MOCK_STREAK.windowDays, rewards: MOCK_STREAK.rewards.map((step) => ({ purchase: step.purchase, title: step.reward.title })) },
    referral: { enabled: MOCK_REFERRAL.enabled, friendReward: MOCK_REFERRAL.friendReward.title, referrerReward: MOCK_REFERRAL.referrerReward.title },
    customCoins: { ...MOCK_CUSTOM_COINS, platformIds },
    easyback: { enabled: false },
  };
}
