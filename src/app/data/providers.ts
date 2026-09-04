import { Provider } from '@angular/core';
import type { Type } from '@angular/core';
import { HTTP_INTERCEPTORS } from '@angular/common/http';

import { environment } from '../../environments/environment';
import {
  CartApiService, CatalogApiService, CheckoutApiService, CustomerApiService,
  FulfillmentApiService, OrderApiService, PaymentApiService, ProductApiService,
  PromotionApiService, ReviewApiService, SupportApiService,
} from './api';
import { CorrelationInterceptor } from './http';
import {
  HttpCartApiService, HttpCatalogApiService, HttpCheckoutApiService, HttpCustomerApiService,
  HttpFulfillmentApiService, HttpOrderApiService, HttpPaymentApiService, HttpProductApiService,
  HttpPromotionApiService, HttpReviewApiService, HttpSupportApiService,
} from './http';

/**
 * The single place where an API abstraction is bound to an implementation.
 *
 * Two complete implementations satisfy the same eleven abstractions:
 *
 * - **mock** — the in-memory backend. Local development and the QA harnesses
 *   run on this, so the app is fully usable with no server.
 * - **http** — the REST client for the contract in `docs/API-CONTRACT.md`.
 *
 * `environment.apiMode` chooses between them and nothing else in the application
 * knows which is active. No component, facade, page or domain type references a
 * `Mock*` or `Http*` class.
 *
 * The mock implementation, with its seed catalog, is loaded through a dynamic
 * import only when mock mode is on: a production build runs in HTTP mode and
 * must not download an in-memory backend it will never use.
 *
 * Deliberately *not* here: any business rule. Pricing, validation, requirement
 * resolution and state transitions live behind the boundary, so the two
 * implementations cannot drift into disagreeing about behaviour.
 */
export function resolveDataLayer(): Promise<Provider[]> {
  if (environment.apiMode === 'http') {
    return Promise.resolve(provideHttpDataLayer());
  }
  return import('./mock/providers').then((module) => module.provideMockDataLayer());
}

/** Pairs each abstraction with an implementation so the two lists cannot diverge. */
export function bind(
  implementations: {
    catalog: Type<CatalogApiService>;
    product: Type<ProductApiService>;
    cart: Type<CartApiService>;
    checkout: Type<CheckoutApiService>;
    payment: Type<PaymentApiService>;
    order: Type<OrderApiService>;
    fulfillment: Type<FulfillmentApiService>;
    customer: Type<CustomerApiService>;
    promotion: Type<PromotionApiService>;
    review: Type<ReviewApiService>;
    support: Type<SupportApiService>;
  },
): Provider[] {
  return [
    { provide: CatalogApiService, useClass: implementations.catalog },
    { provide: ProductApiService, useClass: implementations.product },
    { provide: CartApiService, useClass: implementations.cart },
    { provide: CheckoutApiService, useClass: implementations.checkout },
    { provide: PaymentApiService, useClass: implementations.payment },
    { provide: OrderApiService, useClass: implementations.order },
    { provide: FulfillmentApiService, useClass: implementations.fulfillment },
    { provide: CustomerApiService, useClass: implementations.customer },
    { provide: PromotionApiService, useClass: implementations.promotion },
    { provide: ReviewApiService, useClass: implementations.review },
    { provide: SupportApiService, useClass: implementations.support },
  ];
}

export function provideHttpDataLayer(): Provider[] {
  return [
    ...bind({
      catalog: HttpCatalogApiService,
      product: HttpProductApiService,
      cart: HttpCartApiService,
      checkout: HttpCheckoutApiService,
      payment: HttpPaymentApiService,
      order: HttpOrderApiService,
      fulfillment: HttpFulfillmentApiService,
      customer: HttpCustomerApiService,
      promotion: HttpPromotionApiService,
      review: HttpReviewApiService,
      support: HttpSupportApiService,
    }),
    // Only registered in HTTP mode; there is nothing to correlate in mock mode.
    { provide: HTTP_INTERCEPTORS, useClass: CorrelationInterceptor, multi: true },
  ];
}
