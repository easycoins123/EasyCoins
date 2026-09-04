import { ProductVariant } from '../../domain';

/**
 * The launch bonus: extra coins delivered with a bundle.
 *
 * The number lives in the variant's metadata (`launchBonus`, in coins) and is
 * set by the catalog seed, so the storefront never invents a bonus and the
 * same figure reaches the order line the fulfilment team reads. A variant
 * without the field simply has no bonus.
 */
export const LAUNCH_BONUS_KEY = 'launchBonus';

export function launchBonusOf(variant: ProductVariant | undefined): number {
  const value = variant?.metadata[LAUNCH_BONUS_KEY];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Bonus as a whole percentage of the base amount, for copy like "+15%". */
export function bonusPercent(amount: number, bonus: number): number {
  return amount > 0 && bonus > 0 ? Math.round((bonus / amount) * 100) : 0;
}

/** True when any bundle of the product carries a bonus: the campaign is on. */
export function hasLaunchBonus(variants: readonly ProductVariant[]): boolean {
  return variants.some((variant) => launchBonusOf(variant) > 0);
}
