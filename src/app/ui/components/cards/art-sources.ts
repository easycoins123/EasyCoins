/**
 * Raster art registry.
 *
 * The coin artwork is drawn in SVG by `tt-coin-art`, which is the production
 * art today. When an illustrator delivers rendered coins, they go into
 * `src/assets/products/` as an AVIF and WebP pair per tier and are registered
 * here by art key; the card system then renders a `<picture>` instead of the
 * SVG without any change to the cards. The compliance test checks that every
 * registered path exists and that every raster asset has both formats.
 *
 * Paths are relative to `src/`, the way Angular serves assets.
 */
export interface ArtSource {
  readonly avif: string;
  readonly webp: string;
  readonly width: number;
  readonly height: number;
}

export const ART_SOURCES: Readonly<Partial<Record<string, ArtSource>>> = {
  // Once the files exist, an entry per art key names the AVIF and WebP files
  // under assets/products/ and their intrinsic width and height. Nothing is
  // registered today: the SVG artwork is the production art.
};

export function artSource(artKey: string | undefined): ArtSource | undefined {
  return artKey ? ART_SOURCES[artKey] : undefined;
}
