import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { AuthMethods, CustomerApiService } from '../data/api';
import { ANONYMOUS, AuthState, Customer, RegionCode } from '../domain';
import { AuthFacade } from './customer.facade';

const CUSTOMER: Customer = {
  id: 'cust_1',
  email: 'dana@example.com',
  displayName: 'דנה כהן',
  preferredLocale: 'he',
  preferredRegion: RegionCode.Israel,
  createdAt: '2026-01-01T00:00:00.000Z',
  emailVerified: true,
};

const SIGNED_IN: AuthState = { kind: 'AUTHENTICATED', customer: CUSTOMER };

/** A customer API the test steers, one answer at a time. */
class FakeCustomerApi extends CustomerApiService {
  /** What `/me` answers next. A Subject so a test can hold the answer back. */
  me = new Subject<AuthState>();
  meFails = false;
  methods: AuthMethods = { password: true, google: true, emailCode: true };
  loginResult: AuthState = SIGNED_IN;
  signOutFails = false;
  signOutCalls = 0;
  registerCalls = 0;

  getAuthState(): Observable<AuthState> {
    if (this.meFails) {
      return throwError(() => new Error('account service down'));
    }
    return this.me.asObservable();
  }
  getAuthMethods(): Observable<AuthMethods> { return of(this.methods); }
  register(): Observable<void> { this.registerCalls += 1; return of(undefined); }
  login(): Observable<AuthState> { return of(this.loginResult); }
  requestPasswordReset(): Observable<void> { return of(undefined); }
  resetPassword(): Observable<AuthState> { return of(SIGNED_IN); }
  changePassword(): Observable<void> { return of(undefined); }
  requestEmailSignIn(): Observable<void> { return of(undefined); }
  updateProfile(): Observable<Customer> { return of(CUSTOMER); }
  signOut(): Observable<void> {
    this.signOutCalls += 1;
    return this.signOutFails ? throwError(() => new Error('network')) : of(undefined);
  }
  requestAccountDeletion(): Observable<void> { return of(undefined); }
}

/**
 * The account state machine every header, drawer and guard reads from.
 *
 * What matters: nothing is claimed before the server has answered, a failed
 * check degrades to anonymous rather than blocking, sign-in and sign-out move
 * the state at once, and registration is judged by whether a session followed.
 */
describe('AuthFacade', () => {
  let api: FakeCustomerApi;
  let facade: AuthFacade;

  beforeEach(() => {
    api = new FakeCustomerApi();
    TestBed.configureTestingModule({
      providers: [{ provide: CustomerApiService, useValue: api }],
    });
    facade = TestBed.inject(AuthFacade);
  });

  it('starts by checking, and claims nothing until the server answers', () => {
    expect(facade.status()).toBe('checking');
    expect(facade.isChecking()).toBeTrue();
    expect(facade.isAuthenticated()).toBeFalse();
    expect(facade.customer()).toBeNull();
  });

  it('becomes anonymous when the server says nobody is signed in', () => {
    api.me.next(ANONYMOUS);
    expect(facade.status()).toBe('anonymous');
    expect(facade.customer()).toBeNull();
    expect(facade.displayName()).toBe('');
    expect(facade.initials()).toBe('');
  });

  it('becomes authenticated and describes the customer', () => {
    api.me.next(SIGNED_IN);
    expect(facade.status()).toBe('authenticated');
    expect(facade.isAuthenticated()).toBeTrue();
    expect(facade.customer()?.email).toBe('dana@example.com');
    expect(facade.displayName()).toBe('דנה כהן');
    expect(facade.firstName()).toBe('דנה');
    expect(facade.initials()).toBe('דכ');
  });

  it('falls back to the address when the customer has no name', () => {
    api.me.next({ kind: 'AUTHENTICATED', customer: { ...CUSTOMER, displayName: undefined } });
    expect(facade.displayName()).toBe('dana');
    expect(facade.initials()).toBe('DA');
  });

  it('treats a failed check as anonymous rather than blocking the shop', () => {
    const failing = new FakeCustomerApi();
    failing.meFails = true;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: CustomerApiService, useValue: failing }] });
    const degraded = TestBed.inject(AuthFacade);
    expect(degraded.status()).toBe('anonymous');
  });

  it('signs in and moves the state at once', () => {
    api.me.next(ANONYMOUS);
    facade.login('dana@example.com', 'correct-horse-battery').subscribe();
    expect(facade.status()).toBe('authenticated');
    expect(facade.firstName()).toBe('דנה');
  });

  it('judges a registration by whether a session followed it', () => {
    api.me.next(ANONYMOUS);
    let outcome: { signedIn: boolean } | undefined;

    facade.register('dana@example.com', 'correct-horse-battery', 'דנה').subscribe((result) => { outcome = result; });
    api.me.next(SIGNED_IN);

    expect(api.registerCalls).toBe(1);
    expect(outcome?.signedIn).toBeTrue();
    expect(facade.status()).toBe('authenticated');
  });

  it('reports a registration that issued no session without claiming success', () => {
    api.me.next(ANONYMOUS);
    let outcome: { signedIn: boolean } | undefined;

    facade.register('taken@example.com', 'correct-horse-battery').subscribe((result) => { outcome = result; });
    api.me.next(ANONYMOUS);

    expect(outcome?.signedIn).toBeFalse();
    expect(facade.status()).toBe('anonymous');
  });

  it('signs out optimistically and tells the server', () => {
    api.me.next(SIGNED_IN);
    facade.logout().subscribe();
    expect(facade.status()).toBe('anonymous');
    expect(facade.customer()).toBeNull();
    expect(api.signOutCalls).toBe(1);
  });

  it('re-checks with the server when sign-out fails, so the header cannot lie', () => {
    api.me.next(SIGNED_IN);
    api.signOutFails = true;

    facade.logout().subscribe();
    expect(facade.status()).toBe('anonymous');

    // The re-check answers "still signed in": the state follows the server.
    api.me.next(SIGNED_IN);
    expect(facade.status()).toBe('authenticated');
  });

  it('caches the sign-in methods and reads an older server\'s silence on resets as "yes"', () => {
    let first: AuthMethods | undefined;
    facade.loadMethods().subscribe((methods) => { first = methods; });
    expect(first?.google).toBeTrue();
    expect(first?.passwordReset).toBeTrue();

    api.methods = { password: true, google: false, emailCode: false };
    let second: AuthMethods | undefined;
    facade.loadMethods().subscribe((methods) => { second = methods; });
    // Cached: the second answer is the first one.
    expect(second?.google).toBeTrue();
  });

  it('builds the Google start URL against the API with a same-site return path', () => {
    expect(facade.googleStartUrl('/store')).toMatch(/\/v1\/auth\/google\?returnTo=%2Fstore$/);
    expect(facade.googleStartUrl()).toMatch(/returnTo=%2Faccount$/);
  });
});
