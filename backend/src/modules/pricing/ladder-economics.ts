import { EconomicsConfig, LadderConfig, LadderPackage } from './pricing-config';

/**
 * The arithmetic behind a price decision, in integers.
 *
 * Everything here is agorot or basis points, and every division rounds in
 * the direction that makes the shop look worse, never better: costs round
 * up, contribution rounds down. A ladder that passes this evaluation passes
 * it with a little room to spare, which is the room a real supplier invoice
 * will use.
 */

export interface PackageEconomics {
  readonly key: string;
  readonly coins: number;
  readonly bonusCoins: number;
  readonly deliveredCoins: number;
  readonly priceMinor: number;
  /** Price per 100K coins delivered, agorot. */
  readonly per100KMinor: number;
  /** Price per 1M coins delivered, agorot. */
  readonly per1MMinor: number;
  /** Revenue net of VAT, agorot, when prices include VAT. */
  readonly netRevenueMinor: number;
  /** Coins that must be bought to deliver the package, delivery loss included. */
  readonly coinsToBuy: number;
  /** Null when the supplier cost is unknown. */
  readonly supplierCostMinor: number | null;
  readonly paymentFeeMinor: number;
  readonly contributionMinor: number | null;
  /** Contribution as basis points of net revenue; null when unknown. */
  readonly marginBps: number | null;
  /** Saving against the smallest active package's rate, bps; zero for the smallest. */
  readonly savingVsStarterBps: number;
}

export interface LadderEvaluation {
  readonly costKnown: boolean;
  readonly packages: readonly PackageEconomics[];
  /** Packages whose margin falls under the configured floor. Empty when cost is unknown. */
  readonly belowFloor: readonly string[];
}

export interface ActivationCheck {
  readonly allowed: boolean;
  /** Reasons the activation is refused, in the operator's words. */
  readonly blockers: readonly string[];
  /** Facts the operator is accepting, when allowed with an acknowledgement. */
  readonly warnings: readonly string[];
}

/** Integer ceiling of a * b / c, without floats. */
export function mulDivCeil(a: number, b: number, c: number): number {
  const product = a * b;
  return Math.floor(product / c) + (product % c === 0 ? 0 : 1);
}

/** Integer floor of a * b / c. */
export function mulDivFloor(a: number, b: number, c: number): number {
  return Math.floor((a * b) / c);
}

/** Price per unit of coins delivered, rounded up to the agora. */
export function perUnitMinor(priceMinor: number, deliveredCoins: number, unit: number): number {
  return mulDivCeil(priceMinor, unit, deliveredCoins);
}

/** Net revenue when the price includes VAT: price / (1 + vat), rounded down. */
export function netOfVat(priceMinor: number, vatBps: number, vatIncluded: boolean): number {
  return vatIncluded ? mulDivFloor(priceMinor, 10_000, 10_000 + vatBps) : priceMinor;
}

/** The supplier cost that applies to a platform, or null when unknown. */
export function supplierCostFor(economics: EconomicsConfig, platformId?: string): number | null {
  if (platformId && economics.supplierCostByPlatform[platformId] !== undefined) {
    return economics.supplierCostByPlatform[platformId];
  }
  return economics.supplierCostPer1MMinor;
}

export function evaluatePackage(
  pack: LadderPackage,
  economics: EconomicsConfig,
  starter: LadderPackage | undefined,
  platformId?: string,
): PackageEconomics {
  const deliveredCoins = pack.coins + pack.bonusCoins;
  const netRevenueMinor = netOfVat(pack.priceMinor, economics.vatBps, economics.vatIncluded);
  const coinsToBuy = mulDivCeil(deliveredCoins, 10_000 + economics.deliveryLossBps, 10_000);
  const costPer1M = supplierCostFor(economics, platformId);
  const supplierCostMinor = costPer1M === null ? null : mulDivCeil(coinsToBuy, costPer1M, 1_000_000);
  const paymentFeeMinor = mulDivCeil(pack.priceMinor, economics.paymentFeeBps, 10_000);
  const contributionMinor = supplierCostMinor === null ? null : netRevenueMinor - supplierCostMinor - paymentFeeMinor;
  const marginBps = contributionMinor === null || netRevenueMinor <= 0 ? null : mulDivFloor(contributionMinor, 10_000, netRevenueMinor);

  const per100KMinor = perUnitMinor(pack.priceMinor, deliveredCoins, 100_000);
  const starterRate = starter ? perUnitMinor(starter.priceMinor, starter.coins + starter.bonusCoins, 100_000) : per100KMinor;
  const savingVsStarterBps = starterRate > per100KMinor ? mulDivFloor(starterRate - per100KMinor, 10_000, starterRate) : 0;

  return {
    key: pack.key,
    coins: pack.coins,
    bonusCoins: pack.bonusCoins,
    deliveredCoins,
    priceMinor: pack.priceMinor,
    per100KMinor,
    per1MMinor: perUnitMinor(pack.priceMinor, deliveredCoins, 1_000_000),
    netRevenueMinor,
    coinsToBuy,
    supplierCostMinor,
    paymentFeeMinor,
    contributionMinor,
    marginBps,
    savingVsStarterBps,
  };
}

export function evaluateLadder(ladder: LadderConfig, economics: EconomicsConfig, platformId?: string): LadderEvaluation {
  const active = [...ladder.packages].filter((pack) => pack.active).sort((a, b) => a.coins - b.coins);
  const starter = active[0];
  const packages = active.map((pack) => evaluatePackage(pack, economics, starter, platformId));
  const costKnown = supplierCostFor(economics, platformId) !== null;
  const belowFloor = costKnown
    ? packages.filter((pack) => pack.marginBps !== null && pack.marginBps < economics.minMarginBps).map((pack) => pack.key)
    : [];
  return { costKnown, packages, belowFloor };
}

/**
 * Whether the ladder may go live.
 *
 * Two independent gates. With a known cost, every active package must clear
 * the margin floor; there is no acknowledgement that overrides a package
 * selling under its floor. With an unknown cost there is nothing to check,
 * and the operator must say in as many words that they are activating prices
 * without a cost basis; that sentence is recorded in the audit log.
 */
export function checkActivation(
  ladder: LadderConfig,
  economics: EconomicsConfig,
  acknowledgeUnknownCost: boolean,
): ActivationCheck {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const active = ladder.packages.filter((pack) => pack.active);
  if (active.length === 0) {
    blockers.push('the ladder has no active package');
  }
  const evaluation = evaluateLadder(ladder, economics);
  if (!evaluation.costKnown) {
    if (!acknowledgeUnknownCost) {
      blockers.push('supplier cost is unknown; enter it under economics, or activate with an explicit acknowledgement');
    } else {
      warnings.push('activated without a known supplier cost; no margin floor was checked');
    }
  } else if (evaluation.belowFloor.length > 0) {
    blockers.push(`below the ${economics.minMarginBps / 100}% margin floor: ${evaluation.belowFloor.join(', ')}`);
  }
  for (const [platformId, bps] of Object.entries(ladder.platformAdjustmentBps)) {
    if (bps < 0) {
      // A negative adjustment lowers the price on that platform below the
      // evaluated ladder; check it too.
      const adjusted = evaluateLadder(
        { ...ladder, packages: ladder.packages.map((pack) => ({ ...pack, priceMinor: adjustedPrice(pack.priceMinor, bps) })) },
        economics,
        platformId,
      );
      if (adjusted.costKnown && adjusted.belowFloor.length > 0) {
        blockers.push(`${platformId} adjustment puts ${adjusted.belowFloor.join(', ')} below the margin floor`);
      }
    }
  }
  return { allowed: blockers.length === 0, blockers, warnings };
}

/** A platform-adjusted price, rounded to the shekel so shelves stay round. */
export function adjustedPrice(priceMinor: number, adjustmentBps: number): number {
  if (adjustmentBps === 0) {
    return priceMinor;
  }
  const raw = mulDivCeil(priceMinor, 10_000 + adjustmentBps, 10_000);
  return Math.max(100, Math.round(raw / 100) * 100);
}

/**
 * The most a customer can take off one order under the policy: one
 * percentage benefit plus one wallet reward, capped by the ladder's maximum
 * discount. Used by the admin evaluation table and by tests; the live
 * enforcement is the benefit policy plus the clamp in the pricing service.
 */
export function maximumBenefitMinor(subtotalMinor: number, maxDiscountBps: number): number {
  return mulDivFloor(subtotalMinor, maxDiscountBps, 10_000);
}
