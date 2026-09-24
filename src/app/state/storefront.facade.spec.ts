import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';

import { StorefrontApiService } from '../data/api';
import { StorefrontState } from '../domain';
import { StorefrontFacade, focusSlug } from './storefront.facade';

const FC27: StorefrontState = {
  activeEdition: 'fc27',
  editions: [
    { id: 'fc26', label: 'FC 26', productSlug: 'ea-fc-ultimate-team-coins', productId: 'prod-fc-coins', status: 'retired' },
    { id: 'fc27', label: 'FC 27', productSlug: 'fc27-coins', productId: 'prod-fc27-coins', status: 'active' },
  ],
  launch: { id: 'fc27-first-kick', live: true, name: { he: 'FIRST KICK' }, percentBps: 1000, capCoins: 100_000, minOrderMinor: 5000, eligibility: 'first-order', terms: [] },
};

class StubApi extends StorefrontApiService {
  constructor(private readonly answer: () => Observable<StorefrontState>) { super(); }
  getState(): Observable<StorefrontState> { return this.answer(); }
}

describe('StorefrontFacade', () => {
  it('leads with the active edition the server names', (done) => {
    TestBed.configureTestingModule({ providers: [{ provide: StorefrontApiService, useValue: new StubApi(() => of(FC27)) }] });
    const facade = TestBed.inject(StorefrontFacade);
    facade.focusProductSlug$.subscribe((slug) => {
      expect(slug).toBe('fc27-coins');
      expect(facade.editionLabel('fc27')).toBe('FC 27');
      done();
    });
  });

  it('falls back to the build constants when the server cannot be reached, with no launch offer', (done) => {
    TestBed.configureTestingModule({ providers: [{ provide: StorefrontApiService, useValue: new StubApi(() => throwError(() => new Error('down'))) }] });
    const facade = TestBed.inject(StorefrontFacade);
    facade.state$.subscribe((state) => {
      expect(state.activeEdition).toBe('fc26');
      expect(state.launch.live).toBeFalse();
      expect(focusSlug(state)).toBe('ea-fc-ultimate-team-coins');
      done();
    });
  });

  it('never leads with a retired edition even if it is named active', () => {
    const odd: StorefrontState = { ...FC27, activeEdition: 'fc26' };
    expect(focusSlug(odd)).toBe('fc27-coins');
  });
});
