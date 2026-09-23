import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { CartFacade } from '../../state/cart.facade';

/**
 * Checkout is meaningless without a cart. An empty one is sent to the cart
 * page, whose empty state says so and shows the packages, rather than to a
 * form it cannot submit or to the store with no explanation.
 */
export const cartNotEmptyGuard: CanActivateFn = () => {
  const cart = inject(CartFacade);
  const router = inject(Router);

  return cart.isEmpty() ? router.createUrlTree(['/cart']) : true;
};
