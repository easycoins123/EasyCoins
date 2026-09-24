import {
  adjustedPrice, checkActivation, evaluateLadder, evaluatePackage, maximumBenefitMinor, mulDivCeil, mulDivFloor, netOfVat, perUnitMinor,
} from './ladder-economics';
import { PRICING_DEFAULTS, sanitizeLadder } from './pricing-config';

const economicsKnown = {
  ...PRICING_DEFAULTS.economics,
  supplierCostPer1MMinor: 35_000, // ₪350 per million, a made-up figure for the arithmetic
  paymentFeeBps: 250,
};

describe('integer money helpers', () => {
  it('never produces a fraction of an agora', () => {
    expect(mulDivCeil(69_900, 100_000, 1_000_000)).toBe(6_990);
    expect(mulDivCeil(69_900, 100_000, 1_100_000)).toBe(6_355); // 6354.54… rounds up
    expect(mulDivFloor(69_900, 100_000, 1_100_000)).toBe(6_354);
    expect(perUnitMinor(8_500, 100_000, 100_000)).toBe(8_500);
  });

  it('removes VAT by integer division and only when included', () => {
    expect(netOfVat(11_800, 1_800, true)).toBe(10_000);
    expect(netOfVat(11_800, 1_800, false)).toBe(11_800);
    expect(netOfVat(69_900, 1_800, true)).toBe(59_237);
  });

  it('rounds a platform adjustment to whole shekels and never below one shekel', () => {
    expect(adjustedPrice(69_900, 0)).toBe(69_900);
    expect(adjustedPrice(69_900, 500)).toBe(73_400); // 73395 → ₪734
    expect(adjustedPrice(100, -5_000)).toBe(100);
  });
});

describe('package economics', () => {
  it('states cost, fee and contribution in agorot with the delivery loss bought in', () => {
    const pack = PRICING_DEFAULTS.ladder.packages.find((entry) => entry.key === '1m')!;
    const starter = PRICING_DEFAULTS.ladder.packages[0];
    const figures = evaluatePackage(pack, economicsKnown, starter);
    expect(figures.deliveredCoins).toBe(1_000_000);
    expect(figures.coinsToBuy).toBe(1_052_600);
    expect(figures.supplierCostMinor).toBe(36_841);
    expect(figures.paymentFeeMinor).toBe(1_748);
    expect(figures.netRevenueMinor).toBe(59_237);
    expect(figures.contributionMinor).toBe(59_237 - 36_841 - 1_748);
    expect(figures.marginBps).toBe(mulDivFloor(figures.contributionMinor!, 10_000, 59_237));
    expect(figures.per100KMinor).toBe(6_990);
    expect(figures.savingVsStarterBps).toBe(mulDivFloor(8_500 - 6_990, 10_000, 8_500));
  });

  it('reports nothing about margin when the supplier cost is unknown', () => {
    const evaluation = evaluateLadder(PRICING_DEFAULTS.ladder, PRICING_DEFAULTS.economics);
    expect(evaluation.costKnown).toBe(false);
    expect(evaluation.belowFloor).toEqual([]);
    expect(evaluation.packages.every((pack) => pack.marginBps === null)).toBe(true);
  });

  it('shows a strictly better rate at every rung of the default draft', () => {
    const evaluation = evaluateLadder(PRICING_DEFAULTS.ladder, PRICING_DEFAULTS.economics);
    for (let index = 1; index < evaluation.packages.length; index += 1) {
      expect(evaluation.packages[index].per100KMinor).toBeLessThan(evaluation.packages[index - 1].per100KMinor);
    }
  });
});

describe('activation gate', () => {
  it('refuses to activate on an unknown cost without an acknowledgement', () => {
    const check = checkActivation(PRICING_DEFAULTS.ladder, PRICING_DEFAULTS.economics, false);
    expect(check.allowed).toBe(false);
    expect(check.blockers[0]).toContain('supplier cost is unknown');
  });

  it('allows an acknowledged activation and records the warning', () => {
    const check = checkActivation(PRICING_DEFAULTS.ladder, PRICING_DEFAULTS.economics, true);
    expect(check.allowed).toBe(true);
    expect(check.warnings[0]).toContain('without a known supplier cost');
  });

  it('refuses a package under the margin floor and names it', () => {
    const dear = { ...economicsKnown, supplierCostPer1MMinor: 60_000 };
    const check = checkActivation(PRICING_DEFAULTS.ladder, dear, true);
    expect(check.allowed).toBe(false);
    expect(check.blockers[0]).toContain('margin floor');
    expect(check.blockers[0]).toContain('10m');
  });

  it('passes a costed ladder that clears the floor', () => {
    const check = checkActivation(PRICING_DEFAULTS.ladder, economicsKnown, false);
    expect(check.allowed).toBe(true);
    expect(check.warnings).toEqual([]);
  });

  it('checks a negative platform adjustment against the floor too', () => {
    const ladder = sanitizeLadder({ ...PRICING_DEFAULTS.ladder, platformAdjustmentBps: { 'plat-pc': -2_000 } });
    const tight = { ...economicsKnown, minMarginBps: 1_500 };
    const check = checkActivation(ladder, tight, false);
    expect(check.allowed).toBe(false);
    expect(check.blockers[0]).toContain('plat-pc');
  });
});

describe('maximum benefit', () => {
  it('caps the total a customer can take off an order', () => {
    expect(maximumBenefitMinor(69_900, 1_500)).toBe(10_485);
    expect(maximumBenefitMinor(69_900, 0)).toBe(0);
  });
});
