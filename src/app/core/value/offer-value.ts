import { Money, Offer, Price, ProductVariant } from '../../domain';

/**
 * The value engine.
 *
 * EASYCOINS competes on price, so the interface has to make the price advantage
 * legible in about a second. That means answering a question a raw price tag
 * cannot: *is this bundle actually good value compared with the others on the
 * page?*
 *
 * Everything here is derived arithmetic over prices the server sent. Nothing is
 * invented, nothing is stored, and nothing here decides what anything costs:
 * the backend remains the only authority on price. These are presentation
 * facts, computed the same way every time so two screens cannot disagree.
 *
 * What is deliberately absent: any notion of "most popular", "bestseller" or
 * "trending". We have no purchase-volume data on the client, and a badge like
 * that with nothing behind it is a fabricated trust signal. When the backend
 * exposes real sales data, it goes here.
 */

/** Coin bundles are compared per million; it is how players talk about them. */
export const COINS_PER_UNIT = 1_000_000;

export interface OfferValue {
  readonly offer: Offer;
  readonly variant: ProductVariant;
  /**
   * Price for one million units, in minor units. Undefined when the variant
   * carries no quantity, which is the case for a gift card or a subscription
   * where "per million" is meaningless.
   */
  readonly perUnitMinor?: number;
  /** True for the cheapest per-unit offer in the set being compared. */
  readonly isBestValue: boolean;
  /**
   * How much cheaper per unit this is than the worst per-unit offer in the set,
   * as a whole percentage. Zero when it is the worst, or when nothing can be
   * compared.
   */
  readonly savingsPercent: number;
  /** True when the offer carries a genuine strike-through price. */
  readonly hasDiscount: boolean;
}

/** Price per million units, or undefined when the variant has no quantity. */
export function perUnitPrice(offer: Offer, variant: ProductVariant): number | undefined {
  const quantity = variant.quantityValue;
  if (!quantity || quantity <= 0) {
    return undefined;
  }
  return Math.round(offer.price.current.amountMinor / (quantity / COINS_PER_UNIT));
}

/**
 * Ranks a set of offers by value.
 *
 * The comparison is only meaningful within one product and one currency, so the
 * caller passes the offers for a single product. Offers whose variant has no
 * quantity are still returned, simply without a per-unit figure: a gift card
 * belongs in the list even though it cannot be ranked.
 */
export function rankByValue(
  offers: readonly Offer[],
  variants: readonly ProductVariant[],
): OfferValue[] {
  const byId = new Map(variants.map((variant) => [variant.id, variant]));

  const rows = offers
    .map((offer) => {
      const variant = byId.get(offer.variantId);
      return variant ? { offer, variant, perUnitMinor: perUnitPrice(offer, variant) } : null;
    })
    .filter((row): row is { offer: Offer; variant: ProductVariant; perUnitMinor: number | undefined } => row !== null);

  const comparable = rows
    .map((row) => row.perUnitMinor)
    .filter((value): value is number => value !== undefined);

  const cheapest = comparable.length > 0 ? Math.min(...comparable) : undefined;
  const dearest = comparable.length > 0 ? Math.max(...comparable) : undefined;

  return rows.map((row) => ({
    offer: row.offer,
    variant: row.variant,
    perUnitMinor: row.perUnitMinor,
    // Only a badge when there is something to be better than. One bundle on its
    // own is not "best value", it is the only value.
    isBestValue:
      row.perUnitMinor !== undefined &&
      cheapest !== undefined &&
      dearest !== undefined &&
      dearest > cheapest &&
      row.perUnitMinor === cheapest,
    savingsPercent:
      row.perUnitMinor !== undefined && dearest !== undefined && dearest > 0
        ? Math.max(0, Math.round(((dearest - row.perUnitMinor) / dearest) * 100))
        : 0,
    hasDiscount: hasRealDiscount(row.offer.price),
  }));
}

/**
 * A strike-through price counts only when it is genuinely higher than what is
 * being charged. A "was" price equal to or below the current one is not a
 * saving, and showing it as one would be a fabricated discount.
 */
export function hasRealDiscount(price: Price): boolean {
  return (
    price.compareAt !== undefined &&
    price.compareAt.amountMinor > price.current.amountMinor
  );
}

/** What the customer keeps, as money, when a real strike-through exists. */
export function savedAmount(price: Price): Money | undefined {
  if (!hasRealDiscount(price) || !price.compareAt) {
    return undefined;
  }
  return {
    amountMinor: price.compareAt.amountMinor - price.current.amountMinor,
    currency: price.current.currency,
  };
}

/**
 * Formats a large quantity the way a player says it: 2M, 500K, 1,200.
 *
 * Not `Intl.NumberFormat` with `notation: 'compact'`, which renders Hebrew
 * locale compact forms that do not match how these bundles are named.
 */
/** Up to two decimals, trailing zeros dropped: 1.5, 1.25, 0.75. */
function trimDecimals(value: number): string {
  return value.toFixed(2).replace(/0$/, '');
}

export function formatQuantity(value: number | undefined): string {
  if (!value || value <= 0) {
    return '';
  }
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : trimDecimals(millions)}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${Number.isInteger(thousands) ? thousands : trimDecimals(thousands)}K`;
  }
  return value.toLocaleString('he-IL');
}
