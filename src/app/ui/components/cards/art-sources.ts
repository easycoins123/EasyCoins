/**
 * Raster art registry.
 *
 * The coin artwork is drawn in SVG by `tt-coin-art`, and that vector remains
 * the source of truth and the final fallback. For the compositions that are
 * shown large, a baked raster of the same drawing with brushed-metal grain, a
 * specular highlight and a bevelled rim is registered here per art key, as an
 * AVIF with a WebP fallback (see `qa/bake-coin-art.mjs`). The component asks
 * for the composition it is about to draw and gets the best representation:
 *
 *   bundle  the package shelf, one composition per bundle size
 *   card    product cards without an amount, the quote, the product page
 *   hero    the home hero (Legend only; nothing else is shown that large)
 *   tile    never raster. At 60-100 CSS px the vector is sharper and free.
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

const file = (name: string, width = 720, height = 576): ArtSource => ({
  avif: `assets/products/${name}.avif`,
  webp: `assets/products/${name}.webp`,
  width,
  height,
});

export const ART_SOURCES: Readonly<Partial<Record<string, ArtSet>>> = {
  'coins-starter': { card: file('coins-starter') },
  'coins-pro': { card: file('coins-pro') },
  'coins-elite': { card: file('coins-elite') },
  'coins-legend': { card: file('coins-legend'), hero: file('coins-legend-hero', 1200, 1015) },
  'bundle-100k': { bundle: file('bundle-100k') },
  'bundle-250k': { bundle: file('bundle-250k') },
  'bundle-500k': { bundle: file('bundle-500k') },
  'bundle-1m': { bundle: file('bundle-1m') },
  'bundle-2m': { bundle: file('bundle-2m') },
};

/** The art key for a bundle size, e.g. 1_000_000 -> "bundle-1m". */
export function bundleArtKey(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `bundle-${Number.isInteger(millions) ? millions : millions.toFixed(1)}m`;
  }
  return `bundle-${Math.round(amount / 1_000)}k`;
}

/** The composition a variant draws, or none when the vector is the better choice. */
export function compositionFor(variant: CoinArtVariant): ArtComposition | undefined {
  switch (variant) {
    case 'hero': return 'hero';
    case 'bundle': return 'bundle';
    case 'card':
    case 'quote': return 'card';
    default: return undefined;
  }
}

export function artSource(artKey: string | undefined, variant: CoinArtVariant): ArtSource | undefined {
  const composition = compositionFor(variant);
  if (!artKey || !composition) {
    return undefined;
  }
  return ART_SOURCES[artKey]?.[composition];
}
