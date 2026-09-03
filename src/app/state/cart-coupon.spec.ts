import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';

import { provideMockDataLayer } from '../data/mock/providers';
import { OFFERS } from '../data/mock/catalog.seed';
import { CartFacade } from './cart.facade';

/**
 * A coupon has to reach the total.
 *
 * These exist because of a real defect: the facade stored the coupon *code* and
 * showed a success message, but computed the totals from the line items alone.
 * `LAUNCH10` is advertised on the deals page, so a customer could enter it, be
 * told it was applied, watch the price not move, and pay full price. The order
 * was created at full price too.
 *
 * The API-level tests already covered the coupon arithmetic. Nothing covered the
 * step between the API and the screen, which is exactly where it broke, so these
 * assert on `CartFacade.totals()` — the value every price in the UI reads from.
 */
// A single line worth well over the coupon's hundred-shekel minimum, so the
// discount qualifies without needing several items.
const BIG_COIN_OFFER = OFFERS.find(
  (offer) => offer.productId === 'prod-fc-coins' && offer.price.current.amountMinor >= 10_000,
)!;

describe('CartFacade coupons', () => {
  let cart: CartFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockDataLayer()] });
    cart = TestBed.inject(CartFacade);
    cart.clear();
  });

  function addQualifyingCart(): void {
    cart.add({ offerId: BIG_COIN_OFFER.id, quantity: 1 }).subscribe();
    tick(500);
  }

  it('reduces the total by the discount the server returned', fakeAsync(() => {
    addQualifyingCart();
    const before = cart.totals().total.amountMinor;

    let applied = false;
    cart.applyCoupon('LAUNCH10').subscribe((result) => (applied = result));
    tick(500);

    expect(applied).toBe(true);
    expect(cart.totals().discount.amountMinor).toBeGreaterThan(0);
    expect(cart.totals().total.amountMinor).toBe(before - cart.totals().discount.amountMinor);
    flush();
  }));

  it('keeps the subtotal untouched, so the discount is visible as its own line', fakeAsync(() => {
    addQualifyingCart();
    const subtotal = cart.totals().subtotal.amountMinor;

    cart.applyCoupon('LAUNCH10').subscribe();
    tick(500);

    expect(cart.totals().subtotal.amountMinor).toBe(subtotal);
    expect(cart.totals().total.amountMinor).toBeLessThan(subtotal);
    flush();
  }));

  it('carries the discount into the cart the checkout is built from', fakeAsync(() => {
    addQualifyingCart();
    cart.applyCoupon('LAUNCH10').subscribe();
    tick(500);

    // checkout.facade builds its session from cart.cart(), so the discount has
    // to be inside that object and not only in a display-time computation.
    expect(cart.cart().totals.discount.amountMinor).toBeGreaterThan(0);
    expect(cart.cart().couponCode).toBe('LAUNCH10');
    flush();
  }));

  it('applies nothing and stores nothing when the code is rejected', fakeAsync(() => {
    addQualifyingCart();
    const before = cart.totals().total.amountMinor;

    let applied = true;
    cart.applyCoupon('NOT-A-REAL-CODE').subscribe((result) => (applied = result));
    tick(500);

    expect(applied).toBe(false);
    expect(cart.totals().discount.amountMinor).toBe(0);
    expect(cart.totals().total.amountMinor).toBe(before);
    expect(cart.cart().couponCode).toBeUndefined();
    flush();
  }));

  it('drops the discount when the cart no longer qualifies', fakeAsync(() => {
    addQualifyingCart();
    cart.applyCoupon('LAUNCH10').subscribe();
    tick(500);
    expect(cart.totals().discount.amountMinor).toBeGreaterThan(0);

    // Emptying the basket takes it under the coupon's minimum.
    const line = cart.items()[0];
    cart.remove(line.id);
    tick(500);

    expect(cart.totals().discount.amountMinor).toBe(0);
    flush();
  }));

  it('forgets the coupon entirely when the cart is cleared', fakeAsync(() => {
    addQualifyingCart();
    cart.applyCoupon('LAUNCH10').subscribe();
    tick(500);

    cart.clear();
    tick(500);

    expect(cart.cart().couponCode).toBeUndefined();
    expect(cart.totals().discount.amountMinor).toBe(0);
    flush();
  }));
});
