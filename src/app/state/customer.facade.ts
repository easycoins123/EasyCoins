import { Injectable, computed, inject, signal } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, switchMap, take, tap } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { AuthMethods, CustomerApiService } from '../data/api';
import { ANONYMOUS, AuthState, Customer } from '../domain';

/**
 * Where the visitor stands with the account system.
 *
 * `checking` is the honest state between page load and the first `/me`
 * answer. It exists so the header can render a neutral placeholder rather than
 * a sign-in button that flips to a name a second later.
 */
export type AuthStatus = 'checking' | 'anonymous' | 'authenticated';

export interface RegisterOutcome {
  /**
   * True when an account was created and a session issued.
   *
   * False means the server answered but issued no session, which is what it
   * does when the address already has an account. It says so to nobody, on
   * purpose: the registration form must not be an oracle for which addresses
   * are customers here.
   */
  readonly signedIn: boolean;
}

/** What the sign-in screen may offer when the server has not answered yet. */
const DEFAULT_METHODS: AuthMethods = { password: true, google: false, emailCode: false, passwordReset: false };

/** Coordinates the tabs of one browser, carrying nothing but "look again". */
const CHANNEL = 'easycoins-auth';

/**
 * The one source of truth for "who is signed in".
 *
 * The session itself lives in an httpOnly cookie the backend issues and
 * revokes; nothing here holds a token, and nothing here decides whether the
 * visitor is authenticated. This facade only asks the server and remembers the
 * answer, so every header, drawer, page and guard reads the same state at the
 * same moment.
 *
 * It refreshes on start, after every sign-in, registration and sign-out, when
 * a tab becomes visible again, and when another tab reports a change. A failed
 * `/me` is treated as anonymous: an account service that is down must never
 * stop somebody buying.
 */
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly api = inject(CustomerApiService);

  private readonly statusSignal = signal<AuthStatus>('checking');
  private readonly customerSignal = signal<Customer | null>(null);
  private readonly methodsSignal = signal<AuthMethods | null>(null);
  /** The same status as a stream, for guards and anything else that waits. */
  private readonly statusSubject = new BehaviorSubject<AuthStatus>('checking');

  readonly status = this.statusSignal.asReadonly();
  readonly status$: Observable<AuthStatus> = this.statusSubject.asObservable();
  readonly customer = this.customerSignal.asReadonly();
  /** Null until the server has said which sign-in methods it can offer. */
  readonly methods = this.methodsSignal.asReadonly();

  readonly isChecking = computed(() => this.statusSignal() === 'checking');
  readonly isAuthenticated = computed(() => this.statusSignal() === 'authenticated');

  /** What to call the customer: their name, or the part of the address before the @. */
  readonly displayName = computed(() => {
    const customer = this.customerSignal();
    if (!customer) {
      return '';
    }
    return customer.displayName?.trim() || customer.email.split('@')[0];
  });

  readonly firstName = computed(() => this.displayName().split(/\s+/)[0] ?? '');

  /** One or two letters for the avatar. Built from the name, never fetched. */
  readonly initials = computed(() => {
    const name = this.displayName();
    if (!name) {
      return '';
    }
    const words = name.split(/\s+/).filter(Boolean);
    const letters = words.length >= 2
      ? `${words[0][0]}${words[1][0]}`
      : name.slice(0, words[0]?.length === 1 ? 1 : 2);
    return letters.toUpperCase();
  });

  private channel: BroadcastChannel | null = null;
  private inFlight = false;

  constructor() {
    this.refresh();
    this.listenAcrossTabs();
  }

  /**
   * Asks the server who the caller is and records the answer.
   *
   * One request at a time: a burst of visibility events must not fan out into
   * a burst of `/me` calls.
   */
  refresh(): void {
    if (this.inFlight) {
      return;
    }
    this.inFlight = true;
    this.api.getAuthState().pipe(
      take(1),
      catchError(() => of(ANONYMOUS)),
    ).subscribe({
      next: (state) => this.apply(state),
      complete: () => { this.inFlight = false; },
      error: () => { this.inFlight = false; },
    });
  }

  /** The sign-in methods the server offers, fetched once and cached. */
  loadMethods(): Observable<AuthMethods> {
    const cached = this.methodsSignal();
    if (cached) {
      return of(cached);
    }
    return this.api.getAuthMethods().pipe(
      catchError(() => of(DEFAULT_METHODS)),
      map((methods) => ({
        ...methods,
        // Older servers do not send this field; treat their silence as "the
        // reset link works", which is what they believed.
        passwordReset: methods.passwordReset ?? methods.emailCode,
      })),
      tap((methods) => this.methodsSignal.set(methods)),
    );
  }

  login(email: string, password: string): Observable<void> {
    return this.api.login(email, password).pipe(
      tap((state) => {
        this.apply(state);
        this.notifyOtherTabs();
      }),
      map(() => undefined),
    );
  }

  /**
   * Registers, then asks the server who we are.
   *
   * The registration endpoint answers 204 whether or not it created anything,
   * so the only way to know is to ask. A session means an account was made.
   */
  register(email: string, password: string, displayName?: string): Observable<RegisterOutcome> {
    return this.api.register(email, password, displayName).pipe(
      switchMap(() => this.api.getAuthState().pipe(take(1))),
      tap((state) => {
        this.apply(state);
        this.notifyOtherTabs();
      }),
      map((state) => ({ signedIn: state.kind === 'AUTHENTICATED' })),
    );
  }

  /**
   * Signs out.
   *
   * The interface flips to anonymous immediately; the server revokes the
   * session and clears the cookie behind it. If that call fails the state is
   * re-checked, so the header never shows "signed out" over a live session.
   */
  logout(): Observable<void> {
    this.apply(ANONYMOUS);
    return this.api.signOut().pipe(
      catchError(() => {
        this.refresh();
        return of(undefined);
      }),
      tap(() => this.notifyOtherTabs()),
      map(() => undefined),
    );
  }

  /**
   * Where the Google button sends the browser.
   *
   * A full navigation to the backend, which owns the exchange and sets the
   * cookie on the way back. `returnTo` is a same-site path; the server refuses
   * anything else.
   */
  googleStartUrl(returnTo = '/account'): string {
    const base = environment.apiBaseUrl.replace(/\/+$/, '');
    return `${base}/${environment.apiVersion}/auth/google?returnTo=${encodeURIComponent(returnTo)}`;
  }

  private apply(state: AuthState): void {
    if (state.kind === 'AUTHENTICATED') {
      this.customerSignal.set(state.customer);
      this.setStatus('authenticated');
    } else {
      this.customerSignal.set(null);
      this.setStatus('anonymous');
    }
  }

  private setStatus(status: AuthStatus): void {
    this.statusSignal.set(status);
    if (this.statusSubject.value !== status) {
      this.statusSubject.next(status);
    }
  }

  /**
   * Keeps every open tab honest.
   *
   * Signing out in one tab posts a content-free ping; the others re-ask the
   * server. A tab that was hidden re-asks when it is shown again, which also
   * covers a session that expired while the laptop was closed.
   */
  private listenAcrossTabs(): void {
    if (typeof window === 'undefined') {
      return;
    }
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = () => this.refresh();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.statusSignal() !== 'checking') {
        this.refresh();
      }
    });
  }

  private notifyOtherTabs(): void {
    // The message carries nothing: the other tab asks the server itself.
    this.channel?.postMessage('changed');
  }
}
