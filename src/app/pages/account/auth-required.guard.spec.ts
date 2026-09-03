import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';

import { AuthMethods, CustomerApiService } from '../../data/api';
import { ANONYMOUS, AuthState, Customer, RegionCode } from '../../domain';
import { AuthFacade } from '../../state/customer.facade';
import { authRequiredGuard } from './auth-required.guard';

const CUSTOMER: Customer = {
  id: 'cust_1',
  email: 'dana@example.com',
  preferredLocale: 'he',
  preferredRegion: RegionCode.Israel,
  createdAt: '2026-01-01T00:00:00.000Z',
  emailVerified: true,
};

class FakeCustomerApi extends CustomerApiService {
  me = new Subject<AuthState>();
  getAuthState(): Observable<AuthState> { return this.me.asObservable(); }
  getAuthMethods(): Observable<AuthMethods> { return of({ password: true, google: false, emailCode: true }); }
  register(): Observable<void> { return of(undefined); }
  login(): Observable<AuthState> { return of(ANONYMOUS); }
  requestPasswordReset(): Observable<void> { return of(undefined); }
  resetPassword(): Observable<AuthState> { return of(ANONYMOUS); }
  changePassword(): Observable<void> { return of(undefined); }
  requestEmailSignIn(): Observable<void> { return of(undefined); }
  updateProfile(): Observable<Customer> { return of(CUSTOMER); }
  signOut(): Observable<void> { return of(undefined); }
  requestAccountDeletion(): Observable<void> { return of(undefined); }
}

/**
 * The guard must never decide while the session is still being checked, must
 * let a customer through, and must send a visitor to sign in with the way back
 * remembered.
 */
describe('authRequiredGuard', () => {
  let api: FakeCustomerApi;

  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/account/security' } as RouterStateSnapshot;

  const run = (): Observable<boolean | UrlTree> =>
    TestBed.runInInjectionContext(() => authRequiredGuard(route, state)) as Observable<boolean | UrlTree>;

  beforeEach(() => {
    api = new FakeCustomerApi();
    TestBed.configureTestingModule({
      providers: [{ provide: CustomerApiService, useValue: api }],
    });
    // The facade asks `/me` the moment it exists, so it has to exist before a
    // test answers; otherwise the answer goes to nobody.
    TestBed.inject(AuthFacade);
  });

  it('waits for the session check before deciding', () => {
    let decision: boolean | UrlTree | undefined;
    run().subscribe((value) => { decision = value; });
    expect(decision).toBeUndefined();

    api.me.next({ kind: 'AUTHENTICATED', customer: CUSTOMER });
    expect(decision).toBeTrue();
  });

  it('lets a signed-in customer through', () => {
    let decision: boolean | UrlTree | undefined;
    api.me.next({ kind: 'AUTHENTICATED', customer: CUSTOMER });
    run().subscribe((value) => { decision = value; });
    expect(decision).toBeTrue();
  });

  it('sends a visitor to sign in and remembers where they were going', () => {
    let decision: boolean | UrlTree | undefined;
    api.me.next(ANONYMOUS);
    run().subscribe((value) => { decision = value; });

    expect(decision instanceof UrlTree).toBeTrue();
    const tree = decision as UrlTree;
    expect(tree.root.children['primary'].segments.map((segment) => segment.path)).toEqual(['account']);
    expect(tree.queryParams['returnTo']).toBe('/account/security');
  });
});
