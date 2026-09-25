import { TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideMockDataLayer } from '../../data/mock/providers';
import { OFFERS } from '../../data/mock/catalog.seed';
import { CartFacade } from '../../state';
import { CartPage } from './cart.page';

/**
 * The cart says what the customer will receive, on entry.
 *
 * This exists because of a real defect seen on the live site: a first
 * order with FIRST KICK live showed "1M coins received" and no benefit line
 * in the cart, then "1.1M" and the FIRST KICK line at checkout. Adding a
 * line never re-prices the cart, and nothing on the cart page asked the
 * server to, so the stacking decision stayed unknown until a reward or a
 * coupon action happened to run one.
 */
describe('CartPage', () => {
  const COIN_OFFER = OFFERS.find((offer) => offer.active && offer.productId === 'prod-fc27-coins' && offer.platformId === 'plat-ps5' && offer.variantId.endsWith('__1m'))!;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CartPage], providers: [provideMockDataLayer(), provideRouter([])] });
  });

  it('re-prices on entry so a first-order benefit and the received coins show before checkout', fakeAsync(() => {
    const cart = TestBed.inject(CartFacade);
    cart.clear();
    cart.add({ offerId: COIN_OFFER.id, quantity: 1 }).subscribe();
    tick(500);
    expect(cart.benefits()).toBeUndefined();

    const fixture = TestBed.createComponent(CartPage);
    fixture.detectChanges();
    tick(1000);
    fixture.detectChanges();

    const benefits = cart.benefits();
    expect(benefits?.applied.some((benefit) => benefit.kind === 'FIRST_ORDER')).toBeTrue();
    expect(benefits?.campaignCoins).toBe(100_000);
    expect(cart.totalCoins()).toBe(1_100_000);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('FIRST KICK');
    expect(text).toContain('1.1M');
    flush();
  }));

  it('does not re-price an empty cart or one whose decision is already known', fakeAsync(() => {
    const cart = TestBed.inject(CartFacade);
    cart.clear();
    const validate = spyOn(cart, 'validate').and.callThrough();
    TestBed.createComponent(CartPage).detectChanges();
    tick(500);
    expect(validate).not.toHaveBeenCalled();
    flush();
  }));
});
