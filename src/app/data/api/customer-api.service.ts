import { Observable } from 'rxjs';
import { AuthState, Customer } from '../../domain';

/** Which sign-in methods the backend can actually offer right now. */
export interface AuthMethods {
  readonly password: boolean;
  /** False until Google credentials exist on the server. */
  readonly google: boolean;
  readonly emailCode: boolean;
  /**
   * Whether a reset link can actually be delivered. Absent on older servers,
   * which the client reads as "yes".
   */
  readonly passwordReset?: boolean;
}

/**
 * Customer identity.
 *
 * SECURITY: a password is passed straight to the backend over TLS and is never
 * held anywhere on the client. It is not written to `localStorage`, not kept in
 * a service field, and not logged. The backend hashes it with scrypt and the
 * database refuses to store anything that is not a hash.
 *
 * An earlier revision of this file had no password method at all, on the
 * reasoning that the frontend should never touch one. Real accounts were added
 * later as a product requirement, so the rule became the narrower and more
 * accurate one above: transmitting a password to authenticate is ordinary;
 * storing or logging one is not.
 *
 * Google sign-in deliberately has no method here. It is a browser redirect to
 * the backend, which owns the exchange, so no token ever reaches this code.
 */
export abstract class CustomerApiService {
  abstract getAuthState(): Observable<AuthState>;

  /** What the server supports, so the UI never offers a button that cannot work. */
  abstract getAuthMethods(): Observable<AuthMethods>;

  /** `displayName` is optional; the server stores null when it is absent. */
  abstract register(email: string, password: string, displayName?: string): Observable<void>;
  abstract login(email: string, password: string): Observable<AuthState>;

  abstract requestPasswordReset(email: string): Observable<void>;
  abstract resetPassword(token: string, password: string): Observable<AuthState>;
  abstract changePassword(currentPassword: string, newPassword: string): Observable<void>;

  /** The existing one-time code, kept as a recovery route. */
  abstract requestEmailSignIn(email: string): Observable<void>;

  abstract updateProfile(patch: Partial<Pick<Customer, 'displayName' | 'phone' | 'preferredLocale' | 'preferredRegion'>>): Observable<Customer>;
  abstract signOut(): Observable<void>;

  /** Records a deletion request. Not an immediate erase; orders are retained. */
  abstract requestAccountDeletion(): Observable<void>;
}
