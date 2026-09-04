import type {
  Game,
  Inventory,
  Offer,
  Platform,
  Product,
  ProductVariant,
  Region,
} from '@prisma/client';

import { sanitizeRequirements } from '../../../common/checkout/requirement-keys';

/**
 * Prisma rows to wire DTOs.
 *
 * The field names here are the frontend's, not the database's, and the two do
 * not always agree: the column is `compareAtMinor`, the contract calls it
 * `price.compareAt`. This file is the only place that knows both, which is what
 * lets either side be renamed without touching the other.
 *
 * Everything the frontend derives for itself is deliberately absent. Discount
 * percentages, "from" prices and rating aggregates are computed by the mappers
 * in `src/app/data/http/mappers`, so sending them would create a second source
 * of truth that could disagree.
 */

type Json = unknown;

/** Localised text is stored as JSON; anything malformed becomes a safe blank. */
function localized(value: Json): { he: string; en?: string | null } {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record['he'] === 'string') {
      return {
        he: record['he'],
        en: typeof record['en'] === 'string' ? record['en'] : null,
      };
    }
  }
  return { he: '' };
}

function optionalLocalized(value: Json): { he: string; en?: string | null } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const text = localized(value);
  return text.he ? text : null;
}

function money(amountMinor: number, currency: string) {
  return { amountMinor, currency };
}

export function toGameDto(game: Game & { platformIds?: string[] }) {
  return {
    id: game.id,
    slug: game.slug,
    name: localized(game.name),
    publisher: game.publisher,
    shortDescription: localized(game.shortDescription),
    // Derived from the game's offers rather than stored, so it cannot drift out
    // of step with what is actually for sale.
    platformIds: game.platformIds ?? [],
    coverUrl: game.coverUrl,
    heroUrl: game.heroUrl,
    accentColor: game.accentColor,
    active: game.active,
    featured: game.featured,
    sortOrder: game.sortOrder,
  };
}

export function toPlatformDto(platform: Platform) {
  return {
    id: platform.id,
    kind: platform.kind,
    family: platform.family,
    name: localized(platform.name),
    shortName: localized(platform.shortName),
    sortOrder: platform.sortOrder,
  };
}

export function toRegionDto(region: Region) {
  return {
    id: region.id,
    code: region.code,
    name: localized(region.name),
    currency: region.currency,
    flagEmoji: region.flagEmoji,
    isRegionFree: region.isRegionFree,
    restrictionNotice: optionalLocalized(region.restrictionNotice),
    market: region.market,
  };
}

export function toVariantDto(variant: ProductVariant) {
  return {
    id: variant.id,
    productId: variant.productId,
    name: localized(variant.name),
    sku: variant.sku,
    quantityValue: variant.quantityValue,
    quantityUnit: optionalLocalized(variant.quantityUnit),
    metadata: (variant.metadata ?? {}) as Record<string, string | number | boolean>,
    sortOrder: variant.sortOrder,
    active: variant.active,
  };
}

/**
 * Inventory as the customer is allowed to see it.
 *
 * `remaining` is sent only when the offer is genuinely running low. Publishing
 * an exact count for a well-stocked item tells a competitor our volumes and
 * tempts the UI into "only 3 left" copy that would be theatre rather than fact.
 */
const LOW_STOCK_THRESHOLD = 10;

export function toInventoryDto(inventory: Inventory | null, maxPerOrder: number) {
  if (!inventory) {
    // No inventory row means nothing is known about stock, which is not the same
    // as "in stock". Fail toward not selling.
    return { status: 'OUT_OF_STOCK', remaining: null, maxPerOrder };
  }

  const available = inventory.quantityAvailable;
  const sellable = available === null ? null : available - inventory.quantityReserved;

  return {
    status: inventory.status,
    remaining: sellable !== null && sellable <= LOW_STOCK_THRESHOLD ? Math.max(0, sellable) : null,
    maxPerOrder,
  };
}

export type OfferWithRelations = Offer & { inventory: Inventory | null };

export function toOfferDto(offer: OfferWithRelations) {
  return {
    id: offer.id,
    productId: offer.productId,
    variantId: offer.variantId,
    platformId: offer.platformId,
    regionId: offer.regionId,
    price: {
      current: money(offer.priceAmountMinor, offer.priceCurrency),
      compareAt:
        offer.compareAtMinor !== null
          ? money(offer.compareAtMinor, offer.priceCurrency)
          : null,
    },
    inventory: toInventoryDto(offer.inventory, offer.maxPerOrder),
    fulfillmentMethod: offer.fulfillmentMethod,
    // Filtered through the allowlist on the way out, so a bad row cannot put an
    // unexpected field in front of a customer.
    checkoutRequirements: sanitizeRequirements(offer.checkoutRequirements),
    terms: optionalLocalized(offer.terms),
    active: offer.active,
  };
}

export type ProductWithRelations = Product & {
  variants: ProductVariant[];
  offers: OfferWithRelations[];
};

/**
 * A variant minted for one customer's custom coin amount. Real and
 * purchasable, but not a bundle on the shelf: the catalog listing hides it so
 * the ladder stays the ladder. The offer is still served by id.
 */
export function isCustomVariant(metadata: unknown): boolean {
  return typeof metadata === 'object' && metadata !== null && (metadata as Record<string, unknown>)['custom'] === true;
}

/**
 * Platform, region and fulfillment lists are derived from the product's live
 * offers. Storing them separately was removed in Phase B precisely because the
 * copy could claim a platform no offer actually served.
 */
export function toProductDto(product: ProductWithRelations) {
  const customVariantIds = new Set(product.variants.filter((variant) => isCustomVariant(variant.metadata)).map((variant) => variant.id));
  const sellable = product.offers.filter((offer) => offer.active && !customVariantIds.has(offer.variantId));

  const cheapest = sellable.reduce<OfferWithRelations | null>(
    (best, offer) =>
      best === null || offer.priceAmountMinor < best.priceAmountMinor ? offer : best,
    null,
  );

  return {
    id: product.id,
    gameId: product.gameId,
    slug: product.slug,
    type: product.type,
    name: localized(product.name),
    shortDescription: localized(product.shortDescription),
    description: localized(product.description),
    platformIds: [...new Set(sellable.map((offer) => offer.platformId))],
    regionIds: [...new Set(sellable.map((offer) => offer.regionId))],
    images: Array.isArray(product.images) ? product.images : [],
    metadata: (product.metadata ?? {}) as Record<string, string | number | boolean>,
    variants: product.variants.filter((variant) => variant.active && !customVariantIds.has(variant.id)).map(toVariantDto),
    fulfillmentMethods: [...new Set(sellable.map((offer) => offer.fulfillmentMethod))],
    tags: product.tags,
    fromPrice: cheapest
      ? {
          current: money(cheapest.priceAmountMinor, cheapest.priceCurrency),
          compareAt:
            cheapest.compareAtMinor !== null
              ? money(cheapest.compareAtMinor, cheapest.priceCurrency)
              : null,
        }
      : null,
    active: product.active,
    featured: product.featured,
  };
}

export function toProductDetailDto(product: ProductWithRelations) {
  const customVariantIds = new Set(product.variants.filter((variant) => isCustomVariant(variant.metadata)).map((variant) => variant.id));
  return {
    product: toProductDto(product),
    offers: product.offers.filter((offer) => offer.active && !customVariantIds.has(offer.variantId)).map(toOfferDto),
  };
}
