/**
 * The platform order a customer should see everywhere a platform list is
 * derived from live offers: current generation first, PS5 leading.
 *
 * Every writer inserts offers in this order, but a `Set` built from
 * unordered database rows has no promise of preserving it — Postgres makes
 * no ordering guarantee without an `ORDER BY`, and an UPDATE-heavy table
 * (the seed reconciles it on every deploy) can return rows in a different
 * physical order than the one they were first inserted in. Without this,
 * "which platform is selected first" was effectively random per deploy: FC27
 * showed PS4 selected by default in production while the seed writes PS5
 * first, because nothing re-sorted what the database happened to return.
 */
const PLATFORM_DISPLAY_ORDER: readonly string[] = ['plat-ps5', 'plat-ps4', 'plat-xbox', 'plat-pc'];

function platformRank(id: string): number {
  const index = PLATFORM_DISPLAY_ORDER.indexOf(id);
  return index === -1 ? PLATFORM_DISPLAY_ORDER.length : index;
}

/** Sorts platform ids into the canonical display order; an id outside the list keeps its relative order, last. */
export function sortByPlatformOrder(platformIds: readonly string[]): string[] {
  return [...platformIds].sort((a, b) => platformRank(a) - platformRank(b));
}

/**
 * Sorts any row carrying a `platformId` into the canonical display order.
 *
 * This is the one that matters most: the product detail response's `offers`
 * array is what the frontend's "which platform is selected by default"
 * logic reads (`detail.offers[0]`, after filtering to the selected variant),
 * so an unordered `offers` array picked the default platform, not just the
 * summary `platformIds` list derived from it.
 */
export function sortOffersByPlatform<T extends { readonly platformId: string }>(offers: readonly T[]): T[] {
  return [...offers].sort((a, b) => platformRank(a.platformId) - platformRank(b.platformId));
}
