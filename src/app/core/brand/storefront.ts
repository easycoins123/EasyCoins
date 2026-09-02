/**
 * What the storefront actually sells today.
 *
 * EASYCOINS is built as a multi-game commerce platform: the catalog, the domain
 * and the backend all handle several games without knowing which. The shop we
 * are opening does not. It sells EA SPORTS FC, and pretending otherwise would
 * mean a customer clicking "games" to find a list of one.
 *
 * This is the single place that decides. Selling a second game later is a change
 * to this file plus catalog data, not a redesign: the architecture stays
 * general, the storefront stays deliberately narrow.
 */
export const STOREFRONT = {
  /** The game the shop is built around. Matches a `games.slug` in the catalog. */
  focusGameSlug: 'ea-sports-fc',

  /** Shown wherever the game needs naming in copy. */
  focusGameName: 'EA SPORTS FC',

  /**
   * The coin product the shop is built around. Matches a `products.slug`.
   *
   * Named here so the pages that lead with it (the store shelf, the hero, the
   * drawer) can fetch it in one request instead of resolving it through the
   * game's product list first. If the slug ever fails to load, every caller
   * falls back to showing the product as an ordinary card.
   */
  focusProductSlug: 'ea-fc-ultimate-team-coins',

  /**
   * Whether to surface game browsing at all. False collapses the game routes
   * out of navigation; the routes still resolve, so an existing link keeps
   * working.
   */
  showGameNavigation: false,
} as const;
