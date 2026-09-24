import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { StorefrontState } from '../../domain';
import { StorefrontApiService } from '../api';
import { MockBackendService } from './mock-backend.service';

/**
 * The storefront state in mock mode: FC27 on sale with the draft ladder and
 * the FIRST KICK offer live, so every screen the launch adds can be seen
 * and driven without a server. Production reads the same shape from the
 * API, where the owner decides both.
 */
export const MOCK_STOREFRONT: StorefrontState = {
  activeEdition: 'fc27',
  editions: [
    { id: 'fc26', label: 'FC 26', productSlug: 'ea-fc-ultimate-team-coins', productId: 'prod-fc-coins', status: 'retired' },
    { id: 'fc27', label: 'FC 27', productSlug: 'fc27-coins', productId: 'prod-fc27-coins', status: 'active' },
  ],
  launch: {
    id: 'fc27-first-kick',
    live: true,
    name: { he: 'FIRST KICK: הטבת הצטרפות ל-FC27', en: 'FIRST KICK: the FC27 welcome benefit' },
    percentBps: 1_000,
    capCoins: 100_000,
    minOrderMinor: 5_000,
    eligibility: 'first-order',
    startsAt: '2026-09-25T00:00:00+03:00',
    endsAt: '2026-10-31T23:59:59+03:00',
    terms: [
      { he: 'להזמנה הראשונה בלבד, לפי חשבון או כתובת אימייל.', en: 'First order only, by account or email address.' },
      { he: 'הבונוס מגיע בקוינס, יחד עם ההזמנה, ולא כהנחה.', en: 'The benefit is paid in coins with the order, not as a discount.' },
      { he: 'לא מצטרף לקוד יוצר או לקופון. מצטרף להטבה אחת מהארנק.', en: 'Does not combine with a creator code or coupon. Combines with one wallet reward.' },
    ],
  },
};

@Injectable()
export class MockStorefrontApiService extends StorefrontApiService {
  private readonly backend = inject(MockBackendService);

  getState(): Observable<StorefrontState> {
    return this.backend.respond(MOCK_STOREFRONT, 60);
  }
}
