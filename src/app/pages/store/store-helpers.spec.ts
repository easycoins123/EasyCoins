import { OFFERS, PLATFORMS, PRODUCTS } from '../../data/mock/catalog.seed';
import { CatalogLookups } from '../../state';
import { ProductType } from '../../domain';
import { samePriceOnEveryPlatform } from '../home/home.page';
import { availableTypes, offeredPlatforms } from './store.page';

const lookups = {
  games: [],
  platforms: new Map(PLATFORMS.map((platform) => [platform.id, platform])),
  regions: new Map(),
  fulfillment: new Map(),
} as unknown as CatalogLookups;

const product = PRODUCTS.find((candidate) => candidate.slug === 'ea-fc-ultimate-team-coins')!;
const coins = { product, offers: OFFERS.filter((offer) => offer.productId === product.id) };

describe('store helpers', () => {
  it('lists only the platforms the coin product is actually offered for, in catalog order', () => {
    const ids = offeredPlatforms(coins, lookups).map((platform) => platform.id);
    expect(ids).toEqual(['plat-ps5', 'plat-ps4', 'plat-xbox', 'plat-pc']);
    expect(ids).not.toContain('plat-mobile');
    expect(ids).not.toContain('plat-any');
  });

  it('offers a product-type filter only for types the catalog has', () => {
    const all = [
      { value: ProductType.GameCurrency, label: 'מטבעות משחק' },
      { value: ProductType.Subscription, label: 'מנוי' },
      { value: ProductType.GiftCard, label: 'כרטיס מתנה' },
    ];
    expect(availableTypes(all, new Set([ProductType.GameCurrency, ProductType.GiftCard])).map((entry) => entry.label))
      .toEqual(['מטבעות משחק', 'כרטיס מתנה']);
    expect(availableTypes(all, new Set())).toEqual([]);
  });

  it('claims one price for every platform only when the offers say so', () => {
    expect(samePriceOnEveryPlatform(coins)).toBeTrue();
    const dearerXbox = {
      offers: coins.offers.map((offer) => (offer.platformId === 'plat-xbox'
        ? { ...offer, price: { ...offer.price, current: { ...offer.price.current, amountMinor: offer.price.current.amountMinor + 100 } } }
        : offer)),
    };
    expect(samePriceOnEveryPlatform(dearerXbox)).toBeFalse();
    expect(samePriceOnEveryPlatform({ offers: [] })).toBeFalse();
  });
});
