/**
 * Custom coin pricing, as the in-memory backend computes it.
 *
 * A mirror of `backend/src/modules/growth/custom-coins.ts`: an amount is
 * charged at the per-coin rate of the largest bundle at or below it, rounded
 * up to a whole shekel; the bonus follows the same bundle's rate, rounded down
 * to a thousand coins; a budget buys the most coins on the step grid whose
 * price fits. The mock is the server in mock mode; no component computes a
 * price from this.
 */
export interface MockLadderRung {
  readonly amount: number;
  readonly priceMinor: number;
  readonly bonus: number;
}

export interface MockCustomRules {
  readonly minCoins: number;
  readonly maxCoins: number;
  readonly stepCoins: number;
}

export interface MockCustomQuote {
  readonly amount: number;
  readonly priceMinor: number;
  readonly bonus: number;
  readonly totalCoins: number;
  readonly perMillionMinor: number;
  readonly rungAmount: number;
}

export type MockCustomErrorCode = 'AMOUNT_TOO_SMALL' | 'AMOUNT_TOO_LARGE' | 'BUDGET_TOO_SMALL' | 'NO_LADDER';

export class MockCustomCoinsError extends Error {
  constructor(readonly code: MockCustomErrorCode, message: string) {
    super(message);
    this.name = 'MockCustomCoinsError';
  }
}

const ceilToShekel = (minor: number): number => Math.ceil(minor / 100) * 100;
const snap = (amount: number, rules: MockCustomRules): number => Math.floor(amount / rules.stepCoins) * rules.stepCoins;

function sorted(rungs: readonly MockLadderRung[]): MockLadderRung[] {
  return [...rungs].filter((rung) => rung.amount > 0 && rung.priceMinor > 0).sort((a, b) => a.amount - b.amount);
}

function rungFor(rungs: readonly MockLadderRung[], amount: number): MockLadderRung {
  let chosen = rungs[0];
  for (const rung of rungs) {
    if (rung.amount <= amount) {
      chosen = rung;
    }
  }
  return chosen;
}

const priceAt = (rung: MockLadderRung, amount: number): number =>
  amount === rung.amount ? rung.priceMinor : ceilToShekel((amount * rung.priceMinor) / rung.amount);

const bonusAt = (rung: MockLadderRung, amount: number): number =>
  rung.bonus <= 0 ? 0 : amount === rung.amount ? rung.bonus : Math.floor((amount * rung.bonus) / rung.amount / 1_000) * 1_000;

function build(rung: MockLadderRung, amount: number): MockCustomQuote {
  const priceMinor = priceAt(rung, amount);
  const bonus = bonusAt(rung, amount);
  const totalCoins = amount + bonus;
  return { amount, priceMinor, bonus, totalCoins, perMillionMinor: Math.round((priceMinor / totalCoins) * 1_000_000), rungAmount: rung.amount };
}

export function mockQuoteByAmount(ladder: readonly MockLadderRung[], rules: MockCustomRules, requested: number): MockCustomQuote {
  const rungs = sorted(ladder);
  if (rungs.length === 0) {
    throw new MockCustomCoinsError('NO_LADDER', 'no priced bundle');
  }
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new MockCustomCoinsError('AMOUNT_TOO_SMALL', 'amount must be positive');
  }
  const amount = snap(Math.floor(requested), rules);
  if (amount < rules.minCoins) {
    throw new MockCustomCoinsError('AMOUNT_TOO_SMALL', `amount must be at least ${rules.minCoins}`);
  }
  if (amount > rules.maxCoins) {
    throw new MockCustomCoinsError('AMOUNT_TOO_LARGE', `amount may not exceed ${rules.maxCoins}`);
  }
  return build(rungFor(rungs, amount), amount);
}

export function mockQuoteByBudget(ladder: readonly MockLadderRung[], rules: MockCustomRules, budgetMinor: number): MockCustomQuote {
  const rungs = sorted(ladder);
  if (rungs.length === 0) {
    throw new MockCustomCoinsError('NO_LADDER', 'no priced bundle');
  }
  if (!Number.isFinite(budgetMinor) || budgetMinor <= 0) {
    throw new MockCustomCoinsError('BUDGET_TOO_SMALL', 'budget must be positive');
  }
  let best: MockCustomQuote | undefined;
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
    throw new MockCustomCoinsError('BUDGET_TOO_SMALL', 'budget below the smallest custom amount');
  }
  return best;
}
