import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';

import { AuthFacade } from '../../state/customer.facade';

/**
 * Lets only a signed-in customer through.
 *
 * It waits for the session check to finish rather than deciding on the state
 * of the moment: on a cold load the answer is not known yet, and bouncing a
 * signed-in customer to the sign-in screen because `/me` had not returned would
 * be the bug this guard exists to prevent. An anonymous visitor is sent to the
 * account screen with the destination remembered, so signing in brings them
 * back to what they were doing.
 */
export const authRequiredGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthFacade);
  const router = inject(Router);

  return auth.status$.pipe(
    filter((status) => status !== 'checking'),
    take(1),
    map((status) => (status === 'authenticated'
      ? true
      : router.createUrlTree(['/account'], { queryParams: { returnTo: state.url } }))),
  );
};
