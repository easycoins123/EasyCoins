import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import {
  Cart, CartItem, CartValidationResult, FulfillmentMethod, computeTotals, fromMajor,
} from '../../domain';
import { CartApiService } from '../api';
import { provideMockDataLayer } from './providers';
import { OFFERS } from './catalog.seed';

const GIFT_50 = 'offer__prod-ps-gift-card__50__plat-ps5__reg-il';

function itemFor(offerId: string, overrides: Partial<CartItem> = {}): CartItem {
  const offer = OFFERS.find((candidate) => candidate.id === offerId)!;
  const quantity = overrides.quantity ?? 1;
  return {
    id: 'ci_1',
    offerId: offer.id,
    productId: offer.productId,
    variantId: offer.variantId,
    platformId: offer.platformId,
    regionId: offer.regionId,
    quantity,
    unitPrice: offer.price.current,
    totalPrice: { ...offer.price.current, amountMinor: offer.price.current.amountMinor * quantity },
    fulfillmentMethod: offer.fulfillmentMethod,
    displayName: { he: 'x' },
    displayVariantName: { he: 'y' },
    addedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function cartOf(items: CartItem[], couponCode?: string): Cart {
  return { id: 'c1', items, totals: computeTotals(items), couponCode, updatedAt: '' };
}

/**
 * Cart validation is the frontend's price-trust boundary: whatever the browser
 * claims a line costs, the API re-derives it from the catalog. These tests pin
 * that behaviour, because it is what a real backend must also guarantee.
 */
describe('cart validation (server re-pricing)', () => {
  let api: CartApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockDataLayer()] });
    api = TestBed.inject(CartApiService);
  });

  const validate = (cart: Cart): CartValidationResult => {
    let result!: CartValidationResult;
    api.validate(cart).subscribe((value) => { result = value; });
    tick(400);
    return result;
  };

  it('accepts an untampered cart', fakeAsync(() => {
    const result = validate(cartOf([itemFor(GIFT_50)]));
    expect(result.valid).toBeTrue();
    expect(result.issues).toEqual([]);
  }));

  it('overwrites a tampered unit price with the catalog price', fakeAsync(() => {
    const tampered = itemFor(GIFT_50, { unitPrice: fromMajor(0.01), totalPrice: fromMajor(0.01) });
    const result = validate(cartOf([tampered]));

    expect(result.cart.items[0].unitPrice.amountMinor).toBe(5200);
    expect(result.cart.totals.total.amountMinor).toBe(5200);
    expect(result.valid).toBeFalse();
    expect(result.issues.some((issue) => issue.code === 'PRICE_CHANGED')).toBeTrue();
  }));

  it('drops a line whose offer no longer exists', fakeAsync(() => {
    const result = validate(cartOf([itemFor(GIFT_50, { offerId: 'offer__deleted' })]));
    expect(result.cart.items.length).toBe(0);
    expect(result.issues.some((issue) => issue.code === 'OFFER_UNAVAILABLE')).toBeTrue();
  }));

  it('caps a quantity that exceeds the per-order limit', fakeAsync(() => {
    const result = validate(cartOf([itemFor(GIFT_50, { quantity: 9999 })]));
    expect(result.cart.items[0].quantity).toBeLessThanOrEqual(10);
    expect(result.issues.some((issue) => issue.code === 'QUANTITY_REDUCED')).toBeTrue();
  }));

  it('recomputes the total from the corrected quantity', fakeAsync(() => {
    const result = validate(cartOf([itemFor(GIFT_50, { quantity: 3 })]));
    expect(result.cart.totals.total.amountMinor).toBe(5200 * 3);
  }));

  it('returns a customer-safe message for every issue', fakeAsync(() => {
    const result = validate(cartOf([itemFor(GIFT_50, { offerId: 'offer__deleted' })]));
    for (const issue of result.issues) {
      expect(issue.message.he.length).toBeGreaterThan(5);
      expect(issue.message.he).not.toMatch(/undefined|null|Error|stack/i);
    }
  }));

  it('validates an empty cart without error', fakeAsync(() => {
    const result = validate(cartOf([]));
    expect(result.valid).toBeTrue();
    expect(result.cart.totals.total.amountMinor).toBe(0);
  }));

  it('applies a valid coupon above its minimum', fakeAsync(() => {
    let applied = false;
    let discountMinor = 0;
    api.applyCoupon(cartOf([itemFor(GIFT_50, { quantity: 3 })]), 'LAUNCH10').subscribe((application) => {
      applied = application.applied;
      discountMinor = application.discount.amountMinor;
    });
    tick(400);
    expect(applied).toBeTrue();
    expect(discountMinor).toBe(Math.round(5200 * 3 * 0.1));
  }));

  it('rejects a coupon below its minimum subtotal', fakeAsync(() => {
    let applied = true;
    api.applyCoupon(cartOf([itemFor(GIFT_50)]), 'LAUNCH10').subscribe((application) => {
      applied = application.applied;
    });
    tick(400);
    expect(applied).toBeFalse();
  }));

  it('rejects an unknown coupon code', fakeAsync(() => {
    let applied = true;
    api.applyCoupon(cartOf([itemFor(GIFT_50, { quantity: 3 })]), 'NOPE').subscribe((application) => {
      applied = application.applied;
    });
    tick(400);
    expect(applied).toBeFalse();
  }));

  it('builds a cart line from an offer id without the UI supplying a price', fakeAsync(() => {
    let built: CartItem | undefined;
    api.createItem({ offerId: GIFT_50, quantity: 2 }).subscribe((item) => { built = item; });
    tick(400);
    expect(built?.unitPrice.amountMinor).toBe(5200);
    expect(built?.totalPrice.amountMinor).toBe(10400);
    expect(built?.fulfillmentMethod).toBe(FulfillmentMethod.DigitalCode);
    expect(built?.regionId).toBe('reg-il');
  }));
});
