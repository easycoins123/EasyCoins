import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';

import { provideMockDataLayer } from '../data/mock/providers';
import { OFFERS } from '../data/mock/catalog.seed';
import { CartFacade } from './cart.facade';

/**
 * Changing the platform of a line in the cart.
 *
 * A customer who picked the wrong console used to have to remove the line and
 * find the bundle again. `replaceOffer` swaps the line for the same bundle on
 * another platform, keeps the quantity and the line's place, and never leaves
 * both the old and the new line behind.
 */
const PS5 = OFFERS.find((offer) => offer.productId === 'prod-fc-coins' && offer.platformId === 'plat-ps5')!;
const XBOX = OFFERS.find((offer) => offer.productId === 'prod-fc-coins' && offer.variantId === PS5.variantId && offer.platformId === 'plat-xbox')!;

describe('CartFacade platform switch', () => {
  let cart: CartFacade;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockDataLayer()] });
    cart = TestBed.inject(CartFacade);
    cart.clear();
  });

  it('swaps the line for the same bundle on the other platform, keeping the quantity', fakeAsync(() => {
    cart.add({ offerId: PS5.id, quantity: 2 }).subscribe();
    tick(500);
    const line = cart.items()[0];
    cart.replaceOffer(line.id, XBOX.id).subscribe();
    tick(500);
    expect(cart.items().length).toBe(1);
    expect(cart.items()[0].offerId).toBe(XBOX.id);
    expect(cart.items()[0].platformId).toBe('plat-xbox');
    expect(cart.items()[0].quantity).toBe(2);
    expect(cart.totals().total.amountMinor).toBe(XBOX.price.current.amountMinor * 2);
    flush();
  }));

  it('does nothing when the platform is already the one chosen', fakeAsync(() => {
    cart.add({ offerId: PS5.id, quantity: 1 }).subscribe();
    tick(500);
    let result: unknown = 'unset';
    cart.replaceOffer(cart.items()[0].id, PS5.id).subscribe((value) => (result = value));
    tick(500);
    expect(result).toBeNull();
    expect(cart.items()[0].offerId).toBe(PS5.id);
    flush();
  }));

  it('folds into an existing line for that platform instead of duplicating it', fakeAsync(() => {
    cart.add({ offerId: PS5.id, quantity: 1 }).subscribe();
    tick(500);
    cart.add({ offerId: XBOX.id, quantity: 1 }).subscribe();
    tick(500);
    const psLine = cart.items().find((item) => item.offerId === PS5.id)!;
    cart.replaceOffer(psLine.id, XBOX.id).subscribe();
    tick(500);
    expect(cart.items().length).toBe(1);
    expect(cart.items()[0].offerId).toBe(XBOX.id);
    flush();
  }));
});
