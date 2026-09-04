import type { EasyDropTier, RewardKind } from '@prisma/client';

/**
 * Growth configuration: every number a reward programme needs, in one place.
 *
 * Two rules govern this file:
 *
 * 1. Nothing here is a claim about economics. We do not know the supplier cost
 *    of a coin, so every default below is deliberately small, every reward that
 *    costs coins or money is a *next order* benefit (it is only ever paid out
 *    when a customer comes back), and the owner can change or switch off each
 *    programme without a deploy through the admin API.
 * 2. Code carries the defaults; the database carries overrides. A
 *    `growth_settings` row replaces one top-level key below wholesale, after
 *    validation. There is no third source.
 */

export interface LocalizedText {
  readonly he: string;
  readonly en: string;
}

/**
 * A reward as configuration describes it. `value` is read by kind:
 * coins, agorot, points, a multiplier in hundredths (200 = x2), or tiers.
 */
export interface RewardTemplate {
  readonly kind: RewardKind;
  readonly value: number;
  readonly title: LocalizedText;
  /** Relative weight when drawn from a pool. Ignored elsewhere. */
  readonly weight?: number;
  /** Smallest order subtotal, in minor units, the reward may be used on. */
  readonly minOrderMinor?: number;
  /** Days until an unused reward expires. Absent means the programme default. */
  readonly expiresInDays?: number;
}

export interface EasyDropPool {
  readonly tier: EasyDropTier;
  readonly name: LocalizedText;
  /** The pool applies to paid orders whose total is at least this. */
  readonly minTotalMinor: number;
  readonly cards: readonly RewardTemplate[];
}

export type ClubTierId = 'STARTER' | 'PRO' | 'ELITE' | 'ICON';

export interface ClubTier {
  readonly id: ClubTierId;
  readonly name: LocalizedText;
  readonly minPoints: number;
  /** What the tier is, in the customer's words. Never a promise of coins unless configured. */
  readonly perks: readonly LocalizedText[];
}

export interface GrowthConfig {
  readonly easydrop: {
    readonly enabled: boolean;
    readonly cardsPerDrop: number;
    readonly expiresInDays: number;
    readonly pools: readonly EasyDropPool[];
  };
  readonly easyclub: {
    readonly pointsPerShekel: number;
    readonly tiers: readonly ClubTier[];
    readonly tierBoostDays: number;
  };
  readonly founders: {
    readonly enabled: boolean;
    readonly cap: number;
    readonly name: LocalizedText;
    readonly reward: RewardTemplate | null;
  };
  readonly streak: {
    readonly enabled: boolean;
    /** A purchase continues the streak when it lands within this many days of the previous one. */
    readonly windowDays: number;
    readonly rewards: readonly { readonly purchase: number; readonly reward: RewardTemplate }[];
  };
  readonly referral: {
    readonly enabled: boolean;
    readonly referrerReward: RewardTemplate;
    readonly friendReward: RewardTemplate;
    readonly maxRewardsPerReferrerPerMonth: number;
    readonly attributionDays: number;
    readonly minFriendOrderMinor: number;
  };
  readonly easyback: {
    readonly enabled: boolean;
    readonly minOrderMinor: number;
    readonly eligibility: 'first-order' | 'every-order';
    readonly reward: RewardTemplate;
  };
  readonly customCoins: {
    readonly enabled: boolean;
    readonly minCoins: number;
    readonly maxCoins: number;
    readonly stepCoins: number;
  };
  readonly trust: {
    readonly enabled: boolean;
    readonly thresholds: {
      readonly completedOrders: number;
      readonly coinsDelivered: number;
      readonly fulfillmentSamples: number;
      readonly repeatCustomers: number;
      readonly verifiedReviews: number;
    };
  };
  readonly reviews: {
    readonly autoPublishVerified: boolean;
  };
}

export type GrowthConfigKey = keyof GrowthConfig;

export const GROWTH_CONFIG_KEYS: readonly GrowthConfigKey[] = [
  'easydrop', 'easyclub', 'founders', 'streak', 'referral', 'easyback', 'customCoins', 'trust', 'reviews',
];

const t = (he: string, en: string): LocalizedText => ({ he, en });

/**
 * The conservative defaults.
 *
 * Read them as a proposal for the owner, not as a decision: this is the list
 * the release report prints, and nothing with a coin or money value goes to
 * production without the owner having seen it here first.
 */
export const GROWTH_DEFAULTS: GrowthConfig = {
  easydrop: {
    enabled: true,
    cardsPerDrop: 3,
    expiresInDays: 30,
    pools: [
      {
        tier: 'DROP',
        name: t('DROP', 'DROP'),
        minTotalMinor: 0,
        cards: [
          { kind: 'NEXT_ORDER_COINS', value: 10_000, weight: 50, minOrderMinor: 3_100, title: t('+10K קוינס להזמנה הבאה', '+10K coins on your next order') },
          { kind: 'POINTS_BONUS', value: 50, weight: 30, title: t('+50 EasyPoints', '+50 EasyPoints') },
          { kind: 'NEXT_ORDER_CREDIT', value: 300, weight: 20, minOrderMinor: 3_900, title: t('₪3 זיכוי להזמנה הבאה', '₪3 credit on your next order') },
        ],
      },
      {
        tier: 'DROP_PLUS',
        name: t('DROP+', 'DROP+'),
        minTotalMinor: 6_000,
        cards: [
          { kind: 'NEXT_ORDER_COINS', value: 25_000, weight: 45, minOrderMinor: 5_800, title: t('+25K קוינס להזמנה הבאה', '+25K coins on your next order') },
          { kind: 'POINTS_MULTIPLIER', value: 200, weight: 25, title: t('EasyPoints כפולים בהזמנה הבאה', 'Double EasyPoints on your next order') },
          { kind: 'NEXT_ORDER_CREDIT', value: 500, weight: 30, minOrderMinor: 5_800, title: t('₪5 זיכוי להזמנה הבאה', '₪5 credit on your next order') },
        ],
      },
      {
        tier: 'VIP',
        name: t('VIP DROP', 'VIP DROP'),
        minTotalMinor: 15_000,
        cards: [
          { kind: 'NEXT_ORDER_COINS', value: 50_000, weight: 45, minOrderMinor: 10_900, title: t('+50K קוינס להזמנה הבאה', '+50K coins on your next order') },
          { kind: 'NEXT_ORDER_CREDIT', value: 1_000, weight: 30, minOrderMinor: 10_900, title: t('₪10 זיכוי להזמנה הבאה', '₪10 credit on your next order') },
          { kind: 'TIER_BOOST', value: 1, weight: 25, title: t('קפיצת דרגה ב־EASYCLUB ל־30 יום', 'A tier up in EASYCLUB for 30 days') },
        ],
      },
    ],
  },
  easyclub: {
    // One point per shekel actually paid. Points have no cash value: they
    // move a customer between tiers, and what a tier grants is configured
    // here, in words, until the owner decides otherwise.
    pointsPerShekel: 1,
    tiers: [
      { id: 'STARTER', name: t('STARTER', 'STARTER'), minPoints: 0, perks: [t('EASYDROP אחרי כל הזמנה ששולמה', 'An EASYDROP after every paid order'), t('היסטוריית הטבות בחשבון', 'Reward history in your account')] },
      { id: 'PRO', name: t('PRO', 'PRO'), minPoints: 250, perks: [t('כל מה שב־STARTER', 'Everything in STARTER'), t('גישה מוקדמת לדרופים שמסומנים PRO', 'Early access to drops marked PRO')] },
      { id: 'ELITE', name: t('ELITE', 'ELITE'), minPoints: 750, perks: [t('כל מה שב־PRO', 'Everything in PRO'), t('דרופים ל־ELITE בלבד כשייפתחו', 'ELITE-only drops when they open')] },
      { id: 'ICON', name: t('ICON', 'ICON'), minPoints: 2_000, perks: [t('כל מה שב־ELITE', 'Everything in ELITE'), t('קו ישיר לתמיכה במייל', 'A direct line to support by email')] },
    ],
    tierBoostDays: 30,
  },
  founders: {
    enabled: true,
    cap: 100,
    name: t('FIRST XI', 'FIRST XI'),
    // A permanent marker plus points. No coins by default: the owner turns
    // this into a coin benefit when the economics are known.
    reward: { kind: 'POINTS_BONUS', value: 100, title: t('+100 EasyPoints, מייסד/ת', '+100 EasyPoints, founder') },
  },
  streak: {
    enabled: true,
    windowDays: 60,
    rewards: [
      { purchase: 2, reward: { kind: 'POINTS_BONUS', value: 100, title: t('+100 EasyPoints, הזמנה שנייה', '+100 EasyPoints, second order') } },
      { purchase: 3, reward: { kind: 'POINTS_BONUS', value: 200, title: t('+200 EasyPoints, הזמנה שלישית', '+200 EasyPoints, third order') } },
    ],
  },
  referral: {
    enabled: true,
    referrerReward: { kind: 'NEXT_ORDER_COINS', value: 25_000, minOrderMinor: 3_100, title: t('+25K קוינס, חבר שהבאתם הזמין', '+25K coins, a friend you brought ordered') },
    friendReward: { kind: 'NEXT_ORDER_COINS', value: 10_000, minOrderMinor: 3_100, title: t('+10K קוינס להזמנה הבאה, הגעתם דרך חבר', '+10K coins on your next order, you came through a friend') },
    maxRewardsPerReferrerPerMonth: 10,
    attributionDays: 30,
    minFriendOrderMinor: 1_500,
  },
  easyback: {
    // Built and switched off. EasyDrop already hands out a next-order benefit
    // after every paid order; a second automatic one on top is a cost the
    // owner has not priced.
    enabled: false,
    minOrderMinor: 5_000,
    eligibility: 'first-order',
    reward: { kind: 'NEXT_ORDER_CREDIT', value: 500, minOrderMinor: 5_000, expiresInDays: 30, title: t('₪5 זיכוי לחזרה', '₪5 comeback credit') },
  },
  customCoins: {
    enabled: true,
    minCoins: 100_000,
    maxCoins: 10_000_000,
    stepCoins: 10_000,
  },
  trust: {
    enabled: true,
    // A metric is published only past its threshold. Below it the storefront
    // says nothing, rather than a small number dressed as a big one.
    thresholds: {
      completedOrders: 25,
      coinsDelivered: 25_000_000,
      fulfillmentSamples: 20,
      repeatCustomers: 10,
      verifiedReviews: 5,
    },
  },
  reviews: {
    autoPublishVerified: false,
  },
};

const REWARD_KINDS: readonly RewardKind[] = [
  'NEXT_ORDER_COINS', 'NEXT_ORDER_CREDIT', 'POINTS_BONUS', 'POINTS_MULTIPLIER', 'TIER_BOOST', 'OFFER_UNLOCK', 'EXTRA_COINS',
];
const DROP_TIERS: readonly EasyDropTier[] = ['DROP', 'DROP_PLUS', 'VIP'];
const CLUB_TIERS: readonly ClubTierId[] = ['STARTER', 'PRO', 'ELITE', 'ICON'];

export class GrowthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GrowthConfigError';
  }
}

// --- validation --------------------------------------------------------------
//
// An operator edits these through the admin API, so a value is checked before
// it is stored. The checks are structural (types, ranges, enum members) and
// deliberately do not judge generosity: that is the owner's decision.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new GrowthConfigError(`${path} must be true or false`);
  }
  return value;
}

function int(value: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new GrowthConfigError(`${path} must be a whole number between ${min} and ${max}`);
  }
  return value;
}

function text(value: unknown, path: string): LocalizedText {
  if (!isRecord(value) || typeof value['he'] !== 'string' || value['he'].trim().length === 0) {
    throw new GrowthConfigError(`${path} needs a Hebrew text`);
  }
  const he = value['he'].trim().slice(0, 160);
  const en = typeof value['en'] === 'string' && value['en'].trim().length > 0 ? value['en'].trim().slice(0, 160) : he;
  return { he, en };
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new GrowthConfigError(`${path} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

export function sanitizeRewardTemplate(value: unknown, path: string): RewardTemplate {
  if (!isRecord(value)) {
    throw new GrowthConfigError(`${path} must be an object`);
  }
  const kind = oneOf(value['kind'], REWARD_KINDS, `${path}.kind`);
  if (kind === 'EXTRA_COINS') {
    // Coins on the order being paid would have to amend a delivery instruction
    // that may already be in the customer's hands. Until fulfillment can do
    // that safely, the kind exists in the vocabulary and is refused here.
    throw new GrowthConfigError(`${path}.kind: EXTRA_COINS is not supported yet; use NEXT_ORDER_COINS`);
  }
  const template: RewardTemplate = {
    kind,
    value: int(value['value'], `${path}.value`, kind === 'OFFER_UNLOCK' ? 0 : 1, 100_000_000),
    title: text(value['title'], `${path}.title`),
    ...(value['weight'] !== undefined ? { weight: int(value['weight'], `${path}.weight`, 1, 1_000) } : {}),
    ...(value['minOrderMinor'] !== undefined ? { minOrderMinor: int(value['minOrderMinor'], `${path}.minOrderMinor`, 0, 10_000_000) } : {}),
    ...(value['expiresInDays'] !== undefined ? { expiresInDays: int(value['expiresInDays'], `${path}.expiresInDays`, 1, 3_650) } : {}),
  };
  if (kind === 'POINTS_MULTIPLIER' && (template.value < 100 || template.value > 1_000)) {
    throw new GrowthConfigError(`${path}.value: a multiplier is in hundredths, from 100 (x1) to 1000 (x10)`);
  }
  if (kind === 'TIER_BOOST' && template.value > 3) {
    throw new GrowthConfigError(`${path}.value: a tier boost is at most 3 tiers`);
  }
  return template;
}

function rewardOrNull(value: unknown, path: string): RewardTemplate | null {
  return value === null ? null : sanitizeRewardTemplate(value, path);
}

function list<T>(value: unknown, path: string, max: number, map: (entry: unknown, index: number) => T): T[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new GrowthConfigError(`${path} must be a list of at most ${max}`);
  }
  return value.map((entry, index) => map(entry, index));
}

/**
 * Validates one top-level setting as an operator submitted it and returns the
 * value that will be stored. Throws `GrowthConfigError` with the offending
 * path, never a bare TypeError.
 */
export function sanitizeGrowthSetting<K extends GrowthConfigKey>(key: K, value: unknown): GrowthConfig[K] {
  if (!isRecord(value)) {
    throw new GrowthConfigError(`${key} must be an object`);
  }
  switch (key) {
    case 'easydrop': {
      const pools = list(value['pools'], 'easydrop.pools', 6, (entry, index) => {
        const path = `easydrop.pools[${index}]`;
        if (!isRecord(entry)) {
          throw new GrowthConfigError(`${path} must be an object`);
        }
        const cards = list(entry['cards'], `${path}.cards`, 12, (card, cardIndex) => sanitizeRewardTemplate(card, `${path}.cards[${cardIndex}]`));
        if (cards.length === 0) {
          throw new GrowthConfigError(`${path}.cards must hold at least one reward: every reveal has a real reward`);
        }
        return {
          tier: oneOf(entry['tier'], DROP_TIERS, `${path}.tier`),
          name: text(entry['name'], `${path}.name`),
          minTotalMinor: int(entry['minTotalMinor'], `${path}.minTotalMinor`, 0, 10_000_000),
          cards,
        } satisfies EasyDropPool;
      });
      const result: GrowthConfig['easydrop'] = {
        enabled: bool(value['enabled'], 'easydrop.enabled'),
        cardsPerDrop: int(value['cardsPerDrop'], 'easydrop.cardsPerDrop', 1, 5),
        expiresInDays: int(value['expiresInDays'], 'easydrop.expiresInDays', 1, 3_650),
        pools,
      };
      return result as GrowthConfig[K];
    }
    case 'easyclub': {
      const tiers = list(value['tiers'], 'easyclub.tiers', 4, (entry, index) => {
        const path = `easyclub.tiers[${index}]`;
        if (!isRecord(entry)) {
          throw new GrowthConfigError(`${path} must be an object`);
        }
        return {
          id: oneOf(entry['id'], CLUB_TIERS, `${path}.id`),
          name: text(entry['name'], `${path}.name`),
          minPoints: int(entry['minPoints'], `${path}.minPoints`, 0, 10_000_000),
          perks: list(entry['perks'], `${path}.perks`, 8, (perk, perkIndex) => text(perk, `${path}.perks[${perkIndex}]`)),
        } satisfies ClubTier;
      });
      if (tiers.length !== 4 || tiers[0].minPoints !== 0 || tiers.some((tier, index) => index > 0 && tier.minPoints <= tiers[index - 1].minPoints)) {
        throw new GrowthConfigError('easyclub.tiers must be four tiers with ascending thresholds starting at 0');
      }
      const result: GrowthConfig['easyclub'] = {
        pointsPerShekel: int(value['pointsPerShekel'], 'easyclub.pointsPerShekel', 0, 100),
        tiers,
        tierBoostDays: int(value['tierBoostDays'], 'easyclub.tierBoostDays', 1, 365),
      };
      return result as GrowthConfig[K];
    }
    case 'founders': {
      const result: GrowthConfig['founders'] = {
        enabled: bool(value['enabled'], 'founders.enabled'),
        cap: int(value['cap'], 'founders.cap', 1, 100_000),
        name: text(value['name'], 'founders.name'),
        reward: rewardOrNull(value['reward'] ?? null, 'founders.reward'),
      };
      return result as GrowthConfig[K];
    }
    case 'streak': {
      const result: GrowthConfig['streak'] = {
        enabled: bool(value['enabled'], 'streak.enabled'),
        windowDays: int(value['windowDays'], 'streak.windowDays', 1, 365),
        rewards: list(value['rewards'], 'streak.rewards', 10, (entry, index) => {
          const path = `streak.rewards[${index}]`;
          if (!isRecord(entry)) {
            throw new GrowthConfigError(`${path} must be an object`);
          }
          return {
            purchase: int(entry['purchase'], `${path}.purchase`, 2, 100),
            reward: sanitizeRewardTemplate(entry['reward'], `${path}.reward`),
          };
        }),
      };
      return result as GrowthConfig[K];
    }
    case 'referral': {
      const result: GrowthConfig['referral'] = {
        enabled: bool(value['enabled'], 'referral.enabled'),
        referrerReward: sanitizeRewardTemplate(value['referrerReward'], 'referral.referrerReward'),
        friendReward: sanitizeRewardTemplate(value['friendReward'], 'referral.friendReward'),
        maxRewardsPerReferrerPerMonth: int(value['maxRewardsPerReferrerPerMonth'], 'referral.maxRewardsPerReferrerPerMonth', 0, 10_000),
        attributionDays: int(value['attributionDays'], 'referral.attributionDays', 1, 365),
        minFriendOrderMinor: int(value['minFriendOrderMinor'], 'referral.minFriendOrderMinor', 0, 10_000_000),
      };
      return result as GrowthConfig[K];
    }
    case 'easyback': {
      const result: GrowthConfig['easyback'] = {
        enabled: bool(value['enabled'], 'easyback.enabled'),
        minOrderMinor: int(value['minOrderMinor'], 'easyback.minOrderMinor', 0, 10_000_000),
        eligibility: oneOf(value['eligibility'], ['first-order', 'every-order'] as const, 'easyback.eligibility'),
        reward: sanitizeRewardTemplate(value['reward'], 'easyback.reward'),
      };
      return result as GrowthConfig[K];
    }
    case 'customCoins': {
      const minCoins = int(value['minCoins'], 'customCoins.minCoins', 1_000, 100_000_000);
      const maxCoins = int(value['maxCoins'], 'customCoins.maxCoins', minCoins, 500_000_000);
      const stepCoins = int(value['stepCoins'], 'customCoins.stepCoins', 1_000, minCoins);
      const result: GrowthConfig['customCoins'] = {
        enabled: bool(value['enabled'], 'customCoins.enabled'),
        minCoins,
        maxCoins,
        stepCoins,
      };
      return result as GrowthConfig[K];
    }
    case 'trust': {
      const thresholds = value['thresholds'];
      if (!isRecord(thresholds)) {
        throw new GrowthConfigError('trust.thresholds must be an object');
      }
      const result: GrowthConfig['trust'] = {
        enabled: bool(value['enabled'], 'trust.enabled'),
        thresholds: {
          completedOrders: int(thresholds['completedOrders'], 'trust.thresholds.completedOrders', 1),
          coinsDelivered: int(thresholds['coinsDelivered'], 'trust.thresholds.coinsDelivered', 1),
          fulfillmentSamples: int(thresholds['fulfillmentSamples'], 'trust.thresholds.fulfillmentSamples', 1),
          repeatCustomers: int(thresholds['repeatCustomers'], 'trust.thresholds.repeatCustomers', 1),
          verifiedReviews: int(thresholds['verifiedReviews'], 'trust.thresholds.verifiedReviews', 1),
        },
      };
      return result as GrowthConfig[K];
    }
    case 'reviews': {
      const result: GrowthConfig['reviews'] = {
        autoPublishVerified: bool(value['autoPublishVerified'], 'reviews.autoPublishVerified'),
      };
      return result as GrowthConfig[K];
    }
    default:
      throw new GrowthConfigError(`unknown setting ${String(key)}`);
  }
}

export function isGrowthConfigKey(value: unknown): value is GrowthConfigKey {
  return typeof value === 'string' && (GROWTH_CONFIG_KEYS as readonly string[]).includes(value);
}
