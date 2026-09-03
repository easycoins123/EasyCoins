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
 *   card   store cards, the quote, the product page, the home close
 *   hero   the home hero (Legend only; nothing else is shown that large)
 *   tile   never raster. At 60-100 CSS px the vector is sharper and free.
 *
 * Paths are relative to `src/`, the way Angular serves assets. The compliance
 * test checks that every registered file exists, that every raster ships in
 * both formats, and that no file exceeds the size ceiling.
 */
export type CoinArtVariant = 'tile' | 'card' | 'quote' | 'hero';

export type ArtComposition = 'card' | 'hero';

export interface ArtSource {
  readonly avif: string;
  readonly webp: string;
  /** Intrinsic pixel size, so the image reserves its box before it loads. */
  readonly width: number;
  readonly height: number;
}

export type ArtSet = Readonly<Partial<Record<ArtComposition, ArtSource>>>;

const card = (tier: string): ArtSource => ({
  avif: `assets/products/coins-${tier}.avif`,
  webp: `assets/products/coins-${tier}.webp`,
  width: 720,
  height: 576,
});

export const ART_SOURCES: Readonly<Partial<Record<string, ArtSet>>> = {
  'coins-starter': { card: card('starter') },
  'coins-pro': { card: card('pro') },
  'coins-elite': { card: card('elite') },
  'coins-legend': {
    card: card('legend'),
    hero: {
      avif: 'assets/products/coins-legend-hero.avif',
      webp: 'assets/products/coins-legend-hero.webp',
      width: 1200,
      height: 1015,
    },
  },
};

/** The composition a variant draws, or none when the vector is the better choice. */
export function compositionFor(variant: CoinArtVariant): ArtComposition | undefined {
  switch (variant) {
    case 'hero': return 'hero';
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
