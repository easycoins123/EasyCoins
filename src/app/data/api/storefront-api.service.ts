import { Observable } from 'rxjs';

import { StorefrontState } from '../../domain';

/**
 * The storefront's own state: which edition is on sale and whether a launch
 * offer is live. Read-only. Nothing here carries a price.
 */
export abstract class StorefrontApiService {
  abstract getState(): Observable<StorefrontState>;
}
