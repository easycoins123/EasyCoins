import type { CheckoutSession } from '@prisma/client';

import { NO_BENEFITS, type CartBenefits } from '../../cart/pricing.service';
import { toBenefitsDto } from '../../cart/dto/cart.mapper';
import type { CheckoutItemWithOffer, CheckoutSessionWithItems } from '../checkout.service';

/**
 * A checkout session on the wire.
 *
 * The cart inside it is rebuilt from `checkout_items`, which hold the prices the
 * session froze. Re-pricing here would defeat the snapshot: the customer must be
 * shown the figures they are about to approve, not new ones.
 */

function localized(value: unknown): { he: string; en?: string | null } {
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

/** Launch bonus coins on a variant, per unit. Zero when the campaign is off. */
function launchBonusOf(metadata: unknown): number {
  const bonus = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['launchBonus'] : undefined;
  return typeof bonus === 'number' && bonus > 0 ? Math.round(bonus) : 0;
}

function toItemDto(item: CheckoutItemWithOffer, currency: string) {
  const isCoins = item.offer.product.type === 'GAME_CURRENCY';
  return {
    id: item.id,
    offerId: item.offerId,
    // Read from the offer the line points at, so the UI can link back to the
    // product without a second lookup and without either id being invented.
    productId: item.offer.productId,
    variantId: item.offer.variantId,
    platformId: item.platformId,
    regionId: item.regionId,
    quantity: item.quantity,
    unitPrice: { amountMinor: item.unitPriceMinor, currency },
    totalPrice: { amountMinor: item.totalPriceMinor, currency },
    fulfillmentMethod: item.fulfillmentMethod,
    displayName: localized(item.displayName),
    displayVariantName: localized(item.displayVariant),
    imageUrl: item.imageUrl,
    coins: isCoins ? (item.offer.variant.quantityValue ?? 0) * item.quantity : 0,
    bonusCoins: isCoins ? launchBonusOf(item.offer.variant.metadata) * item.quantity : 0,
  };
}

/**
 * Which step the customer is on, derived from the session's own status.
 *
 * The client renders this; it never decides it. An unknown status maps to the
 * details step, which is the one that asks for the least and commits to nothing.
 */
function toStep(status: CheckoutSession['status']): string {
  switch (status) {
    case 'READY_FOR_PAYMENT':
    case 'PAYMENT_PENDING':
      return 'PAYMENT';
    case 'COMPLETED':
      return 'CONFIRMATION';
    default:
      return 'DETAILS';
  }
}

export function toCheckoutSessionDto(checkout: CheckoutSessionWithItems) {
  const currency = checkout.currency;
  const requirements = Array.isArray(checkout.requirementsSnapshot)
    ? checkout.requirementsSnapshot
    : [];

  return {
    id: checkout.id,
    cart: {
      id: `cart_${checkout.id}`,
      items: checkout.items.map((item) => toItemDto(item, currency)),
      totals: {
        subtotal: { amountMinor: checkout.subtotalMinor, currency },
        discount: { amountMinor: checkout.discountMinor, currency },
        total: { amountMinor: checkout.totalMinor, currency },
        itemCount: checkout.items.reduce((count, item) => count + item.quantity, 0),
      },
      couponCode: checkout.couponCode,
      rewardId: checkout.rewardId,
      // The stacking decision frozen with the prices, so the checkout screen
      // explains the same thing the cart did.
      benefits: toBenefitsDto((checkout.benefitsSnapshot as unknown as CartBenefits | null) ?? NO_BENEFITS),
    },
    requirements,
    // Payment providers arrive with the payment phase. An empty list is honest:
    // nothing can be charged yet.
    availableProviders: [],
    status: checkout.status,
    step: toStep(checkout.status),
    values: (checkout.contactValues ?? {}) as Record<string, string | boolean>,
    orderId: null,
    expiresAt: checkout.expiresAt.toISOString(),
  };
}

export function toCheckoutSubmitDto(
  checkout: CheckoutSessionWithItems,
  issues: readonly { field: string; message: { he: string; en: string } }[],
) {
  return {
    session: toCheckoutSessionDto(checkout),
    issues: issues.map((issue) => ({ field: issue.field, message: issue.message })),
    orderId: null,
  };
}
