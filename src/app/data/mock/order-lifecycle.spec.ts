import { TestBed, fakeAsync, tick } from '@angular/core/testing';

import {
  Cart, CartItem, CheckoutFieldKey, CheckoutSession, FulfillmentStatus, Order, OrderStatus,
  PaymentProviderId, PaymentResult, PaymentSession, PaymentStatus, computeTotals,
  isPaymentSettled, isTerminalOrderStatus,
} from '../../domain';
import { CheckoutApiService, OrderApiService, PaymentApiService } from '../api';
import { provideMockDataLayer } from './providers';
import { OFFERS } from './catalog.seed';

const GIFT_50 = 'offer__prod-ps-gift-card__50__plat-ps5__reg-il';
const COINS_100K = 'offer__prod-fc-coins__100k__plat-ps5__reg-global';

function cartWith(offerId: string): Cart {
  const offer = OFFERS.find((candidate) => candidate.id === offerId)!;
  const item: CartItem = {
    id: 'ci_1',
    offerId: offer.id,
    productId: offer.productId,
    variantId: offer.variantId,
    platformId: offer.platformId,
    regionId: offer.regionId,
    quantity: 1,
    unitPrice: offer.price.current,
    totalPrice: offer.price.current,
    fulfillmentMethod: offer.fulfillmentMethod,
    displayName: { he: 'x' },
    displayVariantName: { he: 'y' },
    addedAt: '2026-01-01T00:00:00.000Z',
  };
  return { id: 'c1', items: [item], totals: computeTotals([item]), updatedAt: '' };
}

/**
 * The order + payment state machine.
 *
 * The simulator is only useful if it behaves like a gateway: an intent that
 * settles once, failure branches that leave no order paid, and idempotency that
 * survives a double submit.
 */
describe('order and payment lifecycle', () => {
  let checkoutApi: CheckoutApiService;
  let orderApi: OrderApiService;
  let paymentApi: PaymentApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMockDataLayer()] });
    checkoutApi = TestBed.inject(CheckoutApiService);
    orderApi = TestBed.inject(OrderApiService);
    paymentApi = TestBed.inject(PaymentApiService);
  });

  /** Runs the flow up to a created order and an open payment intent. */
  function openOrder(offerId: string): { session: CheckoutSession; order: Order; payment: PaymentSession } {
    let session!: CheckoutSession;
    checkoutApi.createSession(cartWith(offerId)).subscribe((value) => { session = value; });
    tick(400);

    const values: Record<string, string | boolean> = {
      [CheckoutFieldKey.FullName]: 'בודק',
      [CheckoutFieldKey.Email]: 'qa@example.com',
      [CheckoutFieldKey.TermsAcceptance]: true,
      [CheckoutFieldKey.RegionConfirmation]: true,
      [CheckoutFieldKey.PlatformAccountHandle]: 'TopGamer_IL',
      [CheckoutFieldKey.GamePlayerId]: 'player-1',
    };
    checkoutApi.submitDetails(session.id, values).subscribe((result) => { session = result.session; });
    tick(400);

    let order!: Order;
    orderApi.createFromCheckout(session.id).subscribe((value) => { order = value; });
    tick(400);

    let payment!: PaymentSession;
    paymentApi.createSession(session.id, PaymentProviderId.Mock).subscribe((value) => { payment = value; });
    tick(400);

    return { session, order, payment };
  }

  function confirm(intentId: string, token: string): PaymentResult {
    let result!: PaymentResult;
    paymentApi.confirm(intentId, { token }).subscribe((value) => { result = value; });
    tick(2000);
    return result;
  }

  function readOrder(orderId: string): Order {
    let order!: Order;
    orderApi.getOrder(orderId).subscribe((value) => { order = value; });
    tick(400);
    return order;
  }

  it('creates an order in PENDING_PAYMENT', fakeAsync(() => {
    const { order } = openOrder(GIFT_50);
    expect(order.status).toBe(OrderStatus.PendingPayment);
    expect(order.reference).toMatch(/^EC-\d{6}$/);
  }));

  it('opens an intent that requires customer action', fakeAsync(() => {
    const { payment } = openOrder(GIFT_50);
    expect(payment.intent.status).toBe(PaymentStatus.RequiresAction);
    expect(payment.intent.action.kind).toBe('CONFIRM');
  }));

  it('offers simulated instruments only, and never a card field', fakeAsync(() => {
    const { payment } = openOrder(GIFT_50);
    expect(payment.instruments?.length).toBeGreaterThan(0);
    for (const instrument of payment.instruments ?? []) {
      expect(instrument.token).toMatch(/^sim_/);
      expect(JSON.stringify(instrument)).not.toMatch(/pan|cvv|cardNumber|expiry/i);
    }
  }));

  it('settles a successful payment and delivers a digital code', fakeAsync(() => {
    const { order, payment } = openOrder(GIFT_50);
    const result = confirm(payment.intent.id, 'sim_success');

    expect(result.status).toBe(PaymentStatus.Succeeded);
    const settled = readOrder(order.id);
    expect(settled.status).toBe(OrderStatus.Fulfilled);
    expect(settled.fulfillments[0].status).toBe(FulfillmentStatus.Delivered);
    expect(settled.fulfillments[0].delivery?.payload.kind).toBe('CODE');
  }));

  it('marks a manual-fulfillment order as processing, not delivered', fakeAsync(() => {
    const { order, payment } = openOrder(COINS_100K);
    confirm(payment.intent.id, 'sim_success');

    const settled = readOrder(order.id);
    expect(settled.status).toBe(OrderStatus.FulfillmentProcessing);
    expect(settled.fulfillments[0].status).toBe(FulfillmentStatus.Processing);
    expect(settled.fulfillments[0].estimatedReadyAt).toBeDefined();

    // The backend completes it asynchronously, as an operator would.
    tick(7000);
    const delivered = readOrder(order.id);
    expect(delivered.status).toBe(OrderStatus.Fulfilled);
  }));

  it('leaves a declined order unpaid and undelivered', fakeAsync(() => {
    const { order, payment } = openOrder(GIFT_50);
    const result = confirm(payment.intent.id, 'sim_declined');

    expect(result.status).toBe(PaymentStatus.Failed);
    expect(result.failureReason?.he).toContain('נדחה');
    const failed = readOrder(order.id);
    expect(failed.status).toBe(OrderStatus.Failed);
    expect(failed.fulfillments[0].status).toBe(FulfillmentStatus.Pending);
    expect(failed.fulfillments[0].delivery).toBeUndefined();
  }));

  it('reports a cancelled payment as cancelled', fakeAsync(() => {
    const { order, payment } = openOrder(GIFT_50);
    const result = confirm(payment.intent.id, 'sim_cancelled');
    expect(result.status).toBe(PaymentStatus.Cancelled);
    expect(readOrder(order.id).status).toBe(OrderStatus.Cancelled);
  }));

  it('reports a gateway error as a retryable failure', fakeAsync(() => {
    const { payment } = openOrder(GIFT_50);
    const result = confirm(payment.intent.id, 'sim_error');
    expect(result.status).toBe(PaymentStatus.Failed);
    expect(result.failureReason?.he).toContain('לא זמין');
  }));

  it('leaves a timed-out payment pending and the order unpaid', fakeAsync(() => {
    const { order, payment } = openOrder(GIFT_50);
    const result = confirm(payment.intent.id, 'sim_timeout');

    expect(result.status).toBe(PaymentStatus.Processing);
    expect(isPaymentSettled(result.status)).toBeFalse();
    expect(readOrder(order.id).status).toBe(OrderStatus.PaymentProcessing);
  }));

  it('allows a retry after a decline and succeeds on the second intent', fakeAsync(() => {
    const { session, order, payment } = openOrder(GIFT_50);
    confirm(payment.intent.id, 'sim_declined');

    let retry!: PaymentSession;
    paymentApi.createSession(session.id, PaymentProviderId.Mock).subscribe((value) => { retry = value; });
    tick(400);
    expect(retry.intent.id).not.toBe(payment.intent.id);

    const result = confirm(retry.intent.id, 'sim_success');
    expect(result.status).toBe(PaymentStatus.Succeeded);
    expect(readOrder(order.id).status).toBe(OrderStatus.Fulfilled);
  }));

  it('is idempotent: confirming a settled intent replays its result', fakeAsync(() => {
    const { payment } = openOrder(GIFT_50);
    const first = confirm(payment.intent.id, 'sim_success');
    const second = confirm(payment.intent.id, 'sim_declined');

    expect(first.status).toBe(PaymentStatus.Succeeded);
    expect(second.status).toBe(PaymentStatus.Succeeded);
  }));

  it('creates exactly one order per checkout session however often it is submitted', fakeAsync(() => {
    const { session, order } = openOrder(GIFT_50);

    let again!: Order;
    orderApi.createFromCheckout(session.id).subscribe((value) => { again = value; });
    tick(400);

    expect(again.id).toBe(order.id);

    let all: readonly Order[] = [];
    orderApi.listOrders().subscribe((value) => { all = value; });
    tick(400);
    expect(all.length).toBe(1);
  }));

  it('reuses the open intent instead of minting a second one for the same order', fakeAsync(() => {
    const { session, payment } = openOrder(GIFT_50);

    let second!: PaymentSession;
    paymentApi.createSession(session.id, PaymentProviderId.Mock).subscribe((value) => { second = value; });
    tick(400);

    expect(second.intent.id).toBe(payment.intent.id);
  }));

  it('refuses a second payment on an already-paid order', fakeAsync(() => {
    const { session, payment } = openOrder(GIFT_50);
    confirm(payment.intent.id, 'sim_success');

    let failed = false;
    paymentApi.createSession(session.id, PaymentProviderId.Mock).subscribe({
      error: () => { failed = true; },
    });
    tick(400);
    expect(failed).toBeTrue();
  }));

  it('rejects a provider that is not enabled', fakeAsync(() => {
    const { session } = openOrder(GIFT_50);
    let failed = false;
    paymentApi.createSession(session.id, PaymentProviderId.PayPal).subscribe({
      error: () => { failed = true; },
    });
    tick(400);
    expect(failed).toBeTrue();
  }));

  it('exposes the order status snapshot the status page polls', fakeAsync(() => {
    const { order, payment } = openOrder(GIFT_50);
    confirm(payment.intent.id, 'sim_success');

    let snapshot!: { status: OrderStatus };
    orderApi.getOrderStatus(order.id).subscribe((value) => { snapshot = value; });
    tick(400);
    expect(snapshot.status).toBe(OrderStatus.Fulfilled);
    expect(isTerminalOrderStatus(snapshot.status)).toBeTrue();
  }));

  it('never stores a credential on the order', fakeAsync(() => {
    const { order, payment } = openOrder(COINS_100K);
    confirm(payment.intent.id, 'sim_success');
    tick(7000); // let the manual-fulfillment timer drain
    const serialized = JSON.stringify(readOrder(order.id));
    expect(serialized).not.toMatch(/password|סיסמה|cvv|cardNumber|2fa|otp/i);
  }));
});

describe('lifecycle predicates', () => {
  it('treats delivered, failed, cancelled and refunded as terminal', () => {
    expect(isTerminalOrderStatus(OrderStatus.Fulfilled)).toBeTrue();
    expect(isTerminalOrderStatus(OrderStatus.Failed)).toBeTrue();
    expect(isTerminalOrderStatus(OrderStatus.Cancelled)).toBeTrue();
    expect(isTerminalOrderStatus(OrderStatus.Refunded)).toBeTrue();
  });

  it('treats in-flight statuses as non-terminal so polling continues', () => {
    expect(isTerminalOrderStatus(OrderStatus.PendingPayment)).toBeFalse();
    expect(isTerminalOrderStatus(OrderStatus.PaymentProcessing)).toBeFalse();
    expect(isTerminalOrderStatus(OrderStatus.FulfillmentProcessing)).toBeFalse();
  });

  it('treats only settled payment statuses as settled', () => {
    expect(isPaymentSettled(PaymentStatus.Succeeded)).toBeTrue();
    expect(isPaymentSettled(PaymentStatus.Failed)).toBeTrue();
    expect(isPaymentSettled(PaymentStatus.Cancelled)).toBeTrue();
    expect(isPaymentSettled(PaymentStatus.Processing)).toBeFalse();
    expect(isPaymentSettled(PaymentStatus.RequiresAction)).toBeFalse();
  });
});
