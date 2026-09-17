import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  AddToCartRequest, Cart, CartItem, CartValidationResult, CheckoutFieldValues, CheckoutSession,
  CheckoutSessionId, CheckoutSubmitResult, CouponApplication, Fulfillment, FulfillmentDescriptor,
  FulfillmentMethod, Order, OrderId, OrderStatusSnapshot, PaymentInstrumentRef, PaymentIntentId,
  PaymentProviderId, PaymentResult, PaymentSession,
} from '../../domain';
import {
  CartApiService, CheckoutApiService, FulfillmentApiService, OrderApiService, PaymentApiService,
} from '../api';
import { ApiClient } from './api-client.service';
import * as Dto from './dto';
import { scopedIdempotencyKey } from './idempotency';
import * as Map from './mappers';

@Injectable()
export class HttpCartApiService extends CartApiService {
  private readonly api = inject(ApiClient);

  createItem(request: AddToCartRequest): Observable<CartItem> {
    // The server prices the line. We send an offer id and a quantity, nothing else.
    return this.api.post<Dto.CartItemDto>('/cart/items', request).pipe(map(Map.toCartItem));
  }

  validate(cart: Cart): Observable<CartValidationResult> {
    return this.api.post<Dto.CartValidationDto>('/cart/validate', Map.cartToRequest(cart))
      .pipe(map(Map.toCartValidation));
  }

  applyCoupon(cart: Cart, code: string): Observable<CouponApplication> {
    return this.api.post<Dto.CouponApplicationDto>('/promotions/validate', Map.couponToRequest(cart, code))
      .pipe(map(Map.toCouponApplication));
  }
}

@Injectable()
export class HttpCheckoutApiService extends CheckoutApiService {
  private readonly api = inject(ApiClient);

  createSession(cart: Cart): Observable<CheckoutSession> {
    return this.api.post<Dto.CheckoutSessionDto>('/checkout/sessions', Map.cartToRequest(cart))
      .pipe(map(Map.toCheckoutSession));
  }

  getSession(id: CheckoutSessionId): Observable<CheckoutSession> {
    return this.api.get<Dto.CheckoutSessionDto>(`/checkout/sessions/${encodeURIComponent(id)}`)
      .pipe(map(Map.toCheckoutSession));
  }

  submitDetails(id: CheckoutSessionId, values: CheckoutFieldValues): Observable<CheckoutSubmitResult> {
    return this.api.post<Dto.CheckoutSubmitDto>(
      `/checkout/sessions/${encodeURIComponent(id)}/validate`,
      { values },
    ).pipe(map(Map.toCheckoutSubmit));
  }
}

@Injectable()
export class HttpPaymentApiService extends PaymentApiService {
  private readonly api = inject(ApiClient);

  createSession(checkoutSessionId: CheckoutSessionId, provider: PaymentProviderId): Observable<PaymentSession> {
    // Keyed by checkout session: a double-click cannot open two intents. A
    // deliberate retry after a decline is a distinct call the server allows,
    // because the previous intent has already settled.
    return this.api.post<Dto.PaymentSessionDto>(
      '/payment/intents',
      { checkoutSessionId, provider },
      { idempotencyKey: scopedIdempotencyKey('payment-intent', checkoutSessionId) },
    ).pipe(map(Map.toPaymentSession));
  }

  confirm(intentId: PaymentIntentId, instrument: PaymentInstrumentRef): Observable<PaymentResult> {
    // Keyed by intent: confirming twice settles once.
    return this.api.post<Dto.PaymentResultDto>(
      `/payment/intents/${encodeURIComponent(intentId)}/confirm`,
      { instrument },
      { idempotencyKey: scopedIdempotencyKey('payment-confirm', intentId) },
    ).pipe(map(Map.toPaymentResult));
  }

  cancel(intentId: PaymentIntentId): Observable<PaymentResult> {
    return this.api.post<Dto.PaymentResultDto>(
      `/payment/intents/${encodeURIComponent(intentId)}/cancel`,
      {},
      { idempotencyKey: scopedIdempotencyKey('payment-cancel', intentId) },
    ).pipe(map(Map.toPaymentResult));
  }

  getStatus(intentId: PaymentIntentId): Observable<PaymentResult> {
    return this.api.get<Dto.PaymentResultDto>(`/payment/intents/${encodeURIComponent(intentId)}`)
      .pipe(map(Map.toPaymentResult));
  }
}

@Injectable()
export class HttpOrderApiService extends OrderApiService {
  private readonly api = inject(ApiClient);

  createFromCheckout(sessionId: CheckoutSessionId): Observable<Order> {
    // Keyed by checkout session, which is what guarantees one session yields one
    // order however many times the customer submits.
    return this.api.post<Dto.OrderDto>(
      '/orders',
      { checkoutSessionId: sessionId },
      { idempotencyKey: scopedIdempotencyKey('order-create', sessionId) },
    ).pipe(map(Map.toOrder));
  }

  getOrder(orderId: OrderId): Observable<Order> {
    return this.api.get<Dto.OrderDto>(`/orders/${encodeURIComponent(orderId)}`).pipe(map(Map.toOrder));
  }

  getOrderStatus(orderId: OrderId): Observable<OrderStatusSnapshot> {
    return this.api.get<Dto.OrderStatusDto>(`/orders/${encodeURIComponent(orderId)}/status`)
      .pipe(map(Map.toOrderStatus));
  }

  listOrders(): Observable<readonly Order[]> {
    return this.api.get<Dto.PageDto<Dto.OrderDto>>('/account/orders')
      .pipe(map((dto) => Map.toPage(dto, Map.toOrder).items));
  }

  markListed(orderId: OrderId): Observable<Order> {
    // No idempotency key: the endpoint is idempotent on the server, so a retry
    // is safe on its own.
    return this.api.post<Dto.OrderDto>(`/orders/${encodeURIComponent(orderId)}/mark-listed`, {})
      .pipe(map(Map.toOrder));
  }
}

@Injectable()
export class HttpFulfillmentApiService extends FulfillmentApiService {
  private readonly api = inject(ApiClient);

  getDescriptors(): Observable<readonly FulfillmentDescriptor[]> {
    return this.api.get<Dto.FulfillmentDescriptorDto[]>('/fulfillment/descriptors')
      .pipe(map((dtos) => dtos.map(Map.toFulfillmentDescriptor)));
  }

  getDescriptor(method: FulfillmentMethod): Observable<FulfillmentDescriptor> {
    return this.api.get<Dto.FulfillmentDescriptorDto>(`/fulfillment/descriptors/${method}`)
      .pipe(map(Map.toFulfillmentDescriptor));
  }

  getFulfillments(orderId: OrderId): Observable<readonly Fulfillment[]> {
    return this.api.get<Dto.FulfillmentDto[]>(`/orders/${encodeURIComponent(orderId)}/fulfillments`)
      .pipe(map((dtos) => dtos.map(Map.toFulfillment)));
  }
}
