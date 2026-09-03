/**
 * Raster art for the world layer, registered like the coin art so no
 * component carries an asset path. Baked by `qa/bake-stadium.mjs`; the
 * compliance test checks existence, the AVIF+WebP pair and the weight ceiling.
 */
export interface WorldArt {
  readonly avif: string;
  readonly webp: string;
  readonly width: number;
  readonly height: number;
}

export const WORLD_ART: Readonly<Record<'bokeh', WorldArt>> = {
  /** The crowd, out of focus, behind the floodlights. Transparent. */
  bokeh: {
    avif: 'assets/ui/stadium-bokeh.avif',
    webp: 'assets/ui/stadium-bokeh.webp',
    width: 640,
    height: 280,
  },
};
