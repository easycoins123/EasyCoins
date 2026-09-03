/**
 * The five materials a bundle can be made of, smallest to largest.
 *
 * Defined here, away from the pack component, so the header and drawer can
 * colour their chips without pulling the whole artwork into the eager bundle.
 */
export type PackMaterial = 'steel' | 'bronze' | 'silver' | 'gold' | 'elite';

export const MATERIAL_BY_STEP: readonly PackMaterial[] = ['steel', 'bronze', 'silver', 'gold', 'elite'];

/**
 * A tier material, for components that colour themselves to match the pack
 * they show: card frames, selection rings, tags, glows.
 *
 * Values are CSS custom-property references into the tokens, so a theme
 * change stays a single-file change. The Hebrew label names the material the
 * way a collector would say it.
 */
export interface Material {
  readonly name: PackMaterial;
  readonly labelHe: string;
  readonly color: string;
  readonly light: string;
  readonly glow: string;
}

const MATERIALS: Record<PackMaterial, Material> = {
  steel: { name: 'steel', labelHe: 'פלדה', color: 'var(--tt-mat-steel)', light: 'var(--tt-mat-steel-light)', glow: 'var(--tt-mat-steel-glow)' },
  bronze: { name: 'bronze', labelHe: 'ברונזה', color: 'var(--tt-mat-bronze)', light: 'var(--tt-mat-bronze-light)', glow: 'var(--tt-mat-bronze-glow)' },
  silver: { name: 'silver', labelHe: 'כסף', color: 'var(--tt-mat-silver)', light: 'var(--tt-mat-silver-light)', glow: 'var(--tt-mat-silver-glow)' },
  gold: { name: 'gold', labelHe: 'זהב', color: 'var(--tt-mat-gold)', light: 'var(--tt-mat-gold-light)', glow: 'var(--tt-mat-gold-glow)' },
  elite: { name: 'elite', labelHe: 'עלית', color: 'var(--tt-mat-elite)', light: 'var(--tt-mat-elite-light)', glow: 'var(--tt-mat-elite-glow)' },
};

/** The material for a tier position, one through five. */
export function materialForStep(step: number): Material {
  return MATERIALS[MATERIAL_BY_STEP[Math.min(4, Math.max(0, Math.round(step) - 1))]];
}

export function material(name: PackMaterial): Material {
  return MATERIALS[name];
}
