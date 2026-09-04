import { IsoDateTime, LocalizedText, Money, OfferId, OrderId, PlatformId, RegionId, VariantId } from '../common';

/**
 * The customer-value ecosystem, as the storefront reads it.
 *
 * Everything in this file is a statement the server made from real rows: a
 * reward a paid order produced, a tier computed from paid orders, a drop with
 * real dates, a founders counter from real seats, a trust figure past its
 * threshold. The client renders these and decides none of them. No component
 * may fabricate a reward, a countdown, a spot count or a metric.
 */

// --- Rewards ---------------------------------------------------------------

export type RewardKind =
  | 'NEXT_ORDER_COINS'
  | 'NEXT_ORDER_CREDIT'
  | 'POINTS_BONUS'
  | 'POINTS_MULTIPLIER'
  | 'TIER_BOOST'
  | 'OFFER_UNLOCK'
  | 'EXTRA_COINS';

export type RewardSource =
  | 'EASYDROP'
  | 'EASYBACK'
  | 'REFERRAL_REFERRER'
  | 'REFERRAL_FRIEND'
  | 'STREAK'
  | 'FOUNDER'
  | 'CAMPAIGN';

export type RewardStatus = 'AVAILABLE' | 'RESERVED' | 'REDEEMED' | 'EXPIRED' | 'REVOKED';

/** When a reward takes effect: chosen at checkout, by itself on the next paid order, or at once. */
export type RewardUsage = 'checkout' | 'automatic' | 'immediate';

export interface Reward {
  readonly id: string;
  readonly source: RewardSource;
  readonly kind: RewardKind;
  /** Coins, agorot, points, a multiplier in hundredths, or tiers, by kind. */
  readonly value: number;
  readonly title: LocalizedText;
  readonly status: RewardStatus;
  readonly usage: RewardUsage;
  readonly minOrder?: Money;
  readonly expiresAt?: IsoDateTime;
  readonly sourceOrderId?: OrderId;
  readonly redeemedOrderId?: OrderId;
  readonly createdAt: IsoDateTime;
}

export interface RewardWallet {
  /** Held and usable, including one an open order is holding. */
  readonly available: readonly Reward[];
  readonly history: readonly Reward[];
}

// --- Stacking ----------------------------------------------------------------

export type BenefitKind = 'LAUNCH_BONUS' | 'REWARD' | 'LOYALTY' | 'COUPON';

export interface AppliedBenefit {
  readonly kind: BenefitKind;
  readonly label: LocalizedText;
  readonly effect: { readonly discount: Money; readonly coins: number };
  readonly rewardId?: string;
  readonly couponCode?: string;
}

export interface RejectedBenefit {
  readonly kind: BenefitKind;
  readonly label: LocalizedText;
  readonly code: string;
  readonly reason: LocalizedText;
  readonly rewardId?: string;
  readonly couponCode?: string;
}

/** The server's stacking decision for a cart, repeated on every screen that shows a total. */
export interface CartBenefits {
  readonly applied: readonly AppliedBenefit[];
  readonly rejected: readonly RejectedBenefit[];
  readonly rewardId?: string;
  readonly rewardCoins: number;
}

export const NO_BENEFITS: CartBenefits = { applied: [], rejected: [], rewardCoins: 0 };

// --- EasyDrop ----------------------------------------------------------------

export type EasyDropTier = 'DROP' | 'DROP_PLUS' | 'VIP';

export interface EasyDrop {
  readonly orderId: OrderId;
  readonly tier: EasyDropTier;
  readonly tierName: LocalizedText;
  readonly status: 'ISSUED' | 'REVEALED';
  readonly cardCount: number;
  readonly pickedIndex?: number;
  readonly reward?: Reward;
  readonly issuedAt: IsoDateTime;
  readonly revealedAt?: IsoDateTime;
}

// --- EASYCLUB ----------------------------------------------------------------

export type ClubTierId = 'STARTER' | 'PRO' | 'ELITE' | 'ICON';

export interface ClubTier {
  readonly id: ClubTierId;
  readonly name: LocalizedText;
  readonly minPoints: number;
  readonly perks: readonly LocalizedText[];
}

export interface StreakState {
  readonly enabled: boolean;
  readonly count: number;
  readonly windowDays: number;
  readonly activeUntil?: IsoDateTime;
  readonly nextRewardAt?: number;
  readonly nextRewardTitle?: LocalizedText;
}

export interface FoundersStatus {
  readonly enabled: boolean;
  readonly name: LocalizedText;
  readonly cap: number;
  readonly taken: number;
  readonly remaining: number;
  readonly reward?: LocalizedText;
}

export interface ReferralSummary {
  readonly enabled: boolean;
  readonly code?: string;
  /** Same-site path a friend opens, e.g. `/r/EC7K3M9Q`. */
  readonly path?: string;
  readonly friendReward: LocalizedText;
  readonly referrerReward: LocalizedText;
  readonly stats: { readonly pending: number; readonly rewarded: number; readonly rejected: number };
  readonly monthlyCap: number;
}

export interface ClubSummary {
  readonly tier: { readonly id: ClubTierId; readonly name: LocalizedText; readonly index: number };
  readonly boost?: { readonly tiers: number; readonly until?: IsoDateTime };
  readonly points: { readonly total: number; readonly base: number; readonly bonus: number; readonly perShekel: number };
  readonly nextTier?: { readonly id: ClubTierId; readonly name: LocalizedText; readonly minPoints: number; readonly pointsToGo: number; readonly percent: number };
  readonly tiers: readonly ClubTier[];
  readonly perks: readonly LocalizedText[];
  readonly orders: { readonly count: number; readonly lifetime: Money; readonly lastPaidAt?: IsoDateTime };
  readonly streak: StreakState;
  readonly founders: FoundersStatus & { readonly seatNumber?: number };
  readonly rewards: RewardWallet;
  readonly referral: ReferralSummary;
}

export type ReferralAttachOutcome = 'ATTACHED' | 'ALREADY_ATTACHED' | 'SELF' | 'EXISTING_CUSTOMER' | 'UNKNOWN_CODE' | 'DISABLED';

export interface ReferralAttachResult {
  readonly attached: boolean;
  readonly outcome: ReferralAttachOutcome;
  readonly friendReward?: LocalizedText;
}

// --- Drop Zone ---------------------------------------------------------------

export type DropKind = 'WEEKEND_DROP' | 'MATCHDAY_DROP' | 'PAYDAY_DROP' | 'PROMO_DROP' | 'COMMUNITY_DROP' | 'VIP_DROP';

/** Only the states a customer may see. A draft or an ended drop is never sent. */
export type DropStatus = 'active' | 'scheduled';

export interface Drop {
  readonly id: string;
  readonly slug: string;
  readonly kind: DropKind;
  readonly status: DropStatus;
  readonly title: LocalizedText;
  readonly lede: LocalizedText;
  readonly points: readonly LocalizedText[];
  readonly startsAt?: IsoDateTime;
  /** Present only when the drop really ends: the only thing a countdown may be built from. */
  readonly endsAt?: IsoDateTime;
  readonly reward?: { readonly title: LocalizedText; readonly kind: RewardKind; readonly value: number };
  readonly eligibility: { readonly minOrder?: Money; readonly firstOrderOnly?: boolean };
  readonly cta?: { readonly label: LocalizedText; readonly link: string };
  /** Claims left under a real cap; absent when the drop has no cap. */
  readonly remaining?: number;
}

// --- Programmes, as the storefront needs to know them --------------------------

export interface GrowthProgrammes {
  readonly easydrop: {
    readonly enabled: boolean;
    readonly cardsPerDrop: number;
    readonly expiresInDays: number;
    readonly tiers: readonly { readonly tier: EasyDropTier; readonly name: LocalizedText; readonly minTotal: Money }[];
  };
  readonly easyclub: { readonly pointsPerShekel: number; readonly tiers: readonly ClubTier[] };
  readonly founders: FoundersStatus;
  readonly streak: { readonly enabled: boolean; readonly windowDays: number; readonly rewards: readonly { readonly purchase: number; readonly title: LocalizedText }[] };
  readonly referral: { readonly enabled: boolean; readonly friendReward: LocalizedText; readonly referrerReward: LocalizedText };
  readonly customCoins: CustomCoinsRules;
  readonly easyback: { readonly enabled: boolean };
}

// --- Trust -------------------------------------------------------------------

export type TrustMetricKey = 'completedOrders' | 'coinsDelivered' | 'medianFulfillmentMinutes' | 'repeatCustomers' | 'verifiedReviews';

export interface TrustMetric {
  readonly key: TrustMetricKey;
  readonly label: LocalizedText;
  readonly unit: 'count' | 'coins' | 'minutes';
  /** Present only when published. */
  readonly value?: number;
  readonly published: boolean;
  readonly sampleSize: number;
  readonly threshold: number;
}

export interface TrustSnapshot {
  readonly enabled: boolean;
  readonly asOf: IsoDateTime;
  readonly metrics: readonly TrustMetric[];
}

// --- Custom coins ------------------------------------------------------------

export interface CustomCoinsRules {
  readonly enabled: boolean;
  readonly minCoins: number;
  readonly maxCoins: number;
  readonly stepCoins: number;
  readonly platformIds: readonly PlatformId[];
}

export interface CustomCoinsQuoteRequest {
  readonly mode: 'amount' | 'budget';
  readonly amount?: number;
  readonly budget?: Money;
  readonly platformId: PlatformId;
  readonly regionId?: RegionId;
}

/** A price the server wrote for an exact amount, carried by a real offer. */
export interface CustomCoinsQuote {
  readonly offerId: OfferId;
  readonly productSlug: string;
  readonly variantId: VariantId;
  readonly platformId: PlatformId;
  readonly regionId: RegionId;
  readonly amount: number;
  readonly price: Money;
  readonly bonus: number;
  readonly totalCoins: number;
  readonly perMillion: Money;
  readonly rungAmount: number;
  readonly mode: 'amount' | 'budget';
  readonly rules: Pick<CustomCoinsRules, 'minCoins' | 'maxCoins' | 'stepCoins'>;
}

// --- Verified reviews --------------------------------------------------------

export interface SubmitReviewRequest {
  readonly orderId: OrderId;
  readonly rating: 1 | 2 | 3 | 4 | 5;
  readonly title?: string;
  readonly body: string;
}

export interface SubmitReviewResult {
  readonly id: string;
  readonly published: boolean;
  readonly verifiedPurchase: true;
}

// --- Helpers -----------------------------------------------------------------

/** True for a reward the customer can pick at checkout right now. */
export function isRedeemableAtCheckout(reward: Reward): boolean {
  return reward.status === 'AVAILABLE' && reward.usage === 'checkout';
}
