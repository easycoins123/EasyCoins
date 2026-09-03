import { CoinTier } from '../../../domain';

export { TIER_ORDER, TIER_THRESHOLDS, tierForAmount } from '../../../core/value/coin-products';
export type { CoinTier } from '../../../domain';

/**
 * The four EasyCoins tiers as visual tokens.
 *
 * Four materials of our own, chosen so they are related and unmistakably
 * different at a glance, and so none of them is a bronze / silver / gold
 * ladder borrowed from someone else's rarity system:
 *
 *   starter  graphite, lit by the brand's lime. Matte, energetic, entry level.
 *   pro      cobalt. Brushed blue metal; the working tier.
 *   elite    champagne. Polished metal in the brand's money colour.
 *   legend   obsidian with a prismatic edge and a champagne face. The top.
 *
 * `color`, `light`, `deep`, `accent` and `glow` are CSS custom properties from
 * `_tokens.scss`, so a re-theme is one file. `palette` carries the same
 * materials as hex for the inline SVG artwork, which needs concrete stops.
 */
export interface TierPalette {
  /** Face highlight, body and shadow of the metal. */
  readonly light: string;
  readonly mid: string;
  readonly dark: string;
  readonly deep: string;
  /** The struck mark on the face. */
  readonly mark: string;
  readonly markShadow: string;
  /** Rim ring. Legend's rim is a prism, drawn with `prism` below. */
  readonly rim: string;
  /** The reeded edge. Usually the face highlight; on obsidian it is the metal inlay. */
  readonly reed: string;
  readonly glow: string;
  readonly prism?: readonly string[];
}

export interface Tier {
  readonly name: CoinTier;
  readonly labelHe: string;
  readonly labelEn: string;
  readonly color: string;
  readonly light: string;
  readonly deep: string;
  readonly accent: string;
  readonly glow: string;
  readonly palette: TierPalette;
}

export const TIERS: Readonly<Record<CoinTier, Tier>> = {
  starter: {
    name: 'starter',
    labelHe: 'סטארטר',
    labelEn: 'Starter',
    color: 'var(--tt-tier-starter)',
    light: 'var(--tt-tier-starter-light)',
    deep: 'var(--tt-tier-starter-deep)',
    accent: 'var(--tt-tier-starter-accent)',
    glow: 'var(--tt-tier-starter-glow)',
    palette: {
      light: '#5B626D', mid: '#363C45', dark: '#23272E', deep: '#14171C',
      mark: '#C9D1DC', markShadow: '#0E1013', rim: '#BEF23C', reed: '#8F98A6', glow: '#BEF23C',
    },
  },
  pro: {
    name: 'pro',
    labelHe: 'פרו',
    labelEn: 'Pro',
    color: 'var(--tt-tier-pro)',
    light: 'var(--tt-tier-pro-light)',
    deep: 'var(--tt-tier-pro-deep)',
    accent: 'var(--tt-tier-pro-accent)',
    glow: 'var(--tt-tier-pro-glow)',
    palette: {
      light: '#C4D3FF', mid: '#4C7DFF', dark: '#2A50D6', deep: '#15308F',
      mark: '#EEF3FF', markShadow: '#0F2270', rim: '#DCE6FF', reed: '#C4D3FF', glow: '#4C7DFF',
    },
  },
  elite: {
    name: 'elite',
    labelHe: 'עלית',
    labelEn: 'Elite',
    color: 'var(--tt-tier-elite)',
    light: 'var(--tt-tier-elite-light)',
    deep: 'var(--tt-tier-elite-deep)',
    accent: 'var(--tt-tier-elite-accent)',
    glow: 'var(--tt-tier-elite-glow)',
    palette: {
      light: '#F7EBCB', mid: '#D4B46A', dark: '#A9884A', deep: '#6B5228',
      mark: '#7B6132', markShadow: '#FBF3DC', rim: '#FBF3DC', reed: '#F7EBCB', glow: '#D4B46A',
    },
  },
  legend: {
    name: 'legend',
    labelHe: 'לג׳נד',
    labelEn: 'Legend',
    color: 'var(--tt-tier-legend)',
    light: 'var(--tt-tier-legend-light)',
    deep: 'var(--tt-tier-legend-deep)',
    accent: 'var(--tt-tier-legend-accent)',
    glow: 'var(--tt-tier-legend-glow)',
    palette: {
      light: '#443C2F', mid: '#221E17', dark: '#14110C', deep: '#070605',
      mark: '#E6CB86', markShadow: '#000000', rim: '#E6CB86', reed: '#E6CB86', glow: '#E6CB86',
      prism: ['#E6CB86', '#F4E6C3', '#CFC2FF', '#8FE3D6', '#E6CB86'],
    },
  },
};

export function tier(name: CoinTier): Tier {
  return TIERS[name];
}
