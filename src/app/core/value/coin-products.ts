import {
  CoinPlatform, CoinProduct, CoinTier, GameEdition, Offer, Platform, PlatformFamily, ProductDetail,
} from '../../domain';
import { isPurchasable } from '../../domain';
import { rankByValue } from './offer-value';

/**
 * Tier boundaries by bundle size. Ordered largest first so the first match
 * wins. A bundle of 100K is a Starter, 250K and 500K are Pro, 1M is Elite and
 * 2M and above is Legend. The thresholds are the single place this is decided.
 */
export const TIER_THRESHOLDS: readonly { readonly tier: CoinTier; readonly minAmount: number }[] = [
  { tier: 'legend', minAmount: 2_000_000 },
  { tier: 'elite', minAmount: 1_000_000 },
  { tier: 'pro', minAmount: 250_000 },
  { tier: 'starter', minAmount: 0 },
];

export function tierForAmount(amount: number | undefined): CoinTier {
  const value = amount ?? 0;
  return TIER_THRESHOLDS.find((entry) => value >= entry.minAmount)?.tier ?? 'starter';
}

/** The four tiers in ascending order, for legends, filters and tests. */
export const TIER_ORDER: readonly CoinTier[] = ['starter', 'pro', 'elite', 'legend'];

const PLATFORM_BY_FAMILY: Readonly<Partial<Record<PlatformFamily, CoinPlatform>>> = {
  [PlatformFamily.PlayStation]: 'playstation',
  [PlatformFamily.Xbox]: 'xbox',
  [PlatformFamily.Pc]: 'pc',
};

export function coinPlatformOf(platform: Platform | undefined): CoinPlatform | undefined {
  return platform ? PLATFORM_BY_FAMILY[platform.family] : undefined;
}

export interface CoinProductOptions {
  readonly game: GameEdition;
  /** Restrict to one platform; otherwise the first offered platform is used. */
  readonly platformId?: string;
}

/**
 * The shelf for a coin product: one `CoinProduct` per bundle, priced from the
 * offers of a single platform and store region so the five prices are
 * comparable, sorted by size, with "best value" marked from the data.
 *
 * Nothing here decides a price. It projects offers the server priced.
 */
export function coinProductsFrom(
  detail: ProductDetail,
  platforms: ReadonlyMap<string, Platform>,
  options: CoinProductOptions,
): readonly CoinProduct[] {
  const pool = detail.offers.filter((offer) => !options.platformId || offer.platformId === options.platformId);
  const first = pool[0];
  if (!first) {
    return [];
  }
  const comparable = pool.filter((offer) => offer.platformId === first.platformId && offer.regionId === first.regionId);

  return rankByValue(comparable, detail.product.variants)
    .filter((row) => row.perUnitMinor !== undefined)
    .sort((a, b) => (a.variant.quantityValue ?? 0) - (b.variant.quantityValue ?? 0))
    .flatMap((row): CoinProduct[] => {
      const platform = platforms.get(row.offer.platformId);
      const coinPlatform = coinPlatformOf(platform);
      if (!platform || !coinPlatform) {
        return [];
      }
      const amount = row.variant.quantityValue ?? 0;
      const tier = tierForAmount(amount);
      return [{
        id: row.offer.id,
        game: options.game,
        platform: coinPlatform,
        platformLabel: platform.shortName,
        amount,
        priceIls: shekels(row.offer.price.current.amountMinor),
        compareAtIls: row.offer.price.compareAt ? shekels(row.offer.price.compareAt.amountMinor) : undefined,
        perMillionIls: row.perUnitMinor === undefined ? undefined : shekels(row.perUnitMinor),
        tier,
        artKey: `coins-${tier}`,
        badge: row.isBestValue ? 'best-value' : undefined,
        inStock: purchasable(row.offer),
        productSlug: detail.product.slug,
        variantId: row.variant.id,
        offer: row.offer,
      }];
    });
}

function purchasable(offer: Offer): boolean {
  return offer.active && isPurchasable(offer.inventory);
}

function shekels(amountMinor: number): number {
  return Math.round(amountMinor) / 100;
}
