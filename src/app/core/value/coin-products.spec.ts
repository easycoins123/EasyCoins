import {
  Offer, Platform, PlatformFamily, PlatformKind, Price, Product, ProductDetail, ProductVariant,
} from '../../domain';
import { TIER_ORDER, TIER_THRESHOLDS, coinPlatformOf, coinProductsFrom, tierForAmount } from './coin-products';

const variant = (id: string, quantityValue?: number): ProductVariant => ({
  id, productId: 'p1', name: { he: id }, sku: id, quantityValue,
  metadata: {}, sortOrder: 0, active: true,
});

const offer = (id: string, variantId: string, amountMinor: number, platformId = 'plat-ps5', active = true): Offer => ({
  id, productId: 'p1', variantId, platformId, regionId: 'global',
  price: { current: { amountMinor, currency: 'ILS' } } as Price,
  inventory: { status: 'IN_STOCK' } as Offer['inventory'],
  fulfillmentMethod: 'MANUAL_DELIVERY' as Offer['fulfillmentMethod'],
  checkoutRequirements: [], active,
});

const platform = (id: string, family: PlatformFamily, shortName: string): Platform => ({
  id, kind: PlatformKind.PlayStation5, family, name: { he: shortName }, shortName: { he: shortName }, sortOrder: 0,
});

const platforms = new Map<string, Platform>([
  ['plat-ps5', platform('plat-ps5', PlatformFamily.PlayStation, 'PS5')],
  ['plat-xbox', platform('plat-xbox', PlatformFamily.Xbox, 'Xbox')],
  ['plat-pc', platform('plat-pc', PlatformFamily.Pc, 'PC')],
  ['plat-any', platform('plat-any', PlatformFamily.Any, 'All')],
]);

const variants = [
  variant('v100k', 100_000), variant('v250k', 250_000), variant('v500k', 500_000),
  variant('v1m', 1_000_000), variant('v2m', 2_000_000),
];

const detail = (offers: readonly Offer[]): ProductDetail => ({
  product: { id: 'p1', slug: 'coins', variants } as unknown as Product,
  offers,
} as unknown as ProductDetail);

describe('tiers', () => {
  it('assigns the four EasyCoins tiers by bundle size', () => {
    expect(tierForAmount(100_000)).toBe('starter');
    expect(tierForAmount(250_000)).toBe('pro');
    expect(tierForAmount(500_000)).toBe('pro');
    expect(tierForAmount(1_000_000)).toBe('elite');
    expect(tierForAmount(2_000_000)).toBe('legend');
    expect(tierForAmount(5_000_000)).toBe('legend');
  });

  it('treats an unknown amount as the entry tier', () => {
    expect(tierForAmount(undefined)).toBe('starter');
    expect(tierForAmount(0)).toBe('starter');
  });

  it('keeps the thresholds ordered largest first so the first match wins', () => {
    const amounts = TIER_THRESHOLDS.map((entry) => entry.minAmount);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(TIER_THRESHOLDS.map((entry) => entry.tier)).toEqual([...TIER_ORDER].reverse());
  });
});

describe('coin products', () => {
  const offers = [
    offer('o100k', 'v100k', 4900), offer('o250k', 'v250k', 11_900), offer('o500k', 'v500k', 21_900),
    offer('o1m', 'v1m', 39_900), offer('o2m', 'v2m', 74_900),
  ];

  it('projects the shelf, one product per bundle, smallest first', () => {
    const products = coinProductsFrom(detail(offers), platforms, { game: 'fc26' });
    expect(products.map((product) => product.amount)).toEqual([100_000, 250_000, 500_000, 1_000_000, 2_000_000]);
    expect(products.map((product) => product.tier)).toEqual(['starter', 'pro', 'pro', 'elite', 'legend']);
    expect(products.every((product) => product.game === 'fc26' && product.platform === 'playstation')).toBe(true);
    expect(products[0].priceIls).toBe(49);
    expect(products[0].perMillionIls).toBe(490);
    expect(products.map((product) => product.artKey)).toEqual(['bundle-100k', 'bundle-250k', 'bundle-500k', 'bundle-1m', 'bundle-2m']);
    expect(products[0].productSlug).toBe('coins');
    expect(products[0].variantId).toBe('v100k');
  });

  it('marks the best value from the data and nothing else', () => {
    const products = coinProductsFrom(detail(offers), platforms, { game: 'fc26' });
    // 374.50 per million on the 2M bundle beats every other rate.
    expect(products.find((product) => product.amount === 2_000_000)?.badge).toBe('best-value');
    expect(products.filter((product) => product.badge).length).toBe(1);
  });

  it('prices the shelf for the requested platform only', () => {
    const mixed = [...offers, offer('x1m', 'v1m', 42_900, 'plat-xbox'), offer('x2m', 'v2m', 79_900, 'plat-xbox')];
    const xbox = coinProductsFrom(detail(mixed), platforms, { game: 'fc26', platformId: 'plat-xbox' });
    expect(xbox.map((product) => product.amount)).toEqual([1_000_000, 2_000_000]);
    expect(xbox.every((product) => product.platform === 'xbox')).toBe(true);
    expect(xbox[0].priceIls).toBe(429);
  });

  it('reports stock from the offer', () => {
    const inactive = [offer('o100k', 'v100k', 4900, 'plat-ps5', false), offer('o1m', 'v1m', 39_900)];
    const products = coinProductsFrom(detail(inactive), platforms, { game: 'fc26' });
    expect(products.find((product) => product.amount === 100_000)?.inStock).toBe(false);
    expect(products.find((product) => product.amount === 1_000_000)?.inStock).toBe(true);
  });

  it('maps platform families to the three storefront platforms and skips the rest', () => {
    expect(coinPlatformOf(platforms.get('plat-ps5'))).toBe('playstation');
    expect(coinPlatformOf(platforms.get('plat-xbox'))).toBe('xbox');
    expect(coinPlatformOf(platforms.get('plat-pc'))).toBe('pc');
    expect(coinPlatformOf(platforms.get('plat-any'))).toBeUndefined();
    const generic = coinProductsFrom(detail([offer('g', 'v100k', 4900, 'plat-any')]), platforms, { game: 'fc26' });
    expect(generic).toEqual([]);
  });

  it('is an edition-agnostic projection: FC 27 is the same shelf with a different label', () => {
    const products = coinProductsFrom(detail(offers), platforms, { game: 'fc27' });
    expect(products.every((product) => product.game === 'fc27')).toBe(true);
  });
});
