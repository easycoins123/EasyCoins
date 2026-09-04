import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { CartFacade } from '../../state/cart.facade';

/**
 * Checkout is meaningless without a cart, so an empty one is sent back to the
 * store rather than shown a form it cannot submit.
 */
export const cartNotEmptyGuard: CanActivateFn = () => {
  const cart = inject(CartFacade);
  const router = inject(Router);

  return cart.isEmpty() ? router.createUrlTree(['/store']) : true;
};
