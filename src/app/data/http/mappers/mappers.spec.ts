import {
  CheckoutFieldKey, FulfillmentMethod, InventoryStatus, OrderStatus, PaymentStatus, ProductType,
  RegionCode,
} from '../../../domain';
import * as Dto from '../dto';
import * as Map from './index';

/**
 * The mapping boundary.
 *
 * These tests encode the promises the rest of the app relies on: an unfamiliar
 * backend payload degrades safely instead of crashing the UI or, worse, being
 * interpreted as something favourable (in stock, paid, delivered).
 */

const localized = (he: string, en?: string): Dto.LocalizedTextDto => ({ he, en });
const money = (amountMinor: number): Dto.MoneyDto => ({ amountMinor, currency: 'ILS' });
/** Domain-typed zero, for the few places a test builds a domain object directly. */
const zero = { amountMinor: 0, currency: 'ILS' } as const;

describe('mappers: primitives', () => {
  it('keeps money in integer minor units', () => {
    expect(Map.toMoney({ amountMinor: 5200, currency: 'ILS' }).amountMinor).toBe(5200);
  });

  it('rounds a float amount a backend should never have sent', () => {
    expect(Map.toMoney({ amountMinor: 52.4, currency: 'ILS' }).amountMinor).toBe(52);
  });

  it('falls back to zero shekels for a missing or malformed amount', () => {
    expect(Map.toMoney(undefined)).toEqual({ amountMinor: 0, currency: 'ILS' });
    expect(Map.toMoney({ amountMinor: NaN, currency: 'ILS' }).amountMinor).toBe(0);
  });

  it('resolves localized text and tolerates a missing translation', () => {
    expect(Map.toLocalized(localized('שלום', 'Hello'))).toEqual({ he: 'שלום', en: 'Hello' });
    expect(Map.toLocalized(localized('שלום'))).toEqual({ he: 'שלום' });
    expect(Map.toLocalized(undefined, 'fallback')).toEqual({ he: 'fallback' });
  });

  it('computes hasMore when the backend omits it', () => {
    const page = Map.toPage<number, number>(
      { items: [1, 2], page: 1, pageSize: 2, total: 10 },
      (value) => value,
    );
    expect(page.hasMore).toBeTrue();
  });

  it('treats a missing page envelope as an empty page rather than throwing', () => {
    const page = Map.toPage<number, number>(undefined, (value) => value);
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });
});

describe('mappers: safe enum coercion', () => {
  it('maps a known fulfillment method', () => {
    const offer = Map.toOffer(offerDto({ fulfillmentMethod: 'DIGITAL_CODE' }));
    expect(offer.fulfillmentMethod).toBe(FulfillmentMethod.DigitalCode);
  });

  it('degrades an unknown fulfillment method to NOT_SUPPORTED, never to a sellable one', () => {
    const offer = Map.toOffer(offerDto({ fulfillmentMethod: 'TELEPORT' }));
    expect(offer.fulfillmentMethod).toBe(FulfillmentMethod.NotSupported);
  });

  it('degrades an unknown stock status to out of stock, never to in stock', () => {
    expect(Map.toInventory({ status: 'QUANTUM' }).status).toBe(InventoryStatus.OutOfStock);
  });

  it('degrades an unknown payment status to PROCESSING, never to SUCCEEDED', () => {
    const result = Map.toPaymentResult({ intentId: 'pi_1', status: 'WOBBLY', orderId: 'ord_1' });
    expect(result.status).toBe(PaymentStatus.Processing);
    expect(result.status).not.toBe(PaymentStatus.Succeeded);
  });

  it('degrades an unknown order status to PROCESSING, never to FULFILLED', () => {
    const snapshot = Map.toOrderStatus({
      orderId: 'ord_1', status: 'INVENTED', updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(snapshot.status).toBe(OrderStatus.Processing);
    expect(snapshot.status).not.toBe(OrderStatus.Fulfilled);
  });

  it('degrades an unknown product type to OTHER so the catalog still renders', () => {
    expect(Map.toProduct(productDto({ type: 'MYSTERY' })).type).toBe(ProductType.Other);
  });

  it('degrades an unknown region code to GLOBAL', () => {
    expect(Map.toRegion(regionDto({ code: 'ATLANTIS' })).code).toBe(RegionCode.Global);
  });
});

describe('mappers: checkout requirements', () => {
  it('maps a requirement from the closed vocabulary', () => {
    const requirement = Map.toCheckoutRequirement({
      key: 'EMAIL', control: 'email', label: localized('אימייל'), required: true,
    });
    expect(requirement?.key).toBe(CheckoutFieldKey.Email);
  });

  it('drops a requirement key outside the vocabulary', () => {
    // The client-side half of "the storefront cannot ask for a credential":
    // even a compromised backend cannot make this form render a password field.
    expect(Map.toCheckoutRequirement({
      key: 'PASSWORD', control: 'text', label: localized('סיסמה'), required: true,
    })).toBeUndefined();
  });

  it('drops unknown requirements from an offer while keeping the valid ones', () => {
    const offer = Map.toOffer(offerDto({
      checkoutRequirements: [
        { key: 'EMAIL', control: 'email', label: localized('אימייל'), required: true },
        { key: 'PSN_PASSWORD', control: 'text', label: localized('סיסמה'), required: true },
        { key: 'TWO_FACTOR_CODE', control: 'text', label: localized('קוד'), required: true },
      ],
    }));
    expect(offer.checkoutRequirements.length).toBe(1);
    expect(offer.checkoutRequirements[0].key).toBe(CheckoutFieldKey.Email);
  });

  it('falls back to a text control for an unknown control type', () => {
    const requirement = Map.toCheckoutRequirement({
      key: 'FULL_NAME', control: 'hologram', label: localized('שם'), required: true,
    });
    expect(requirement?.control).toBe('text');
  });
});

describe('mappers: products and offers', () => {
  it('fills every collection the domain declares non-optional', () => {
    const product = Map.toProduct({
      id: 'p1', gameId: 'g1', slug: 'p1', type: 'GIFT_CARD',
      name: localized('מוצר'), shortDescription: localized('קצר'), description: localized('ארוך'),
      active: true,
    });
    expect(product.platformIds).toEqual([]);
    expect(product.regionIds).toEqual([]);
    expect(product.variants).toEqual([]);
    expect(product.images).toEqual([]);
    expect(product.tags).toEqual([]);
    expect(product.metadata).toEqual({});
  });

  it('derives fromPrice from the cheapest offer when the backend omits it', () => {
    const detail = Map.toProductDetail({
      product: productDto({ fromPrice: null }),
      offers: [
        offerDto({ id: 'o1', price: { current: money(9900) } }),
        offerDto({ id: 'o2', price: { current: money(4900) } }),
      ],
    });
    expect(detail.product.fromPrice?.current.amountMinor).toBe(4900);
  });

  it('keeps the backend fromPrice when it is supplied', () => {
    const detail = Map.toProductDetail({
      product: productDto({ fromPrice: { current: money(1234) } }),
      offers: [offerDto({ price: { current: money(9900) } })],
    });
    expect(detail.product.fromPrice?.current.amountMinor).toBe(1234);
  });

  it('carries a compare-at price and discount through', () => {
    const offer = Map.toOffer(offerDto({
      price: { current: money(21900), compareAt: money(24900), discountPercent: 12 },
    }));
    expect(offer.price.compareAt?.amountMinor).toBe(24900);
    expect(offer.price.discountPercent).toBe(12);
  });

  it('preserves the region on an offer', () => {
    expect(Map.toOffer(offerDto({ regionId: 'reg-us' })).regionId).toBe('reg-us');
  });
});

describe('mappers: cart', () => {
  it('recomputes totals when the backend omits them', () => {
    const cart = Map.toCart({
      id: 'c1',
      items: [cartItemDto({ quantity: 2, unitPrice: money(5200), totalPrice: money(10400) })],
      totals: undefined as unknown as Dto.CartTotalsDto,
    });
    expect(cart.totals.subtotal.amountMinor).toBe(10400);
    expect(cart.totals.itemCount).toBe(2);
  });

  it('trusts the server totals when supplied, because the server prices the cart', () => {
    const cart = Map.toCart({
      id: 'c1',
      items: [cartItemDto({ quantity: 1, unitPrice: money(5200), totalPrice: money(5200) })],
      totals: { subtotal: money(5200), discount: money(520), total: money(4680) },
    });
    expect(cart.totals.total.amountMinor).toBe(4680);
  });

  it('clamps a nonsensical quantity to at least one', () => {
    expect(Map.toCartItem(cartItemDto({ quantity: 0 })).quantity).toBe(1);
    expect(Map.toCartItem(cartItemDto({ quantity: -4 })).quantity).toBe(1);
  });

  it('maps an unknown issue code to a safe default', () => {
    const validation = Map.toCartValidation({
      cart: { id: 'c1', items: [], totals: { subtotal: money(0), discount: money(0), total: money(0) } },
      issues: [{ code: 'WEIRD', message: localized('משהו קרה') }],
      valid: false,
    });
    expect(validation.issues[0].code).toBe('OFFER_UNAVAILABLE');
  });

  it('sends only offer ids and quantities back for validation, never prices', () => {
    const request = Map.cartToRequest({
      id: 'c1',
      items: [Map.toCartItem(cartItemDto({ quantity: 3 }))],
      totals: { subtotal: zero, discount: zero, total: zero, itemCount: 3 },
      updatedAt: '',
    });
    expect(request.items).toEqual([{ offerId: 'offer_1', quantity: 3 }]);
    expect(JSON.stringify(request)).not.toContain('amountMinor');
  });
});

describe('mappers: payment and orders', () => {
  it('maps a confirm action with its prompt', () => {
    const intent = Map.toPaymentIntent(intentDto({
      action: { kind: 'CONFIRM', prompt: localized('אשרו את התשלום') },
    }));
    expect(intent.action.kind).toBe('CONFIRM');
  });

  it('maps a redirect action with its url', () => {
    const intent = Map.toPaymentIntent(intentDto({
      action: { kind: 'REDIRECT', url: 'https://provider.example/pay/1' },
    }));
    expect(intent.action).toEqual({ kind: 'REDIRECT', url: 'https://provider.example/pay/1' });
  });

  it('treats a redirect with no url as no action rather than a broken link', () => {
    expect(Map.toPaymentIntent(intentDto({ action: { kind: 'REDIRECT' } })).action.kind).toBe('NONE');
  });

  it('maps a missing action to NONE', () => {
    expect(Map.toPaymentIntent(intentDto({ action: null })).action.kind).toBe('NONE');
  });

  it('maps a delivered code payload', () => {
    const fulfillment = Map.toFulfillment(fulfillmentDto({
      delivery: { deliveredAt: '2026-01-01T00:00:00.000Z', payload: { kind: 'CODE', code: 'ABC-123' } },
    }));
    expect(fulfillment.delivery?.payload).toEqual({ kind: 'CODE', code: 'ABC-123', redeemUrl: undefined });
  });

  it('maps an unknown delivery payload kind to NONE', () => {
    const fulfillment = Map.toFulfillment(fulfillmentDto({
      delivery: { deliveredAt: '2026-01-01T00:00:00.000Z', payload: { kind: 'CARRIER_PIGEON' } },
    }));
    expect(fulfillment.delivery?.payload.kind).toBe('NONE');
  });

  it('maps a coin trade instruction with its listings', () => {
    const fulfillment = Map.toFulfillment(fulfillmentDto({
      instruction: {
        kind: 'TRADE',
        playerName: 'Bronze Common Goalkeeper',
        requestedCoins: 250_000,
        deliveredCoins: 250_800,
        trades: [{ sequence: 1, binPrice: 264_000, netCoins: 250_800 }],
      },
    }));
    expect(fulfillment.instruction).toEqual({
      kind: 'TRADE',
      playerName: 'Bronze Common Goalkeeper',
      requestedCoins: 250_000,
      deliveredCoins: 250_800,
      trades: [{ sequence: 1, binPrice: 264_000, netCoins: 250_800 }],
      note: undefined,
    });
  });

  it('drops an instruction with no listings rather than rendering a broken panel', () => {
    const fulfillment = Map.toFulfillment(fulfillmentDto({
      instruction: { kind: 'TRADE', playerName: 'x', trades: [] },
    }));
    expect(fulfillment.instruction).toBeUndefined();
  });

  it('leaves an absent delivery ETA absent rather than inventing one', () => {
    const descriptor = Map.toFulfillmentDescriptor({
      method: 'AUTOMATED_API', label: localized('אוטומטי'), description: localized('תיאור'),
      automated: true, requiresCustomerAction: false,
    });
    expect(descriptor.etaMinutesMin).toBeUndefined();
    expect(descriptor.etaMinutesMax).toBeUndefined();
  });

  it('maps an order and defaults its optional collections', () => {
    const order = Map.toOrder({
      id: 'ord_1', reference: 'EC-000001', contactEmail: 'a@b.co', status: 'PAID',
      items: [], totals: { subtotal: money(100), discount: money(0), total: money(100) },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(order.status).toBe(OrderStatus.Paid);
    expect(order.fulfillments).toEqual([]);
    expect(order.checkoutValues).toEqual({});
  });
});

describe('mappers: customer and content', () => {
  it('maps an anonymous session', () => {
    expect(Map.toAuthState({ authenticated: false }).kind).toBe('ANONYMOUS');
  });

  it('treats authenticated-without-a-customer as anonymous rather than half-signed-in', () => {
    expect(Map.toAuthState({ authenticated: true, customer: null }).kind).toBe('ANONYMOUS');
  });

  it('maps an authenticated customer and defaults their locale', () => {
    const state = Map.toAuthState({
      authenticated: true,
      customer: { id: 'c1', email: 'a@b.co', createdAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(state.kind).toBe('AUTHENTICATED');
    if (state.kind === 'AUTHENTICATED') {
      expect(state.customer.preferredLocale).toBe('he');
      expect(state.customer.preferredRegion).toBe(RegionCode.Israel);
    }
  });

  it('clamps an out-of-range review rating', () => {
    expect(Map.toReview(reviewDto({ rating: 9 })).rating).toBe(5);
    expect(Map.toReview(reviewDto({ rating: 0 })).rating).toBe(1);
  });

  it('pads a short review distribution to five buckets', () => {
    expect(Map.toReviewSummary({ average: 4.5, count: 2, distribution: [1] }).distribution)
      .toEqual([1, 0, 0, 0, 0]);
  });
});

// --- fixtures --------------------------------------------------------------

function offerDto(overrides: Partial<Dto.OfferDto> = {}): Dto.OfferDto {
  return {
    id: 'offer_1',
    productId: 'p1',
    variantId: 'v1',
    platformId: 'plat-ps5',
    regionId: 'reg-il',
    price: { current: money(5200) },
    inventory: { status: 'IN_STOCK', maxPerOrder: 10 },
    fulfillmentMethod: 'DIGITAL_CODE',
    active: true,
    ...overrides,
  };
}

function productDto(overrides: Partial<Dto.ProductDto> = {}): Dto.ProductDto {
  return {
    id: 'p1',
    gameId: 'g1',
    slug: 'product-one',
    type: 'GIFT_CARD',
    name: localized('מוצר'),
    shortDescription: localized('תיאור קצר'),
    description: localized('תיאור מלא'),
    active: true,
    ...overrides,
  };
}

function regionDto(overrides: Partial<Dto.RegionDto> = {}): Dto.RegionDto {
  return {
    id: 'reg-il',
    code: 'IL',
    name: localized('ישראל'),
    currency: 'ILS',
    isRegionFree: false,
    ...overrides,
  };
}

function cartItemDto(overrides: Partial<Dto.CartItemDto> = {}): Dto.CartItemDto {
  return {
    id: 'ci_1',
    offerId: 'offer_1',
    productId: 'p1',
    variantId: 'v1',
    platformId: 'plat-ps5',
    regionId: 'reg-il',
    quantity: 1,
    unitPrice: money(5200),
    totalPrice: money(5200),
    fulfillmentMethod: 'DIGITAL_CODE',
    displayName: localized('מוצר'),
    displayVariantName: localized('50'),
    ...overrides,
  };
}

function intentDto(overrides: Partial<Dto.PaymentIntentDto> = {}): Dto.PaymentIntentDto {
  return {
    id: 'pi_1',
    orderId: 'ord_1',
    provider: 'MOCK',
    amount: money(5200),
    status: 'REQUIRES_ACTION',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function fulfillmentDto(overrides: Partial<Dto.FulfillmentDto> = {}): Dto.FulfillmentDto {
  return {
    id: 'f_1',
    orderId: 'ord_1',
    orderItemId: 'oi_1',
    method: 'DIGITAL_CODE',
    status: 'DELIVERED',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function reviewDto(overrides: Partial<Dto.ReviewDto> = {}): Dto.ReviewDto {
  return {
    id: 'r1',
    authorDisplayName: 'בודק',
    rating: 5,
    body: 'טוב',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}
