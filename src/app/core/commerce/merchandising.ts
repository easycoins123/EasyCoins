/**
 * Merchandising: which bundles lead, and what each one is called on the shelf.
 *
 * Roles are shelf language, not claims. Nothing here says "most popular":
 * the shop has no sales figures to back that, so the labels describe the
 * bundle's place in the ladder. "Best value" is the one exception and it is
 * computed from prices, never assigned.
 */
export type CoinRole = 'starter' | 'kickoff' | 'core' | 'full' | 'mega' | 'max' | 'best-value';

/** The bundles the home page leads with, in ladder order. Five compositions, five cards. */
export const HOME_CURATED_AMOUNTS: readonly number[] = [100_000, 250_000, 500_000, 1_000_000, 2_000_000];

const ROLE_BY_AMOUNT: Readonly<Record<number, CoinRole>> = {
  100_000: 'starter',
  250_000: 'kickoff',
  500_000: 'core',
  1_000_000: 'full',
  2_000_000: 'mega',
  5_000_000: 'max',
};

export const ROLE_LABELS: Readonly<Record<CoinRole, string>> = {
  starter: 'להתחלה',
  kickoff: 'פתיחה חזקה',
  core: 'הליבה',
  full: 'מיליון מלא',
  mega: 'מגה',
  max: 'המקסימום',
  'best-value': 'הכי משתלם',
};

/** The role a bundle plays on the shelf; best value wins when the numbers say so. */
export function roleFor(amount: number, bestValue: boolean): CoinRole | undefined {
  if (bestValue) {
    return 'best-value';
  }
  return ROLE_BY_AMOUNT[amount];
}

export function roleLabel(role: CoinRole | undefined): string | undefined {
  return role ? ROLE_LABELS[role] : undefined;
}

export function isCurated(amount: number): boolean {
  return HOME_CURATED_AMOUNTS.includes(amount);
}
