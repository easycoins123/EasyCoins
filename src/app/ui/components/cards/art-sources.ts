/**
 * Raster art registry.
 *
 * The product is Ultimate Team coins, and the artwork that says so is the
 * approved FUT coin renders baked by `qa/bake-fut-art.mjs` from the masters
 * in `docs/design/source`: one composition per package size, growing from a
 * single coin to a floor of stacks, a clean product coin, the hero render,
 * and two scene coins (under the floodlights, on the plinth) for the story
 * sections. Each ships as AVIF with a WebP fallback. The vector coin drawn by
 * `tt-coin-art` remains the fallback when no raster is registered.
 *
 * Compositions a component can ask for:
 *
 *   bundle  the package shelf, one composition per bundle size
 *   card    a single product coin: cards without an amount, the quote, the
 *           amount picker's tiles, the product page, the cart thumbnail
 *   hero    the home hero
 *
 * Paths are relative to `src/`, the way Angular serves assets. The compliance
 * test checks that every registered file exists, that every raster ships in
 * both formats, and that no file exceeds the size ceiling.
 */
export type CoinArtVariant = 'tile' | 'card' | 'quote' | 'hero' | 'bundle';

export type ArtComposition = 'card' | 'hero' | 'bundle';

export interface ArtSource {
  readonly avif: string;
  readonly webp: string;
  /** Intrinsic pixel size, so the image reserves its box before it loads. */
  readonly width: number;
  readonly height: number;
}

export type ArtSet = Readonly<Partial<Record<ArtComposition, ArtSource>>>;

const file = (name: string, width = 448, height = 299): ArtSource => ({
  avif: `assets/products/${name}.avif`,
  webp: `assets/products/${name}.webp`,
  width,
  height,
});

/** The product coin, lying flat. One file for every tier: the tier colours the chip, not the coin. */
const PRODUCT_COIN = file('fut-coin');
const HERO = file('fut-hero', 960, 663);

export const ART_SOURCES: Readonly<Partial<Record<string, ArtSet>>> = {
  'coins-starter': { card: PRODUCT_COIN },
  'coins-pro': { card: PRODUCT_COIN },
  'coins-elite': { card: PRODUCT_COIN },
  'coins-legend': { card: PRODUCT_COIN, hero: HERO },
  'bundle-100k': { bundle: file('fut-100k') },
  'bundle-250k': { bundle: file('fut-250k') },
  'bundle-500k': { bundle: file('fut-500k') },
  'bundle-1m': { bundle: file('fut-1m') },
  'bundle-2m': { bundle: file('fut-2m') },
  /** A coin under the floodlights: the "choose" step, where the game is. */
  'fut-stadium': { bundle: file('fut-stadium'), card: file('fut-stadium') },
  /** A coin on the plinth: the closing invitation. */
  'fut-podium': { bundle: file('fut-podium'), card: file('fut-podium') },
  /** The product coin at thumbnail size, for cart lines. */
  'fut-thumb': { card: file('fut-thumb', 240, 160) },
};

/**
 * The art key for a bundle size. Five compositions serve the whole ladder: a
 * size without its own render takes the composition of the step below it.
 * Mirrors `core/value/coin-products.ts`.
 */
export function bundleArtKey(amount: number): string {
  if (amount >= 2_000_000) {
    return 'bundle-2m';
  }
  if (amount >= 1_000_000) {
    return 'bundle-1m';
  }
  if (amount >= 500_000) {
    return 'bundle-500k';
  }
  if (amount >= 250_000) {
    return 'bundle-250k';
  }
  return 'bundle-100k';
}

/** The composition a variant draws. */
export function compositionFor(variant: CoinArtVariant): ArtComposition {
  switch (variant) {
    case 'hero': return 'hero';
    case 'bundle': return 'bundle';
    default: return 'card';
  }
}

/**
 * The raster for an art key and variant.
 *
 * A bundle size without a composition of its own (a custom amount) falls
 * back to the product coin, so the shelf never mixes the FUT coin with the
 * vector one.
 */
export function artSource(artKey: string | undefined, variant: CoinArtVariant, tier = 'legend'): ArtSource | undefined {
  const composition = compositionFor(variant);
  const key = artKey ?? `coins-${tier}`;
  return ART_SOURCES[key]?.[composition] ?? ART_SOURCES[`coins-${tier}`]?.card ?? PRODUCT_COIN;
}
