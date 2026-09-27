import { sortByPlatformOrder } from './platform-order';

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
