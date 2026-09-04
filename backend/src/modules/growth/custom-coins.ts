/**
 * Custom coin amounts, priced from the ladder the shop already sells.
 *
 * A customer who wants 1,370,000 coins is not asking for a bundle we have, and
 * the storefront is never allowed to invent a price. So the price of any
 * amount is derived here, on the server, from one rule that keeps the ladder
 * honest:
 *
 *   an amount is charged at the per-coin rate of the largest bundle at or
 *   below it, rounded up to a whole shekel.
 *
 * Consequences, all intended:
 *
 * - At exactly a bundle size the custom price equals the bundle price.
 * - Between two bundles the price per coin is the lower bundle's, which is
 *   never below the next bundle's. Buying 1.37M costs more per coin than 1.5M
 *   would, so the ladder's own steps remain the best value at their sizes and
 *   a custom amount can never undercut a bigger bundle.
 * - The launch bonus follows the same bundle's bonus rate, rounded down to a
 *   thousand coins, so a custom amount during the bonus period gets the bonus
 *   the ladder would have given it.
 *
 * Budget mode inverts the same function: the largest amount, on the step
 * grid, whose price fits the budget. No second pricing rule exists.
 */

export interface LadderRung {
  /** Coins in the bundle. */
  readonly amount: number;
  /** Bundle price in minor units. */
  readonly priceMinor: number;
  /** Launch bonus coins on the bundle, zero when the campaign is off. */
  readonly bonus: number;
}

export interface CustomCoinsRules {
  readonly minCoins: number;
  readonly maxCoins: number;
  readonly stepCoins: number;
}

export interface CustomCoinsQuote {
  /** The amount actually quoted, snapped onto the step grid. */
  readonly amount: number;
  readonly priceMinor: number;
  readonly bonus: number;
  /** Amount plus bonus: what the customer receives. */
  readonly totalCoins: number;
  /** Price per million coins received, in minor units. */
  readonly perMillionMinor: number;
  /** The bundle whose rate priced this amount. */
  readonly rungAmount: number;
}

export class CustomCoinsError extends Error {
  constructor(readonly code: 'AMOUNT_TOO_SMALL' | 'AMOUNT_TOO_LARGE' | 'BUDGET_TOO_SMALL' | 'NO_LADDER', message: string) {
    super(message);
    this.name = 'CustomCoinsError';
  }
}

/** Rounds minor units up to the next whole shekel (100 minor units). */
function ceilToShekel(minor: number): number {
  return Math.ceil(minor / 100) * 100;
}

function snap(amount: number, rules: CustomCoinsRules): number {
  return Math.floor(amount / rules.stepCoins) * rules.stepCoins;
}

function sortedRungs(rungs: readonly LadderRung[]): LadderRung[] {
  return [...rungs]
    .filter((rung) => rung.amount > 0 && rung.priceMinor > 0)
    .sort((a, b) => a.amount - b.amount);
}

/** The bundle whose rate applies: the largest at or below the amount, else the smallest. */
function rungFor(rungs: readonly LadderRung[], amount: number): LadderRung {
  let chosen = rungs[0];
  for (const rung of rungs) {
    if (rung.amount <= amount) {
      chosen = rung;
    }
  }
  return chosen;
}

function priceAt(rung: LadderRung, amount: number): number {
  if (amount === rung.amount) {
    return rung.priceMinor;
  }
  return ceilToShekel((amount * rung.priceMinor) / rung.amount);
}

function bonusAt(rung: LadderRung, amount: number): number {
  if (rung.bonus <= 0) {
    return 0;
  }
  if (amount === rung.amount) {
    return rung.bonus;
  }
  return Math.floor((amount * rung.bonus) / rung.amount / 1_000) * 1_000;
}

function build(rung: LadderRung, amount: number): CustomCoinsQuote {
  const priceMinor = priceAt(rung, amount);
  const bonus = bonusAt(rung, amount);
  const totalCoins = amount + bonus;
  return {
    amount,
    priceMinor,
    bonus,
    totalCoins,
    perMillionMinor: Math.round((priceMinor / totalCoins) * 1_000_000),
    rungAmount: rung.amount,
  };
}

/**
 * Prices an exact amount.
 *
 * The amount is snapped down onto the step grid and must fall inside the
 * configured range; anything else is an error the caller turns into a
 * validation response, never a silently different quote.
 */
export function quoteByAmount(
  ladder: readonly LadderRung[],
  rules: CustomCoinsRules,
  requested: number,
): CustomCoinsQuote {
  const rungs = sortedRungs(ladder);
  if (rungs.length === 0) {
    throw new CustomCoinsError('NO_LADDER', 'no priced bundle to derive a rate from');
  }
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new CustomCoinsError('AMOUNT_TOO_SMALL', 'amount must be a positive number of coins');
  }
  const amount = snap(Math.floor(requested), rules);
  if (amount < rules.minCoins) {
    throw new CustomCoinsError('AMOUNT_TOO_SMALL', `amount must be at least ${rules.minCoins}`);
  }
  if (amount > rules.maxCoins) {
    throw new CustomCoinsError('AMOUNT_TOO_LARGE', `amount may not exceed ${rules.maxCoins}`);
  }
  return build(rungFor(rungs, amount), amount);
}

/**
 * The most coins a budget buys.
 *
 * Within each rung's range the price is linear in the amount, so the largest
 * candidate is computed directly and then walked down the grid until the
 * shekel rounding fits. The best candidate across rungs wins; ties cannot
 * happen because ranges do not overlap.
 */
export function quoteByBudget(
  ladder: readonly LadderRung[],
  rules: CustomCoinsRules,
  budgetMinor: number,
): CustomCoinsQuote {
  const rungs = sortedRungs(ladder);
  if (rungs.length === 0) {
    throw new CustomCoinsError('NO_LADDER', 'no priced bundle to derive a rate from');
  }
  if (!Number.isFinite(budgetMinor) || budgetMinor <= 0) {
    throw new CustomCoinsError('BUDGET_TOO_SMALL', 'budget must be a positive amount');
  }

  let best: CustomCoinsQuote | undefined;

  for (let index = 0; index < rungs.length; index += 1) {
    const rung = rungs[index];
    const next = rungs[index + 1];
    const rangeStart = Math.max(rung.amount, rules.minCoins);
    const rangeEnd = Math.min(next ? next.amount - rules.stepCoins : rules.maxCoins, rules.maxCoins);
    if (rangeEnd < rangeStart) {
      continue;
    }

    let candidate = Math.min(rangeEnd, snap(Math.floor((budgetMinor * rung.amount) / rung.priceMinor), rules));
    while (candidate >= rangeStart && priceAt(rung, candidate) > budgetMinor) {
      candidate -= rules.stepCoins;
    }
    if (candidate >= rangeStart && (!best || candidate > best.amount)) {
      best = build(rung, candidate);
    }
  }

  if (!best) {
    const smallest = quoteByAmount(rungs, rules, rules.minCoins);
    throw new CustomCoinsError(
      'BUDGET_TOO_SMALL',
      `the smallest custom amount, ${rules.minCoins} coins, costs ${smallest.priceMinor} minor units`,
    );
  }
  return best;
}
