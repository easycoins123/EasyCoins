import { sortByPlatformOrder, sortOffersByPlatform } from './platform-order';

/**
 * A customer's default platform must be deterministic and PS5-first.
 *
 * This exists because of a real defect: `platformIds` was built with
 * `[...new Set(offers.map((o) => o.platformId))]`, which preserves whatever
 * order Postgres happened to return the rows in — not the order they were
 * inserted in. In production this put PS4 first, so the hero and product
 * page defaulted to PS4 for a PS5-first FC27 launch. `resolve()` on the
 * frontend picks `offered[0]` when nothing is remembered, so this ordering
 * directly decides the platform a first-time visitor sees selected.
 */
describe('sortByPlatformOrder', () => {
  it('always puts PS5 first regardless of the input order', () => {
    expect(sortByPlatformOrder(['plat-ps4', 'plat-xbox', 'plat-pc', 'plat-ps5'])).toEqual([
      'plat-ps5', 'plat-ps4', 'plat-xbox', 'plat-pc',
    ]);
  });

  it('is stable for an already-correct order', () => {
    expect(sortByPlatformOrder(['plat-ps5', 'plat-ps4', 'plat-xbox', 'plat-pc'])).toEqual([
      'plat-ps5', 'plat-ps4', 'plat-xbox', 'plat-pc',
    ]);
  });

  it('handles a subset, keeping only the offered platforms in canonical order', () => {
    expect(sortByPlatformOrder(['plat-xbox', 'plat-ps5'])).toEqual(['plat-ps5', 'plat-xbox']);
  });

  it('does not drop or duplicate an unknown platform id', () => {
    expect(sortByPlatformOrder(['plat-switch', 'plat-ps5'])).toEqual(['plat-ps5', 'plat-switch']);
  });

  it('does not mutate its input', () => {
    const input = ['plat-ps4', 'plat-ps5'];
    sortByPlatformOrder(input);
    expect(input).toEqual(['plat-ps4', 'plat-ps5']);
  });
});

/**
 * `sortOffersByPlatform` is the fix that mattered most in production: the
 * frontend's default-platform logic reads `detail.offers[0]` (the product
 * detail response's raw offer list, filtered to the selected variant), not
 * the summary `platformIds` field. Sorting only the derived list left this
 * array unordered, so the live site kept defaulting to PS4 even after
 * `sortByPlatformOrder` shipped.
 */
describe('sortOffersByPlatform', () => {
  const offer = (platformId: string) => ({ platformId, id: `o-${platformId}` });

  it('puts the PS5 offer first regardless of database row order', () => {
    const sorted = sortOffersByPlatform([offer('plat-ps4'), offer('plat-xbox'), offer('plat-pc'), offer('plat-ps5')]);
    expect(sorted.map((o) => o.platformId)).toEqual(['plat-ps5', 'plat-ps4', 'plat-xbox', 'plat-pc']);
  });

  it('preserves every other field on the row, only reordering', () => {
    const rows = [{ platformId: 'plat-pc', priceAmountMinor: 100 }, { platformId: 'plat-ps5', priceAmountMinor: 200 }];
    expect(sortOffersByPlatform(rows)).toEqual([
      { platformId: 'plat-ps5', priceAmountMinor: 200 },
      { platformId: 'plat-pc', priceAmountMinor: 100 },
    ]);
  });

  it('does not mutate its input array', () => {
    const input = [offer('plat-pc'), offer('plat-ps5')];
    sortOffersByPlatform(input);
    expect(input.map((o) => o.platformId)).toEqual(['plat-pc', 'plat-ps5']);
  });
});
