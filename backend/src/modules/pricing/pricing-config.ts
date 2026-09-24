/**
 * Pricing configuration: every number the FC27 ladder, its launch offer and
 * the owner's economics need, in one place, with the same discipline as the
 * growth configuration.
 *
 * Rules:
 *
 * 1. Money is an integer count of agorot. Percentages are integer basis
 *    points (100 bps = 1%). There is no float anywhere in this file, so two
 *    reads of the same configuration always evaluate to the same agora.
 * 2. Code carries the defaults; the database carries overrides, one row per
 *    top-level key, validated by `sanitizePricingSetting` before it is
 *    stored and again when it is read. A bad row is ignored with a warning
 *    and the default applies.
 * 3. Nothing here is a claim about the world. The supplier cost defaults to
 *    UNKNOWN (null), the ladder defaults to DRAFT, and the launch offer
 *    defaults to disabled. The storefront sells nothing from this file until
 *    an operator activates it from the admin, and activation refuses to run
 *    while the economics say it should not.
 */

export interface LocalizedText {
  readonly he: string;
  readonly en: string;
}

export type CoinTier = 'starter' | 'pro' | 'elite' | 'legend';

/** One rung of the ladder, as the owner edits it. */
export interface LadderPackage {
  /** Stable key, becomes the variant key: `100k`, `1m`, `2500k`. */
  readonly key: string;
  readonly coins: number;
  /** The customer price in agorot, VAT included, before any benefit. */
  readonly priceMinor: number;
  /** Extra coins delivered with the package. Zero when the ladder carries value in the price. */
  readonly bonusCoins: number;
  readonly tier: CoinTier;
  /** At most one package on the ladder may be the recommendation. */
  readonly recommended: boolean;
  /** An inactive package keeps its row but is not sold. */
  readonly active: boolean;
}

export interface LadderConfig {
  readonly edition: 'fc27';
  /** The catalog product the ladder is written to on activation. */
  readonly productSlug: string;
  readonly productId: string;
  /** DRAFT until an operator activates; ACTIVE once the offers are live. */
  readonly status: 'draft' | 'active';
  readonly packages: readonly LadderPackage[];
  /** Per-platform price adjustment in basis points; missing means 0. */
  readonly platformAdjustmentBps: Readonly<Record<string, number>>;
  /** The most any combination of benefits may take off the ladder price, in bps. */
  readonly maxDiscountBps: number;
  /** Largest quantity of one package per order. */
  readonly maxPerOrder: number;
}

export interface EconomicsConfig {
  /** What one million delivered coins cost us, in agorot. Null means unknown. */
  readonly supplierCostPer1MMinor: number | null;
  /** Per-platform override of the supplier cost; missing means the general figure. */
  readonly supplierCostByPlatform: Readonly<Record<string, number>>;
  /** Payment processing fee taken from revenue, bps. */
  readonly paymentFeeBps: number;
  /** Coins lost in delivery (the in-game transfer tax) as a share of coins bought, bps. */
  readonly deliveryLossBps: number;
  /** Contribution margin the ladder must keep on every active package, bps of revenue. */
  readonly minMarginBps: number;
  /** Whether customer prices include VAT (they do; Israeli consumer prices must). */
  readonly vatIncluded: boolean;
  /** VAT rate, bps, for the contribution table. */
  readonly vatBps: number;
}

export interface LaunchOfferConfig {
  readonly id: string;
  readonly enabled: boolean;
  readonly name: LocalizedText;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly benefit: {
    readonly kind: 'BONUS_COINS_PERCENT';
    /** Extra coins as a share of coins bought, bps. */
    readonly percentBps: number;
    /** Never more than this many bonus coins on one order. */
    readonly capCoins: number;
    /** Smallest order subtotal, agorot, the benefit applies to. */
    readonly minOrderMinor: number;
  };
  readonly eligibility: 'first-order';
  /** Total redemptions allowed; null means unlimited. */
  readonly maxRedemptions: number | null;
  /** Stated for the customer; enforced by the benefit policy. */
  readonly terms: readonly LocalizedText[];
}

export interface CompetitorEntry {
  readonly seller: string;
  readonly url: string;
  readonly checkedAt: string;
  readonly platform: string;
  readonly coins: number;
  readonly priceMinor: number;
  readonly promotion: string;
  /** Price after the public promotion, agorot, when the promotion is immediate. */
  readonly effectivePriceMinor: number;
  /** Coins actually received after an immediate coin bonus. */
  readonly effectiveCoins: number;
  readonly notes: string;
}

export interface CompetitorsConfig {
  readonly checkedAt: string;
  readonly entries: readonly CompetitorEntry[];
}

export interface PricingConfig {
  readonly economics: EconomicsConfig;
  readonly ladder: LadderConfig;
  readonly launch: LaunchOfferConfig;
  readonly competitors: CompetitorsConfig;
}

export type PricingConfigKey = keyof PricingConfig;

export const PRICING_CONFIG_KEYS: readonly PricingConfigKey[] = ['economics', 'ladder', 'launch', 'competitors'];

/** The storage key prefix inside the shared settings table. */
export const PRICING_SETTING_PREFIX = 'pricing.';

export class PricingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingConfigError';
  }
}

const t = (he: string, en: string): LocalizedText => ({ he, en });

export const FC27_PRODUCT_ID = 'prod-fc27-coins';
export const FC27_PRODUCT_SLUG = 'fc27-coins';
export const FC26_PRODUCT_ID = 'prod-fc-coins';

/**
 * The proposed FC27 ladder, as a draft.
 *
 * Positioned from the market snapshot of 2026-09-23 (docs/FC27-MARKET-SNAPSHOT.md):
 * under the strongest verified effective rate at every anchor, with a steeper
 * value curve than either competitor. It is a proposal, not a decision: the
 * supplier cost is unknown, so the ladder stays a draft until the owner has
 * costed it and pressed activate.
 */
const DRAFT_LADDER: readonly LadderPackage[] = [
  { key: '100k', coins: 100_000, priceMinor: 8_500, bonusCoins: 0, tier: 'starter', recommended: false, active: true },
  { key: '250k', coins: 250_000, priceMinor: 20_500, bonusCoins: 0, tier: 'starter', recommended: false, active: true },
  { key: '500k', coins: 500_000, priceMinor: 37_500, bonusCoins: 0, tier: 'pro', recommended: false, active: true },
  { key: '750k', coins: 750_000, priceMinor: 54_500, bonusCoins: 0, tier: 'pro', recommended: false, active: true },
  { key: '1m', coins: 1_000_000, priceMinor: 69_900, bonusCoins: 0, tier: 'elite', recommended: true, active: true },
  { key: '1500k', coins: 1_500_000, priceMinor: 102_900, bonusCoins: 0, tier: 'elite', recommended: false, active: true },
  { key: '2m', coins: 2_000_000, priceMinor: 133_900, bonusCoins: 0, tier: 'legend', recommended: false, active: true },
  { key: '3m', coins: 3_000_000, priceMinor: 195_900, bonusCoins: 0, tier: 'legend', recommended: false, active: true },
  { key: '5m', coins: 5_000_000, priceMinor: 319_900, bonusCoins: 0, tier: 'legend', recommended: false, active: true },
  { key: '10m', coins: 10_000_000, priceMinor: 619_900, bonusCoins: 0, tier: 'legend', recommended: false, active: true },
];

export const PRICING_DEFAULTS: PricingConfig = {
  economics: {
    supplierCostPer1MMinor: null,
    supplierCostByPlatform: {},
    paymentFeeBps: 0,
    // The in-game transfer tax: delivering N coins through the market costs
    // N / 0.95 coins, i.e. 5.26% more bought than delivered. Configurable
    // because the delivery method may change.
    deliveryLossBps: 526,
    minMarginBps: 2_000,
    vatIncluded: true,
    vatBps: 1_800,
  },
  ladder: {
    edition: 'fc27',
    productSlug: FC27_PRODUCT_SLUG,
    productId: FC27_PRODUCT_ID,
    status: 'draft',
    packages: DRAFT_LADDER,
    platformAdjustmentBps: {},
    maxDiscountBps: 1_500,
    maxPerOrder: 10,
  },
  launch: {
    id: 'fc27-first-kick',
    enabled: false,
    name: t('FIRST KICK: הטבת הצטרפות ל-FC27', 'FIRST KICK: the FC27 welcome benefit'),
    startsAt: '2026-09-25T00:00:00+03:00',
    endsAt: '2026-10-31T23:59:59+03:00',
    benefit: { kind: 'BONUS_COINS_PERCENT', percentBps: 1_000, capCoins: 100_000, minOrderMinor: 5_000 },
    eligibility: 'first-order',
    maxRedemptions: null,
    terms: [
      t('להזמנה הראשונה בלבד, לפי חשבון או כתובת אימייל.', 'First order only, by account or email address.'),
      t('הבונוס מגיע בקוינס, יחד עם ההזמנה, ולא כהנחה.', 'The benefit is paid in coins with the order, not as a discount.'),
      t('לא מצטרף לקוד יוצר או לקופון. מצטרף להטבה אחת מהארנק.', 'Does not combine with a creator code or coupon. Combines with one wallet reward.'),
    ],
  },
  competitors: {
    checkedAt: '2026-09-23T22:30:00.000Z',
    entries: [
      { seller: 'FUTGOAT', url: 'https://futgoat.com/fc27-coins/', checkedAt: '2026-09-23T22:30:00.000Z', platform: 'all', coins: 100_000, priceMinor: 9_900, promotion: 'creator code 5% (example)', effectivePriceMinor: 9_405, effectiveCoins: 100_000, notes: 'minimum order; price array read from the page configurator' },
      { seller: 'FUTGOAT', url: 'https://futgoat.com/fc27-coins/', checkedAt: '2026-09-23T22:30:00.000Z', platform: 'all', coins: 500_000, priceMinor: 47_500, promotion: 'creator code 5% (example)', effectivePriceMinor: 45_125, effectiveCoins: 500_000, notes: '' },
      { seller: 'FUTGOAT', url: 'https://futgoat.com/fc27-coins/', checkedAt: '2026-09-23T22:30:00.000Z', platform: 'all', coins: 1_000_000, priceMinor: 89_500, promotion: 'creator code 5% (example)', effectivePriceMinor: 85_025, effectiveCoins: 1_000_000, notes: 'tax covered, full amount delivered' },
      { seller: 'FUTGOAT', url: 'https://futgoat.com/fc27-coins/', checkedAt: '2026-09-23T22:30:00.000Z', platform: 'all', coins: 2_000_000, priceMinor: 169_800, promotion: 'creator code 5% (example)', effectivePriceMinor: 161_310, effectiveCoins: 2_000_000, notes: '' },
      { seller: 'FUTGOAT', url: 'https://futgoat.com/fc27-coins/', checkedAt: '2026-09-23T22:30:00.000Z', platform: 'all', coins: 5_000_000, priceMinor: 422_000, promotion: 'creator code 5% (example)', effectivePriceMinor: 400_900, effectiveCoins: 5_000_000, notes: '' },
      { seller: 'FUTGOAT', url: 'https://futgoat.com/fc27-coins/', checkedAt: '2026-09-23T22:30:00.000Z', platform: 'all', coins: 10_000_000, priceMinor: 844_000, promotion: 'creator code 5% (example)', effectivePriceMinor: 801_800, effectiveCoins: 10_000_000, notes: 'maximum order' },
      { seller: 'FIFA Coins Israel', url: 'https://fifacoinsisrael.com/shop/', checkedAt: '2026-09-23T22:35:00.000Z', platform: 'all', coins: 100_000, priceMinor: 9_500, promotion: '+10% bonus coins', effectivePriceMinor: 9_500, effectiveCoins: 110_000, notes: 'bonus shown on the product page arithmetic' },
      { seller: 'FIFA Coins Israel', url: 'https://fifacoinsisrael.com/shop/', checkedAt: '2026-09-23T22:35:00.000Z', platform: 'all', coins: 500_000, priceMinor: 42_000, promotion: '+10% bonus coins', effectivePriceMinor: 42_000, effectiveCoins: 550_000, notes: '' },
      { seller: 'FIFA Coins Israel', url: 'https://fifacoinsisrael.com/shop/', checkedAt: '2026-09-23T22:35:00.000Z', platform: 'all', coins: 1_000_000, priceMinor: 82_000, promotion: '+10% bonus coins', effectivePriceMinor: 82_000, effectiveCoins: 1_100_000, notes: 'tax covered on some orders only' },
      { seller: 'FIFA Coins Israel', url: 'https://fifacoinsisrael.com/shop/', checkedAt: '2026-09-23T22:35:00.000Z', platform: 'all', coins: 2_000_000, priceMinor: 160_000, promotion: '+10% bonus coins', effectivePriceMinor: 160_000, effectiveCoins: 2_200_000, notes: '' },
      { seller: 'FIFA Coins Israel', url: 'https://fifacoinsisrael.com/shop/', checkedAt: '2026-09-23T22:35:00.000Z', platform: 'all', coins: 3_000_000, priceMinor: 230_000, promotion: '+10% bonus coins', effectivePriceMinor: 230_000, effectiveCoins: 3_300_000, notes: 'largest listed package' },
    ],
  },
};

export function isPricingConfigKey(value: string): value is PricingConfigKey {
  return (PRICING_CONFIG_KEYS as readonly string[]).includes(value);
}

// --- validation --------------------------------------------------------------

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PricingConfigError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function int(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new PricingConfigError(`${path} must be an integer`);
  }
  if (value < min || value > max) {
    throw new PricingConfigError(`${path} must be between ${min} and ${max}`);
  }
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new PricingConfigError(`${path} must be true or false`);
  }
  return value;
}

function text(value: unknown, path: string): LocalizedText {
  const raw = record(value, path);
  if (typeof raw['he'] !== 'string' || raw['he'].trim().length === 0 || raw['he'].length > 200) {
    throw new PricingConfigError(`${path}.he must be a short string`);
  }
  const en = typeof raw['en'] === 'string' && raw['en'].trim().length > 0 ? raw['en'].slice(0, 200) : raw['he'];
  return { he: raw['he'], en };
}

function plain(value: unknown, path: string, max = 500): string {
  if (typeof value !== 'string' || value.length > max) {
    throw new PricingConfigError(`${path} must be a string of at most ${max} characters`);
  }
  return value;
}

function isoDate(value: unknown, path: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new PricingConfigError(`${path} must be an ISO date or null`);
  }
  return value;
}

const TIERS: readonly CoinTier[] = ['starter', 'pro', 'elite', 'legend'];

function sanitizePackage(value: unknown, path: string): LadderPackage {
  const raw = record(value, path);
  const key = plain(raw['key'], `${path}.key`, 20);
  if (!/^[a-z0-9]{1,20}$/.test(key)) {
    throw new PricingConfigError(`${path}.key must be lower-case letters and digits`);
  }
  const tier = raw['tier'];
  if (typeof tier !== 'string' || !TIERS.includes(tier as CoinTier)) {
    throw new PricingConfigError(`${path}.tier must be one of ${TIERS.join(', ')}`);
  }
  const coins = int(raw['coins'], `${path}.coins`, 10_000, 100_000_000);
  return {
    key,
    coins,
    // A price of zero or less is not a price. The upper bound is a sanity
    // rail against a missing decimal point, not a commercial limit.
    priceMinor: int(raw['priceMinor'], `${path}.priceMinor`, 100, 100_000_000),
    bonusCoins: int(raw['bonusCoins'] ?? 0, `${path}.bonusCoins`, 0, coins),
    tier: tier as CoinTier,
    recommended: raw['recommended'] === undefined ? false : bool(raw['recommended'], `${path}.recommended`),
    active: raw['active'] === undefined ? true : bool(raw['active'], `${path}.active`),
  };
}

export function sanitizeLadder(value: unknown): LadderConfig {
  const raw = record(value, 'ladder');
  if (raw['edition'] !== 'fc27') {
    throw new PricingConfigError('ladder.edition must be fc27');
  }
  if (!Array.isArray(raw['packages']) || raw['packages'].length === 0 || raw['packages'].length > 20) {
    throw new PricingConfigError('ladder.packages must hold between 1 and 20 packages');
  }
  const packages = raw['packages'].map((entry, index) => sanitizePackage(entry, `ladder.packages[${index}]`));

  const keys = new Set<string>();
  const amounts = new Set<number>();
  for (const pack of packages) {
    if (keys.has(pack.key)) {
      throw new PricingConfigError(`ladder.packages: duplicate key ${pack.key}`);
    }
    if (amounts.has(pack.coins)) {
      throw new PricingConfigError(`ladder.packages: duplicate amount ${pack.coins}`);
    }
    keys.add(pack.key);
    amounts.add(pack.coins);
  }
  if (packages.filter((pack) => pack.recommended).length > 1) {
    throw new PricingConfigError('ladder.packages: at most one package may be recommended');
  }

  // More coins must never cost more per coin. A ladder that breaks this is
  // a ladder the customer cannot read, so it is refused rather than shown.
  const active = [...packages].filter((pack) => pack.active).sort((a, b) => a.coins - b.coins);
  for (let index = 1; index < active.length; index += 1) {
    const smaller = active[index - 1];
    const larger = active[index];
    if (larger.priceMinor <= smaller.priceMinor) {
      throw new PricingConfigError(`ladder.packages: ${larger.key} must cost more than ${smaller.key}`);
    }
    // Compare rates without division: price_L * coins_S <= price_S * coins_L.
    if (larger.priceMinor * (smaller.coins + smaller.bonusCoins) > smaller.priceMinor * (larger.coins + larger.bonusCoins)) {
      throw new PricingConfigError(`ladder.packages: ${larger.key} is dearer per coin than ${smaller.key}`);
    }
  }

  const adjustmentsRaw = raw['platformAdjustmentBps'] === undefined ? {} : record(raw['platformAdjustmentBps'], 'ladder.platformAdjustmentBps');
  const platformAdjustmentBps: Record<string, number> = {};
  for (const [platformId, bps] of Object.entries(adjustmentsRaw)) {
    if (!/^[a-z0-9-]{1,40}$/.test(platformId)) {
      throw new PricingConfigError(`ladder.platformAdjustmentBps: bad platform id ${platformId}`);
    }
    platformAdjustmentBps[platformId] = int(bps, `ladder.platformAdjustmentBps.${platformId}`, -5_000, 5_000);
  }

  const status = raw['status'] ?? 'draft';
  if (status !== 'draft' && status !== 'active') {
    throw new PricingConfigError('ladder.status must be draft or active');
  }

  return {
    edition: 'fc27',
    productSlug: FC27_PRODUCT_SLUG,
    productId: FC27_PRODUCT_ID,
    status,
    packages,
    platformAdjustmentBps,
    // A 100% discount is a giveaway, not a promotion; 50% is already generous.
    maxDiscountBps: int(raw['maxDiscountBps'] ?? PRICING_DEFAULTS.ladder.maxDiscountBps, 'ladder.maxDiscountBps', 0, 5_000),
    maxPerOrder: int(raw['maxPerOrder'] ?? PRICING_DEFAULTS.ladder.maxPerOrder, 'ladder.maxPerOrder', 1, 25),
  };
}

export function sanitizeEconomics(value: unknown): EconomicsConfig {
  const raw = record(value, 'economics');
  const cost = raw['supplierCostPer1MMinor'];
  const supplierCostPer1MMinor = cost === null || cost === undefined ? null : int(cost, 'economics.supplierCostPer1MMinor', 1, 100_000_000);
  const byPlatformRaw = raw['supplierCostByPlatform'] === undefined ? {} : record(raw['supplierCostByPlatform'], 'economics.supplierCostByPlatform');
  const supplierCostByPlatform: Record<string, number> = {};
  for (const [platformId, minor] of Object.entries(byPlatformRaw)) {
    if (!/^[a-z0-9-]{1,40}$/.test(platformId)) {
      throw new PricingConfigError(`economics.supplierCostByPlatform: bad platform id ${platformId}`);
    }
    supplierCostByPlatform[platformId] = int(minor, `economics.supplierCostByPlatform.${platformId}`, 1, 100_000_000);
  }
  return {
    supplierCostPer1MMinor,
    supplierCostByPlatform,
    paymentFeeBps: int(raw['paymentFeeBps'] ?? 0, 'economics.paymentFeeBps', 0, 2_000),
    deliveryLossBps: int(raw['deliveryLossBps'] ?? 0, 'economics.deliveryLossBps', 0, 5_000),
    minMarginBps: int(raw['minMarginBps'] ?? 0, 'economics.minMarginBps', 0, 9_000),
    vatIncluded: raw['vatIncluded'] === undefined ? true : bool(raw['vatIncluded'], 'economics.vatIncluded'),
    vatBps: int(raw['vatBps'] ?? PRICING_DEFAULTS.economics.vatBps, 'economics.vatBps', 0, 5_000),
  };
}

export function sanitizeLaunch(value: unknown): LaunchOfferConfig {
  const raw = record(value, 'launch');
  const benefit = record(raw['benefit'], 'launch.benefit');
  if (benefit['kind'] !== 'BONUS_COINS_PERCENT') {
    throw new PricingConfigError('launch.benefit.kind must be BONUS_COINS_PERCENT');
  }
  const startsAt = isoDate(raw['startsAt'], 'launch.startsAt');
  const endsAt = isoDate(raw['endsAt'], 'launch.endsAt');
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new PricingConfigError('launch.endsAt must be after launch.startsAt');
  }
  if (raw['eligibility'] !== 'first-order') {
    throw new PricingConfigError('launch.eligibility must be first-order');
  }
  const id = plain(raw['id'], 'launch.id', 40);
  if (!/^[a-z0-9-]{3,40}$/.test(id)) {
    throw new PricingConfigError('launch.id must be a slug');
  }
  const terms = Array.isArray(raw['terms']) ? raw['terms'].map((entry, index) => text(entry, `launch.terms[${index}]`)) : [];
  const maxRedemptions = raw['maxRedemptions'] === null || raw['maxRedemptions'] === undefined
    ? null
    : int(raw['maxRedemptions'], 'launch.maxRedemptions', 1, 10_000_000);
  return {
    id,
    enabled: bool(raw['enabled'], 'launch.enabled'),
    name: text(raw['name'], 'launch.name'),
    startsAt,
    endsAt,
    benefit: {
      kind: 'BONUS_COINS_PERCENT',
      // More than 30% extra coins on a first order is a loss leader the
      // economics have not approved; the rail is deliberately tight.
      percentBps: int(benefit['percentBps'], 'launch.benefit.percentBps', 0, 3_000),
      capCoins: int(benefit['capCoins'], 'launch.benefit.capCoins', 1_000, 5_000_000),
      minOrderMinor: int(benefit['minOrderMinor'] ?? 0, 'launch.benefit.minOrderMinor', 0, 10_000_000),
    },
    eligibility: 'first-order',
    maxRedemptions,
    terms,
  };
}

export function sanitizeCompetitors(value: unknown): CompetitorsConfig {
  const raw = record(value, 'competitors');
  const checkedAt = isoDate(raw['checkedAt'], 'competitors.checkedAt');
  if (!checkedAt) {
    throw new PricingConfigError('competitors.checkedAt is required');
  }
  if (!Array.isArray(raw['entries']) || raw['entries'].length > 200) {
    throw new PricingConfigError('competitors.entries must be a list of at most 200 entries');
  }
  const entries = raw['entries'].map((entry, index): CompetitorEntry => {
    const path = `competitors.entries[${index}]`;
    const row = record(entry, path);
    const url = plain(row['url'], `${path}.url`, 300);
    if (!/^https?:\/\//.test(url)) {
      throw new PricingConfigError(`${path}.url must be an http(s) URL`);
    }
    const entryCheckedAt = isoDate(row['checkedAt'], `${path}.checkedAt`) ?? checkedAt;
    const coins = int(row['coins'], `${path}.coins`, 1_000, 100_000_000);
    return {
      seller: plain(row['seller'], `${path}.seller`, 80),
      url,
      checkedAt: entryCheckedAt,
      platform: plain(row['platform'] ?? 'all', `${path}.platform`, 40),
      coins,
      priceMinor: int(row['priceMinor'], `${path}.priceMinor`, 1, 100_000_000),
      promotion: plain(row['promotion'] ?? '', `${path}.promotion`, 200),
      effectivePriceMinor: int(row['effectivePriceMinor'] ?? row['priceMinor'], `${path}.effectivePriceMinor`, 1, 100_000_000),
      effectiveCoins: int(row['effectiveCoins'] ?? coins, `${path}.effectiveCoins`, coins, 200_000_000),
      notes: plain(row['notes'] ?? '', `${path}.notes`, 500),
    };
  });
  return { checkedAt, entries };
}

export function sanitizePricingSetting(key: PricingConfigKey, value: unknown): PricingConfig[PricingConfigKey] {
  switch (key) {
    case 'economics':
      return sanitizeEconomics(value);
    case 'ladder':
      return sanitizeLadder(value);
    case 'launch':
      return sanitizeLaunch(value);
    case 'competitors':
      return sanitizeCompetitors(value);
    default:
      throw new PricingConfigError(`unknown pricing setting ${String(key)}`);
  }
}
