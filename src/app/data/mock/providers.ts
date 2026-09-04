import { Provider } from '@angular/core';

import { bind } from '../providers';
import {
  MockCartApiService, MockCatalogApiService, MockCheckoutApiService, MockCustomerApiService,
  MockFulfillmentApiService, MockOrderApiService, MockPaymentApiService, MockProductApiService,
  MockPromotionApiService, MockReviewApiService, MockSupportApiService,
} from './index';

/**
 * The in-memory backend, bound to the eleven API abstractions.
 *
 * Lives in its own module so that a production build, which runs in HTTP
 * mode, never carries the mock services and their seed catalog in the initial
 * bundle. `resolveDataLayer()` imports this file only when the environment
 * asks for mock mode; unit tests import it directly.
 */
export function provideMockDataLayer(): Provider[] {
  return bind({
    catalog: MockCatalogApiService,
    product: MockProductApiService,
    cart: MockCartApiService,
    checkout: MockCheckoutApiService,
    payment: MockPaymentApiService,
    order: MockOrderApiService,
    fulfillment: MockFulfillmentApiService,
    customer: MockCustomerApiService,
    promotion: MockPromotionApiService,
    review: MockReviewApiService,
    support: MockSupportApiService,
  });
}
