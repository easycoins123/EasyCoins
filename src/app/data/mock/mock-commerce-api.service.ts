import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  AddToCartRequest, AppliedBenefit, BenefitKind, Cart, CartBenefits, CartIssue, CartItem, CartValidationResult,
  CheckoutFieldKey, CheckoutFieldValues, CheckoutRequirement, CheckoutSession, CheckoutSessionId, CheckoutStep,
  CheckoutSubmitResult, CheckoutValidationIssue, CouponApplication, Delivery, Fulfillment,
  FulfillmentDescriptor, FulfillmentMethod, FulfillmentStatus, Money, Offer, Order, OrderId, OrderItem,
  LocalizedText, OrderStatus, OrderStatusSnapshot, PaymentAction, PaymentInstrumentRef,
  PaymentIntent, PaymentIntentId, PaymentProviderId, PaymentResult, PaymentSession, PaymentStatus,
  ProductType, RejectedBenefit, computeTotals, isAppError, isPaymentSettled, isPurchasable, lineTotal, localized,
  money, multiplyMoney, notFoundError, paymentError, sumMoney, validationError,
} from '../../domain';
import {
  CartApiService, CheckoutApiService, FulfillmentApiService, OrderApiService, PaymentApiService,
} from '../api';
import { FULFILLMENT_DESCRIPTORS, OFFERS } from './catalog.seed';
import { COUPONS, PAYMENT_PROVIDERS, PROMOTIONS, SIMULATED_INSTRUMENTS } from './content.seed';
import { MockBackendService } from './mock-backend.service';
import { BenefitRequest, resolveMockBenefits } from './mock-benefits';
import { MOCK_STOREFRONT } from './mock-storefront-api.service';
import {
  MOCK_NO_BENEFITS, isQualifyingOrder, onOrderPaid, redeemForOrder, redeemable, releaseForOrder, reserveReward,
} from './mock-growth.engine';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** The seed catalog alone. The backend's `findOffer` also knows custom amounts. */
function findOffer(offerId: string): Offer | undefined {
  return OFFERS.find((offer) => offer.id === offerId);
}

/** Launch bonus coins on a variant, per unit. Zero when the campaign is off. */
function launchBonusOf(metadata: Record<string, unknown> | undefined): number {
  const value = metadata?.['launchBonus'];
  return typeof value === 'number' && value > 0 ? Math.round(value) : 0;
}

/**
 * Requirements every order needs regardless of what is in it. Note what is not
 * here and can never be: no password, no verification code, no recovery code.
 */
const BASE_REQUIREMENTS: readonly CheckoutRequirement[] = [
  {
    key: CheckoutFieldKey.FullName,
    control: 'text',
    label: localized('שם מלא', 'Full name'),
    required: true,
    maxLength: 80,
  },
  {
    key: CheckoutFieldKey.Email,
    control: 'email',
    label: localized('אימייל', 'Email'),
    hint: localized('לכאן יישלחו אישור ההזמנה והקוד.', 'Your order confirmation and code are sent here.'),
    required: true,
    maxLength: 120,
  },
  {
    key: CheckoutFieldKey.Phone,
    control: 'tel',
    label: localized('טלפון (אופציונלי)', 'Phone (optional)'),
    hint: localized('לעדכונים על אספקה ידנית.', 'For updates about manual delivery.'),
    required: false,
    maxLength: 20,
  },
];

const TERMS_REQUIREMENT: CheckoutRequirement = {
  key: CheckoutFieldKey.TermsAcceptance,
  control: 'checkbox',
  label: localized('קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות ההחזרים', 'I have read and accept the terms of use and the refund policy'),
  required: true,
};

/**
 * The union of the base requirements and everything the cart's offers declare.
 * This is what makes checkout adapt to the basket instead of asking every
 * customer for a PSN ID they may not need.
 */
export function requirementsForCart(cart: Cart, resolve: (offerId: string) => Offer | undefined = findOffer): readonly CheckoutRequirement[] {
  const collected = new Map<CheckoutFieldKey, CheckoutRequirement>();
  for (const requirement of BASE_REQUIREMENTS) {
    collected.set(requirement.key, requirement);
  }
  for (const item of cart.items) {
    const offer = resolve(item.offerId);
    for (const requirement of offer?.checkoutRequirements ?? []) {
      const existing = collected.get(requirement.key);
      collected.set(requirement.key, existing?.required ? existing : requirement);
    }
  }
  const result = [...collected.values()];
  result.push(TERMS_REQUIREMENT);
  return result;
}

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

/** The coupon's own worth against a subtotal, before the stacking policy has a say. */
function couponDiscountFor(code: string | undefined, items: readonly CartItem[]): Money {
  if (!code) {
    return money(0);
  }
  const coupon = COUPONS.find((candidate) => candidate.code === code.toUpperCase() && candidate.active);
  if (!coupon) {
    return money(0);
  }
  const promotion = PROMOTIONS.find((candidate) => candidate.id === coupon.promotionId);
  const subtotal = sumMoney(items.map(lineTotal));
  if (coupon.minSubtotal && subtotal.amountMinor < coupon.minSubtotal.amountMinor) {
    return money(0);
  }
  if (promotion?.percentOff) {
    return multiplyMoney(subtotal, promotion.percentOff / 100);
  }
  if (promotion?.amountOff) {
    return promotion.amountOff;
  }
  return money(0);
}

export interface PricedMockCart {
  readonly items: CartItem[];
  readonly issues: CartIssue[];
  readonly discount: Money;
  readonly benefits: CartBenefits;
}

const LAUNCH_BONUS_LABEL = localized('בונוס ההשקה', 'Launch bonus');

/**
 * Authoritative re-pricing, the mock's version of the server's `PricingService`.
 *
 * Locally cached prices are discarded and rebuilt from the catalog; coins and
 * bonus coins are restated per line; then the stacking matrix decides which
 * of the launch bonus, a coupon and a chosen reward apply. The frontend is
 * never trusted with what a customer pays, in mock mode or any other.
 */
export function priceMockCart(backend: MockBackendService, cart: Cart): PricedMockCart {
  const issues: CartIssue[] = [];
  const items: CartItem[] = [];

  for (const item of cart.items) {
    const offer = backend.findOffer(item.offerId);
    if (!offer || !offer.active || offer.fulfillmentMethod === FulfillmentMethod.NotSupported) {
      issues.push({
        code: 'OFFER_UNAVAILABLE',
        itemId: item.id,
        message: localized('אחד הפריטים אינו זמין יותר והוסר מהעגלה.', 'One of the items is no longer available and was removed from your cart.'),
      });
      continue;
    }
    if (!isPurchasable(offer.inventory)) {
      issues.push({
        code: 'OUT_OF_STOCK',
        itemId: item.id,
        message: localized('אחד הפריטים אזל מהמלאי והוסר מהעגלה.', 'One of the items is out of stock and was removed from your cart.'),
      });
      continue;
    }

    const maxPerOrder = offer.inventory.maxPerOrder ?? item.quantity;
    const quantity = Math.min(item.quantity, maxPerOrder);
    if (quantity !== item.quantity) {
      issues.push({
        code: 'QUANTITY_REDUCED',
        itemId: item.id,
        message: localized(`הכמות עודכנה ל-${quantity} בהתאם למלאי הזמין.`, `Quantity was reduced to ${quantity} to match available stock.`),
      });
    }

    const unitPrice = offer.price.current;
    if (unitPrice.amountMinor !== item.unitPrice.amountMinor) {
      issues.push({
        code: 'PRICE_CHANGED',
        itemId: item.id,
        message: localized('המחיר של אחד הפריטים התעדכן.', 'The price of one of the items has changed.'),
      });
    }

    const product = backend.findProduct(offer.productId);
    const variant = backend.findVariant(offer.variantId);
    const isCoins = product?.type === ProductType.GameCurrency;
    items.push({
      ...item,
      quantity,
      unitPrice,
      totalPrice: multiplyMoney(unitPrice, quantity),
      coins: isCoins ? (variant?.quantityValue ?? 0) * quantity : 0,
      bonusCoins: isCoins ? launchBonusOf(variant?.metadata as Record<string, unknown> | undefined) * quantity : 0,
    });
  }

  const subtotal = sumMoney(items.map(lineTotal));
  const launchCoins = items.reduce((sum, item) => sum + (item.bonusCoins ?? 0), 0);
  const couponCode = cart.couponCode?.trim().toUpperCase();
  const requests: BenefitRequest[] = [];
  const rejected: RejectedBenefit[] = [];

  if (launchCoins > 0) {
    requests.push({ kind: 'LAUNCH_BONUS', label: LAUNCH_BONUS_LABEL });
  }
  if (couponCode && items.length > 0) {
    requests.push({ kind: 'COUPON', label: localized(couponCode, couponCode) });
  }
  const check = cart.rewardId && items.length > 0
    ? redeemable(backend, cart.rewardId, subtotal.amountMinor, items.some((item) => (item.coins ?? 0) > 0))
    : undefined;

  // FIRST KICK, as the server decides it: live, first paid order, a coin line,
  // above the minimum; the bonus is coins, capped, never money off.
  const coinsBought = items.reduce((sum, item) => sum + (item.coins ?? 0), 0);
  const welcome = MOCK_STOREFRONT.launch;
  const welcomeCoins = Math.min(welcome.capCoins, Math.floor((coinsBought * welcome.percentBps) / 10_000 / 1_000) * 1_000);
  const firstOrder = welcome.live && coinsBought > 0 && subtotal.amountMinor >= welcome.minOrderMinor && welcomeCoins > 0
    && ![...backend.orders.values()].some((order) => isQualifyingOrder(order));
  if (firstOrder) {
    requests.push({ kind: 'FIRST_ORDER', label: welcome.name });
  } else if (welcome.live && coinsBought > 0 && [...backend.orders.values()].some((order) => isQualifyingOrder(order))) {
    rejected.push({
      kind: 'FIRST_ORDER',
      label: welcome.name,
      code: 'FIRST_ORDER_ONLY',
      reason: localized('הטבת ההצטרפות היא להזמנה הראשונה בלבד.', 'The welcome benefit is for a first order only.'),
    });
  }
  if (check?.eligible && check.reward) {
    requests.push({ kind: 'REWARD', label: check.reward.title });
  } else if (check && cart.rewardId) {
    rejected.push({
      kind: 'REWARD',
      label: check.reward?.title ?? localized('ההטבה', 'The reward'),
      code: check.reason?.code ?? 'REWARD_NOT_AVAILABLE',
      reason: check.reason?.message ?? localized('ההטבה אינה זמינה.', 'The reward is not available.'),
      rewardId: cart.rewardId,
    });
  }

  const resolution = resolveMockBenefits(requests);
  for (const entry of resolution.rejected) {
    rejected.push({
      kind: entry.kind,
      label: entry.label,
      code: entry.code === 'NOT_COMBINABLE' ? `${entry.kind}_NOT_COMBINABLE` : 'ONE_PER_ORDER',
      reason: entry.reason,
      couponCode: entry.kind === 'COUPON' ? couponCode : undefined,
      rewardId: entry.kind === 'REWARD' ? cart.rewardId : undefined,
    });
  }

  const couponApplied = resolution.applied.some((entry) => entry.kind === 'COUPON');
  const rewardApplied = check?.eligible === true && resolution.applied.some((entry) => entry.kind === 'REWARD');
  const welcomeApplied = firstOrder && resolution.applied.some((entry) => entry.kind === 'FIRST_ORDER');
  const couponDiscount = couponApplied ? couponDiscountFor(couponCode, items) : money(0);
  let rewardCredit = 0;
  let rewardCoins = 0;
  if (rewardApplied && check?.reward) {
    if (check.reward.kind === 'NEXT_ORDER_CREDIT') {
      rewardCredit = Math.max(0, Math.min(check.reward.value, subtotal.amountMinor - couponDiscount.amountMinor));
    } else if (check.reward.kind === 'NEXT_ORDER_COINS') {
      rewardCoins = check.reward.value;
    }
  }

  const applied: AppliedBenefit[] = [];
  if (launchCoins > 0) {
    applied.push({ kind: 'LAUNCH_BONUS', label: LAUNCH_BONUS_LABEL, effect: { discount: money(0), coins: launchCoins } });
  }
  if (welcomeApplied) {
    applied.push({ kind: 'FIRST_ORDER', label: welcome.name, effect: { discount: money(0), coins: welcomeCoins } });
  }
  if (couponApplied && couponDiscount.amountMinor > 0 && couponCode) {
    applied.push({ kind: 'COUPON', label: localized(couponCode, couponCode), effect: { discount: couponDiscount, coins: 0 }, couponCode });
  }
  if (rewardApplied && check?.reward) {
    applied.push({ kind: 'REWARD', label: check.reward.title, effect: { discount: money(rewardCredit), coins: rewardCoins }, rewardId: check.reward.id });
  }

  for (const entry of rejected) {
    issues.push({ code: entry.kind === 'COUPON' ? 'COUPON_NOT_COMBINABLE' : 'REWARD_NOT_APPLICABLE', message: entry.reason });
  }
  if (couponApplied && couponDiscount.amountMinor === 0 && items.length > 0) {
    issues.push({ code: 'COUPON_NOT_APPLICABLE', message: localized('הקוד שהוזן אינו תקף לעגלה הזו.', 'That code does not apply to this cart.') });
  }

  return {
    items,
    issues,
    discount: money(couponDiscount.amountMinor + rewardCredit),
    benefits: {
      applied,
      rejected,
      rewardId: rewardApplied && check?.reward ? check.reward.id : undefined,
      rewardCoins,
      campaignId: welcomeApplied ? welcome.id : undefined,
      campaignCoins: welcomeApplied ? welcomeCoins : 0,
    },
  };
}

@Injectable()
export class MockCartApiService extends CartApiService {
  private readonly backend = inject(MockBackendService);

  createItem(request: AddToCartRequest): Observable<CartItem> {
    const offer = this.backend.findOffer(request.offerId);
    const product = offer ? this.backend.findProduct(offer.productId) : undefined;
    const variant = offer ? this.backend.findVariant(offer.variantId) : undefined;
    if (!offer || !product || !variant) {
      return this.backend.fail<CartItem>(notFoundError(`Offer "${request.offerId}" not found`));
    }
    const quantity = Math.max(1, Math.min(request.quantity, offer.inventory.maxPerOrder ?? request.quantity));
    const isCoins = product.type === ProductType.GameCurrency;
    return this.backend.respond<CartItem>({
      id: this.backend.nextId('ci'),
      offerId: offer.id,
      productId: product.id,
      variantId: variant.id,
      platformId: offer.platformId,
      regionId: offer.regionId,
      quantity,
      unitPrice: offer.price.current,
      totalPrice: multiplyMoney(offer.price.current, quantity),
      fulfillmentMethod: offer.fulfillmentMethod,
      displayName: product.name,
      displayVariantName: variant.name,
      imageUrl: product.images[0]?.url,
      addedAt: this.backend.now(),
      coins: isCoins ? (variant.quantityValue ?? 0) * quantity : 0,
      bonusCoins: isCoins ? launchBonusOf(variant.metadata as Record<string, unknown>) * quantity : 0,
    }, 120);
  }

  /** Authoritative re-pricing; see `priceMockCart`. */
  validate(cart: Cart): Observable<CartValidationResult> {
    const priced = priceMockCart(this.backend, cart);
    const validated: Cart = {
      ...cart,
      items: priced.items,
      totals: computeTotals(priced.items, priced.discount),
      rewardId: priced.benefits.rewardId,
      benefits: priced.benefits,
      updatedAt: this.backend.now(),
    };

    return this.backend.respond<CartValidationResult>({
      cart: validated,
      issues: priced.issues,
      valid: priced.issues.length === 0,
    }, 160);
  }

  applyCoupon(cart: Cart, code: string): Observable<CouponApplication> {
    const normalized = code.trim().toUpperCase();
    const coupon = COUPONS.find((candidate) => candidate.code === normalized && candidate.active);
    const subtotal = sumMoney(cart.items.map(lineTotal));

    if (!coupon) {
      return this.backend.respond<CouponApplication>({
        applied: false,
        code: normalized,
        discount: money(0),
        message: localized('קוד הקופון אינו תקף.', 'This coupon code is not valid.'),
      });
    }
    if (coupon.minSubtotal && subtotal.amountMinor < coupon.minSubtotal.amountMinor) {
      return this.backend.respond<CouponApplication>({
        applied: false,
        code: normalized,
        discount: money(0),
        message: localized('הקופון תקף להזמנות בסכום גבוה יותר.', 'This coupon applies to larger orders.'),
      });
    }

    // The stacking policy has the last word: a code set aside beside the
    // launch bonus or a chosen reward is reported with the policy's reason.
    const priced = priceMockCart(this.backend, { ...cart, couponCode: normalized });
    const applied = priced.benefits.applied.find((benefit) => benefit.kind === 'COUPON');
    const refused = priced.benefits.rejected.find((benefit) => benefit.kind === 'COUPON');
    if (!applied) {
      return this.backend.respond<CouponApplication>({
        applied: false,
        code: normalized,
        discount: money(0),
        message: refused?.reason ?? localized('קוד הקופון אינו תקף.', 'This coupon code is not valid.'),
      });
    }
    return this.backend.respond<CouponApplication>({
      applied: true,
      code: normalized,
      discount: applied.effect.discount,
      message: localized('הקופון הוחל על ההזמנה.', 'The coupon was applied to your order.'),
    });
  }
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

@Injectable()
export class MockCheckoutApiService extends CheckoutApiService {
  private readonly backend = inject(MockBackendService);

  createSession(cart: Cart): Observable<CheckoutSession> {
    // The session freezes what the server priced, never what the client sent.
    const priced = priceMockCart(this.backend, cart);
    const frozen: Cart = {
      ...cart,
      items: priced.items,
      totals: computeTotals(priced.items, priced.discount),
      couponCode: priced.benefits.applied.some((benefit) => benefit.kind === 'COUPON') ? cart.couponCode : undefined,
      rewardId: priced.benefits.rewardId,
      benefits: priced.benefits,
      updatedAt: this.backend.now(),
    };
    const session: CheckoutSession = {
      id: this.backend.nextId('cs'),
      cart: frozen,
      requirements: requirementsForCart(frozen, (offerId) => this.backend.findOffer(offerId)),
      availableProviders: PAYMENT_PROVIDERS,
      step: CheckoutStep.Details,
      values: {},
      expiresAt: this.backend.inMinutes(30),
    };
    this.backend.checkoutSessions.set(session.id, session);
    return this.backend.respond(session);
  }

  getSession(id: CheckoutSessionId): Observable<CheckoutSession> {
    return this.backend.respondOrNotFound(this.backend.checkoutSessions.get(id), `Checkout session "${id}"`);
  }

  submitDetails(id: CheckoutSessionId, values: CheckoutFieldValues): Observable<CheckoutSubmitResult> {
    const session = this.backend.checkoutSessions.get(id);
    if (!session) {
      return this.backend.fail<CheckoutSubmitResult>(notFoundError(`Checkout session "${id}" not found`));
    }

    const issues = validateCheckoutValues(session.requirements, values);
    if (issues.length > 0) {
      return this.backend.respond<CheckoutSubmitResult>({ session, issues });
    }

    const updated: CheckoutSession = { ...session, values, step: CheckoutStep.Payment };
    this.backend.checkoutSessions.set(id, updated);
    return this.backend.respond<CheckoutSubmitResult>({ session: updated, issues: [] });
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCheckoutValues(
  requirements: readonly CheckoutRequirement[],
  values: CheckoutFieldValues,
): readonly CheckoutValidationIssue[] {
  const issues: CheckoutValidationIssue[] = [];
  for (const requirement of requirements) {
    const value = values[requirement.key];
    if (requirement.control === 'checkbox') {
      if (requirement.required && value !== true) {
        issues.push({ field: requirement.key, message: localized('יש לאשר כדי להמשיך.', 'Please confirm to continue.') });
      }
      continue;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (requirement.required && text.length === 0) {
      issues.push({ field: requirement.key, message: localized('שדה חובה.', 'This field is required.') });
      continue;
    }
    if (text.length > 0 && requirement.maxLength !== undefined && text.length > requirement.maxLength) {
      issues.push({ field: requirement.key, message: localized('הערך ארוך מדי.', 'This value is too long.') });
    }
    if (requirement.key === CheckoutFieldKey.Email && text.length > 0 && !EMAIL_PATTERN.test(text)) {
      issues.push({ field: requirement.key, message: localized('כתובת אימייל אינה תקינה.', 'This email address is not valid.') });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

@Injectable()
export class MockOrderApiService extends OrderApiService {
  private readonly backend = inject(MockBackendService);

  createFromCheckout(sessionId: CheckoutSessionId): Observable<Order> {
    const session = this.backend.checkoutSessions.get(sessionId);
    if (!session) {
      return this.backend.fail<Order>(notFoundError(`Checkout session "${sessionId}" not found`));
    }
    const email = String(session.values[CheckoutFieldKey.Email] ?? '');
    if (email.length === 0) {
      return this.backend.fail<Order>(validationError('Checkout session has no contact email'));
    }

    // Idempotent: one checkout session yields exactly one order, however many
    // times it is submitted. This is what stops a double-click, a retry after a
    // decline, or a refresh from creating duplicate orders.
    const existing = session.orderId === undefined ? undefined : this.backend.orders.get(session.orderId);
    if (existing) {
      return this.backend.respond(existing, 120);
    }

    const orderId = this.backend.nextId('ord');
    const items: OrderItem[] = session.cart.items.map((item, index) => ({
      id: `${orderId}__item_${index}`,
      offerId: item.offerId,
      productId: item.productId,
      variantId: item.variantId,
      platformId: item.platformId,
      regionId: item.regionId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      fulfillmentMethod: item.fulfillmentMethod,
      fulfillmentStatus: FulfillmentStatus.Pending,
      displayName: item.displayName,
      displayVariantName: item.displayVariantName,
      imageUrl: item.imageUrl,
      coins: item.coins,
      bonusCoins: item.bonusCoins,
    }));

    const benefits = session.cart.benefits ?? MOCK_NO_BENEFITS;
    const order: Order = {
      id: orderId,
      reference: this.backend.nextOrderReference(),
      customerId: this.backend.currentCustomerId ?? undefined,
      contactEmail: email,
      status: OrderStatus.PendingPayment,
      items,
      totals: {
        subtotal: session.cart.totals.subtotal,
        discount: session.cart.totals.discount,
        total: session.cart.totals.total,
      },
      fulfillments: items.map((item, index) => ({
        id: `${orderId}__ful_${index}`,
        orderId,
        orderItemId: item.id,
        method: item.fulfillmentMethod,
        status: FulfillmentStatus.Pending,
        updatedAt: this.backend.now(),
      })),
      checkoutValues: session.values,
      couponCode: session.cart.couponCode,
      rewardId: benefits.rewardId,
      rewardCoins: benefits.rewardCoins,
      campaignCoins: benefits.campaignCoins,
      benefits,
      createdAt: this.backend.now(),
      updatedAt: this.backend.now(),
    };

    // The reward the session froze is held by this order, as the real ledger
    // holds it: one order per reward, returned if the order dies unpaid.
    if (benefits.rewardId) {
      try {
        reserveReward(this.backend, benefits.rewardId, orderId);
      } catch (error) {
        return this.backend.fail<Order>(isAppError(error) ? error : notFoundError('reward unavailable'));
      }
    }

    this.backend.orders.set(orderId, order);
    this.backend.checkoutSessions.set(sessionId, { ...session, orderId, step: CheckoutStep.Payment });
    return this.backend.respond(order);
  }

  getOrder(orderId: OrderId): Observable<Order> {
    return this.backend.respondOrNotFound(this.backend.orders.get(orderId), `Order "${orderId}"`);
  }

  getOrderStatus(orderId: OrderId): Observable<OrderStatusSnapshot> {
    return this.getOrder(orderId).pipe(map((order) => ({
      orderId: order.id,
      status: order.status,
      fulfillments: order.fulfillments,
      updatedAt: order.updatedAt,
      statusMessage: order.statusMessage,
    })));
  }

  listOrders(): Observable<readonly Order[]> {
    const orders = [...this.backend.orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.backend.respond(orders);
  }

  markListed(orderId: OrderId): Observable<Order> {
    const order = this.backend.orders.get(orderId);
    if (!order) {
      return this.backend.respondOrNotFound<Order>(order, `Order "${orderId}"`);
    }

    // Mirrors the server: a job waiting on the customer becomes one waiting on
    // us. Anything else is left as it is, so pressing the button twice is safe.
    const fulfillments = order.fulfillments.map((fulfillment) =>
      fulfillment.status === FulfillmentStatus.WaitingForCustomer
        ? { ...fulfillment, status: FulfillmentStatus.Ready, updatedAt: this.backend.now() }
        : fulfillment,
    );

    const updated: Order = {
      ...order,
      fulfillments,
      items: order.items.map((item, index) => ({
        ...item,
        fulfillmentStatus: fulfillments[index]?.status ?? item.fulfillmentStatus,
      })),
      updatedAt: this.backend.now(),
    };

    this.backend.orders.set(orderId, updated);
    return this.backend.respond(updated);
  }
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

/**
 * The payment simulator.
 *
 * It is deliberately not "button → success". It walks a real intent through the
 * same state machine a gateway would (`CREATED → REQUIRES_ACTION → PROCESSING →
 * SUCCEEDED | FAILED | CANCELLED`), and which branch it takes is decided by the
 * opaque instrument token the caller confirms with — exactly how a gateway's test
 * PANs work. Nothing is random, so every branch is reproducible in a test.
 *
 * It accepts no card data of any kind, is bound only under the `Mock` provider,
 * and its descriptor is flagged `simulated: true` so the UI must label it.
 */
@Injectable()
export class MockPaymentApiService extends PaymentApiService {
  private readonly backend = inject(MockBackendService);

  createSession(checkoutSessionId: CheckoutSessionId, provider: PaymentProviderId): Observable<PaymentSession> {
    const session = this.backend.checkoutSessions.get(checkoutSessionId);
    if (!session?.orderId) {
      return this.backend.fail<PaymentSession>(notFoundError(`No order for checkout session "${checkoutSessionId}"`));
    }
    const descriptor = PAYMENT_PROVIDERS.find((candidate) => candidate.id === provider);
    if (!descriptor?.enabled) {
      return this.backend.fail<PaymentSession>(paymentError(
        `Payment provider ${provider} is not enabled`,
        localized('אמצעי התשלום הזה עדיין לא פעיל.', 'This payment method is not active yet.'),
      ));
    }

    const order = this.backend.orders.get(session.orderId);
    if (order && order.status === OrderStatus.Fulfilled) {
      return this.backend.fail<PaymentSession>(paymentError(
        `Order ${order.id} is already paid`,
        localized('ההזמנה כבר שולמה.', 'This order has already been paid.'),
      ));
    }

    // Reuse the live intent for this order rather than minting a second one, so a
    // double-click or a refresh cannot open two payments against one order.
    const existing = [...this.backend.paymentIntents.values()].find(
      (intent) => intent.orderId === session.orderId && !isPaymentSettled(intent.status),
    );
    if (existing) {
      return this.backend.respond<PaymentSession>({
        intent: existing,
        availableProviders: PAYMENT_PROVIDERS,
        instruments: SIMULATED_INSTRUMENTS,
      });
    }

    const intent: PaymentIntent = {
      id: this.backend.nextId('pi'),
      orderId: session.orderId,
      provider,
      amount: session.cart.totals.total,
      status: PaymentStatus.RequiresAction,
      action: {
        kind: 'CONFIRM',
        prompt: localized(
          'זוהי סימולציית תשלום לצורכי פיתוח. בחרו תרחיש ואשרו. לא יתבצע חיוב ולא נאספים פרטי אשראי.',
          'This is a development payment simulation. Pick a scenario and confirm. No charge is made and no card details are collected.',
        ),
      },
      createdAt: this.backend.now(),
      updatedAt: this.backend.now(),
    };
    this.backend.paymentIntents.set(intent.id, intent);
    this.transitionOrder(intent.orderId, OrderStatus.PendingPayment);

    return this.backend.respond<PaymentSession>({
      intent,
      availableProviders: PAYMENT_PROVIDERS,
      instruments: SIMULATED_INSTRUMENTS,
    });
  }

  /**
   * Idempotent by intent id. Confirming an already-settled intent replays its
   * result rather than charging again — which is what keeps a double-clicked
   * "Pay" button from producing two paid orders.
   */
  confirm(intentId: PaymentIntentId, instrument: PaymentInstrumentRef): Observable<PaymentResult> {
    const intent = this.backend.paymentIntents.get(intentId);
    if (!intent) {
      return this.backend.fail<PaymentResult>(notFoundError(`Payment intent "${intentId}" not found`));
    }

    if (isPaymentSettled(intent.status)) {
      return this.backend.respond<PaymentResult>({
        intentId,
        status: intent.status,
        orderId: intent.orderId,
        failureReason: intent.status === PaymentStatus.Succeeded ? undefined : DECLINE_MESSAGE,
      }, 120);
    }

    // The gateway acknowledges first and settles after; the order follows.
    this.updateIntent(intent, PaymentStatus.Processing, { kind: 'NONE' });
    this.transitionOrder(intent.orderId, OrderStatus.PaymentProcessing);

    const outcome = OUTCOMES[instrument.token] ?? OUTCOMES['sim_success'];

    return this.backend.respond<null>(null, outcome.latencyMs).pipe(
      map(() => {
        const current = this.backend.paymentIntents.get(intentId);
        if (!current || isPaymentSettled(current.status)) {
          // Settled by a concurrent confirm while this one was in flight.
          return {
            intentId,
            status: current?.status ?? PaymentStatus.Failed,
            orderId: intent.orderId,
          };
        }

        if (outcome.status === PaymentStatus.Processing) {
          // The timeout instrument leaves the intent pending on purpose so the
          // "we are still waiting on the gateway" path can be exercised.
          return { intentId, status: PaymentStatus.Processing, orderId: intent.orderId };
        }

        this.updateIntent(current, outcome.status, { kind: 'NONE' });

        if (outcome.status === PaymentStatus.Succeeded) {
          this.markPaid({ ...current, status: PaymentStatus.Succeeded });
          return { intentId, status: PaymentStatus.Succeeded, orderId: intent.orderId };
        }

        this.transitionOrder(
          intent.orderId,
          outcome.status === PaymentStatus.Cancelled ? OrderStatus.Cancelled : OrderStatus.Failed,
          outcome.message,
        );
        if (outcome.status === PaymentStatus.Cancelled) {
          // The order will not be paid: what it held goes back to the customer.
          releaseForOrder(this.backend, intent.orderId);
        }
        return {
          intentId,
          status: outcome.status,
          orderId: intent.orderId,
          failureReason: outcome.message,
        };
      }),
    );
  }

  cancel(intentId: PaymentIntentId): Observable<PaymentResult> {
    const intent = this.backend.paymentIntents.get(intentId);
    if (!intent) {
      return this.backend.fail<PaymentResult>(notFoundError(`Payment intent "${intentId}" not found`));
    }
    if (isPaymentSettled(intent.status)) {
      return this.backend.respond<PaymentResult>({ intentId, status: intent.status, orderId: intent.orderId }, 120);
    }
    this.updateIntent(intent, PaymentStatus.Cancelled, { kind: 'NONE' });
    this.transitionOrder(intent.orderId, OrderStatus.Cancelled, CANCEL_MESSAGE);
    releaseForOrder(this.backend, intent.orderId);
    return this.backend.respond<PaymentResult>({
      intentId,
      status: PaymentStatus.Cancelled,
      orderId: intent.orderId,
      failureReason: CANCEL_MESSAGE,
    });
  }

  getStatus(intentId: PaymentIntentId): Observable<PaymentResult> {
    const intent = this.backend.paymentIntents.get(intentId);
    if (!intent) {
      return this.backend.fail<PaymentResult>(notFoundError(`Payment intent "${intentId}" not found`));
    }
    return this.backend.respond<PaymentResult>({
      intentId,
      status: intent.status,
      orderId: intent.orderId,
    }, 100);
  }

  private updateIntent(intent: PaymentIntent, status: PaymentStatus, action: PaymentAction): void {
    this.backend.paymentIntents.set(intent.id, {
      ...intent,
      status,
      action,
      updatedAt: this.backend.now(),
    });
  }

  /**
   * Advances the order and its fulfillments the way a webhook would: digital
   * codes are released immediately, manual methods enter processing with an ETA
   * and are settled later by the backend's fulfillment timer.
   */
  private markPaid(intent: PaymentIntent): void {
    const order = this.backend.orders.get(intent.orderId);
    if (!order) {
      return;
    }
    if (order.status === OrderStatus.Fulfilled || order.status === OrderStatus.Paid) {
      return; // already settled; never process a payment twice
    }

    const fulfillments: Fulfillment[] = order.fulfillments.map((fulfillment) => {
      if (fulfillment.method === FulfillmentMethod.DigitalCode) {
        const delivery: Delivery = {
          deliveredAt: this.backend.now(),
          payload: { kind: 'CODE', code: buildDemoCode(order.reference, fulfillment.id) },
        };
        return { ...fulfillment, status: FulfillmentStatus.Delivered, updatedAt: this.backend.now(), delivery };
      }
      const descriptor = FULFILLMENT_DESCRIPTORS.find((candidate) => candidate.method === fulfillment.method);
      return {
        ...fulfillment,
        status: FulfillmentStatus.Processing,
        updatedAt: this.backend.now(),
        estimatedReadyAt: this.backend.inMinutes(descriptor?.etaMinutesMax ?? 30),
      };
    });

    const allDelivered = fulfillments.every((fulfillment) => fulfillment.status === FulfillmentStatus.Delivered);

    const paid: Order = {
      ...order,
      payment: intent,
      status: allDelivered ? OrderStatus.Fulfilled : OrderStatus.FulfillmentProcessing,
      fulfillments,
      items: order.items.map((item, index) => ({
        ...item,
        fulfillmentStatus: fulfillments[index]?.status ?? item.fulfillmentStatus,
      })),
      paidAt: this.backend.now(),
      updatedAt: this.backend.now(),
      statusMessage: allDelivered
        ? localized('ההזמנה סופקה. הקודים מופיעים למטה ונשלחו גם למייל.', 'Your order was delivered. The codes are shown below and were also emailed to you.')
        : localized('התשלום התקבל. ההזמנה בתהליך אספקה.', 'Payment received. Your order is being delivered.'),
    };
    this.backend.orders.set(order.id, paid);

    // Paid and spent are one fact; then what a paid order sets in motion.
    redeemForOrder(this.backend, order.id);
    onOrderPaid(this.backend, paid);

    if (!allDelivered) {
      // Manual fulfillment completes asynchronously, so the status page has a
      // real transition to show rather than freezing on "processing" forever.
      this.backend.scheduleFulfillmentCompletion(order.id);
    }
  }

  private transitionOrder(orderId: OrderId, status: OrderStatus, statusMessage?: LocalizedText): void {
    const order = this.backend.orders.get(orderId);
    if (order) {
      this.backend.orders.set(orderId, {
        ...order,
        status,
        statusMessage: statusMessage ?? order.statusMessage,
        updatedAt: this.backend.now(),
      });
    }
  }
}

const DECLINE_MESSAGE = localized(
  'התשלום נדחה על ידי חברת האשראי. לא בוצע חיוב. אפשר לנסות שוב או לבחור אמצעי תשלום אחר.',
  'The payment was declined by the issuer. You were not charged. Try again or use another method.',
);

const CANCEL_MESSAGE = localized(
  'התשלום בוטל. לא בוצע חיוב.',
  'The payment was cancelled. You were not charged.',
);

const GATEWAY_ERROR_MESSAGE = localized(
  'שירות התשלומים לא זמין כרגע. לא בוצע חיוב, אפשר לנסות שוב.',
  'The payment service is unavailable right now. You were not charged. Please try again.',
);

interface SimulatedOutcome {
  readonly status: PaymentStatus;
  readonly latencyMs: number;
  readonly message?: LocalizedText;
}

/** Token → outcome. Deterministic, so every branch is reproducible in a test. */
const OUTCOMES: Readonly<Record<string, SimulatedOutcome>> = {
  sim_success: { status: PaymentStatus.Succeeded, latencyMs: 900 },
  sim_declined: { status: PaymentStatus.Failed, latencyMs: 800, message: DECLINE_MESSAGE },
  sim_cancelled: { status: PaymentStatus.Cancelled, latencyMs: 500, message: CANCEL_MESSAGE },
  sim_error: { status: PaymentStatus.Failed, latencyMs: 700, message: GATEWAY_ERROR_MESSAGE },
  sim_timeout: { status: PaymentStatus.Processing, latencyMs: 1200 },
};

/** Deterministic, obviously-fake demo code. Never presented as a real voucher. */
function buildDemoCode(reference: string, seed: string): string {
  const digits = `${reference}${seed}`.replace(/\D/g, '').padEnd(12, '0');
  return `DEMO-${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 12)}`;
}

// ---------------------------------------------------------------------------
// Fulfillment
// ---------------------------------------------------------------------------

@Injectable()
export class MockFulfillmentApiService extends FulfillmentApiService {
  private readonly backend = inject(MockBackendService);

  getDescriptors(): Observable<readonly FulfillmentDescriptor[]> {
    return this.backend.respond(FULFILLMENT_DESCRIPTORS, 60);
  }

  getDescriptor(method: FulfillmentMethod): Observable<FulfillmentDescriptor> {
    return this.backend.respondOrNotFound(
      FULFILLMENT_DESCRIPTORS.find((descriptor) => descriptor.method === method),
      `Fulfillment descriptor "${method}"`,
      60,
    );
  }

  getFulfillments(orderId: OrderId): Observable<readonly Fulfillment[]> {
    return this.backend.respond(this.backend.orders.get(orderId)?.fulfillments ?? []);
  }
}
