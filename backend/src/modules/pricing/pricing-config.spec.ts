import {
  PRICING_DEFAULTS, PricingConfigError, sanitizeCompetitors, sanitizeEconomics, sanitizeLadder, sanitizeLaunch,
} from './pricing-config';

describe('pricing configuration validation', () => {
  it('accepts its own defaults unchanged', () => {
    expect(sanitizeLadder(PRICING_DEFAULTS.ladder)).toEqual(PRICING_DEFAULTS.ladder);
    expect(sanitizeEconomics(PRICING_DEFAULTS.economics)).toEqual(PRICING_DEFAULTS.economics);
    expect(sanitizeLaunch(PRICING_DEFAULTS.launch)).toEqual(PRICING_DEFAULTS.launch);
    expect(sanitizeCompetitors(PRICING_DEFAULTS.competitors)).toEqual(PRICING_DEFAULTS.competitors);
  });

  it('refuses a negative, zero or fractional price', () => {
    const withPrice = (priceMinor: unknown) => ({
      ...PRICING_DEFAULTS.ladder,
      packages: [{ ...PRICING_DEFAULTS.ladder.packages[0], priceMinor }],
    });
    expect(() => sanitizeLadder(withPrice(-100))).toThrow(PricingConfigError);
    expect(() => sanitizeLadder(withPrice(0))).toThrow(PricingConfigError);
    expect(() => sanitizeLadder(withPrice(85.5))).toThrow(PricingConfigError);
  });

  it('refuses a bonus larger than the package itself', () => {
    const ladder = { ...PRICING_DEFAULTS.ladder, packages: [{ ...PRICING_DEFAULTS.ladder.packages[0], bonusCoins: 200_000 }] };
    expect(() => sanitizeLadder(ladder)).toThrow(/bonusCoins/);
  });

  it('refuses a ladder where a bigger package is dearer per coin', () => {
    const ladder = {
      ...PRICING_DEFAULTS.ladder,
      packages: [
        { ...PRICING_DEFAULTS.ladder.packages[0] },
        { ...PRICING_DEFAULTS.ladder.packages[1], priceMinor: 22_000 }, // 250K at ₪220 = 8.8/100K > starter 8.5
      ],
    };
    expect(() => sanitizeLadder(ladder)).toThrow(/dearer per coin/);
  });

  it('refuses two recommendations, duplicate keys and duplicate amounts', () => {
    const base = PRICING_DEFAULTS.ladder.packages;
    expect(() => sanitizeLadder({ ...PRICING_DEFAULTS.ladder, packages: [{ ...base[0], recommended: true }, { ...base[1], recommended: true }] })).toThrow(/recommended/);
    expect(() => sanitizeLadder({ ...PRICING_DEFAULTS.ladder, packages: [base[0], { ...base[1], key: base[0].key }] })).toThrow(/duplicate key/);
    expect(() => sanitizeLadder({ ...PRICING_DEFAULTS.ladder, packages: [base[0], { ...base[1], coins: base[0].coins }] })).toThrow(/duplicate amount/);
  });

  it('caps the maximum discount at 50% and the platform adjustment at ±50%', () => {
    expect(() => sanitizeLadder({ ...PRICING_DEFAULTS.ladder, maxDiscountBps: 10_000 })).toThrow(/maxDiscountBps/);
    expect(() => sanitizeLadder({ ...PRICING_DEFAULTS.ladder, platformAdjustmentBps: { 'plat-pc': -9_000 } })).toThrow(/platformAdjustmentBps/);
  });

  it('keeps the supplier cost unknown until a positive integer is entered', () => {
    expect(sanitizeEconomics({ ...PRICING_DEFAULTS.economics, supplierCostPer1MMinor: null }).supplierCostPer1MMinor).toBeNull();
    expect(() => sanitizeEconomics({ ...PRICING_DEFAULTS.economics, supplierCostPer1MMinor: 0 })).toThrow(PricingConfigError);
    expect(() => sanitizeEconomics({ ...PRICING_DEFAULTS.economics, supplierCostPer1MMinor: 12.5 })).toThrow(PricingConfigError);
    expect(sanitizeEconomics({ ...PRICING_DEFAULTS.economics, supplierCostPer1MMinor: 50_000 }).supplierCostPer1MMinor).toBe(50_000);
  });

  it('refuses a launch offer that ends before it starts or gives more than 30%', () => {
    expect(() => sanitizeLaunch({ ...PRICING_DEFAULTS.launch, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-09-01T00:00:00Z' })).toThrow(/endsAt/);
    expect(() => sanitizeLaunch({ ...PRICING_DEFAULTS.launch, benefit: { ...PRICING_DEFAULTS.launch.benefit, percentBps: 5_000 } })).toThrow(/percentBps/);
    expect(() => sanitizeLaunch({ ...PRICING_DEFAULTS.launch, eligibility: 'everyone' })).toThrow(/eligibility/);
  });

  it('requires a real URL and a timestamp on every competitor entry', () => {
    const entry = PRICING_DEFAULTS.competitors.entries[0];
    expect(() => sanitizeCompetitors({ checkedAt: null, entries: [entry] })).toThrow(/checkedAt/);
    expect(() => sanitizeCompetitors({ checkedAt: '2026-09-23T00:00:00Z', entries: [{ ...entry, url: 'futgoat.com' }] })).toThrow(/url/);
  });
});
