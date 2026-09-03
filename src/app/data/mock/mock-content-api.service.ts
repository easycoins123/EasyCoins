import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  ANONYMOUS, AuthState, CreateSupportTicketRequest, Customer, FaqEntry, Page, PageRequest,
  ProductId, Promotion, RegionCode, Review, ReviewSummary, SupportTicket, SupportTicketStatus,
  paginate,
} from '../../domain';
import {
  AuthMethods, CustomerApiService, PromotionApiService, ReviewApiService, SupportApiService,
} from '../api';
import { FAQ_ENTRIES, PROMOTIONS, REVIEWS } from './content.seed';
import { MockBackendService } from './mock-backend.service';

@Injectable()
export class MockPromotionApiService extends PromotionApiService {
  private readonly backend = inject(MockBackendService);

  getActivePromotions(): Observable<readonly Promotion[]> {
    return this.backend.respond(PROMOTIONS.filter((promotion) => promotion.active));
  }
}

@Injectable()
export class MockReviewApiService extends ReviewApiService {
  private readonly backend = inject(MockBackendService);

  getReviews(page: PageRequest, productId?: ProductId): Observable<Page<Review>> {
    const filtered = productId === undefined ? REVIEWS : REVIEWS.filter((review) => review.productId === productId);
    const sorted = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.backend.respond(paginate(sorted, page));
  }

  getSummary(productId?: ProductId): Observable<ReviewSummary> {
    const filtered = productId === undefined ? REVIEWS : REVIEWS.filter((review) => review.productId === productId);
    const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    for (const review of filtered) {
      distribution[review.rating - 1] += 1;
    }
    const total = filtered.reduce((sum, review) => sum + review.rating, 0);
    return this.backend.respond<ReviewSummary>({
      average: filtered.length === 0 ? 0 : Math.round((total / filtered.length) * 10) / 10,
      count: filtered.length,
      distribution,
    });
  }
}

@Injectable()
export class MockSupportApiService extends SupportApiService {
  private readonly backend = inject(MockBackendService);

  getFaq(): Observable<readonly FaqEntry[]> {
    return this.backend.respond(FAQ_ENTRIES, 80);
  }

  createTicket(request: CreateSupportTicketRequest): Observable<SupportTicket> {
    const id = this.backend.nextId('tick');
    const ticket: SupportTicket = {
      id,
      reference: `SUP-${id.slice(-6)}`,
      topic: request.topic,
      status: SupportTicketStatus.Open,
      contactEmail: request.contactEmail,
      subject: request.subject,
      message: request.message,
      createdAt: this.backend.now(),
    };
    // Kept, so the reference number the customer is given refers to something.
    this.backend.supportTickets.set(id, ticket);
    return this.backend.respond<SupportTicket>(ticket, 600);
  }
}

/**
 * Mock customer/auth.
 *
 * There is no password anywhere in this flow by design: sign-in is modelled as an
 * emailed one-time link, which is what the real implementation will use. The mock
 * therefore never authenticates anyone — it only records that a link was
 * requested, so the account UI can be built against a real anonymous state.
 */
@Injectable()
export class MockCustomerApiService extends CustomerApiService {
  private readonly backend = inject(MockBackendService);
  private readonly state = new BehaviorSubject<AuthState>(ANONYMOUS);

  getAuthState(): Observable<AuthState> {
    return this.state.asObservable();
  }

  /**
   * Mock mode advertises password sign-in and no Google, matching a backend with
   * no Google credentials. That way the account screen looks the same offline
   * as it does against a freshly deployed server.
   */
  getAuthMethods(): Observable<AuthMethods> {
    return this.backend.respond({ password: true, google: false, emailCode: true, passwordReset: true }, 80);
  }

  register(email: string, password: string, displayName?: string): Observable<void> {
    // The mock signs the customer straight in, which is what the real backend
    // does for a new address. The password is used to decide nothing and is not
    // retained anywhere.
    void password;
    const customer = this.customerFor(email);
    const named = displayName?.trim()
      ? { ...customer, displayName: displayName.trim() }
      : customer;
    this.state.next({ kind: 'AUTHENTICATED', customer: named });
    return this.backend.respond(undefined, 300);
  }

  login(email: string, password: string): Observable<AuthState> {
    void password;
    const next: AuthState = { kind: 'AUTHENTICATED', customer: this.customerFor(email) };
    this.state.next(next);
    return this.backend.respond(next, 300);
  }

  requestPasswordReset(email: string): Observable<void> {
    return this.backend.respond(email, 300).pipe(map(() => undefined));
  }

  resetPassword(token: string, password: string): Observable<AuthState> {
    void token;
    void password;
    const next = this.state.value;
    return this.backend.respond(next, 300);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    void currentPassword;
    void newPassword;
    return this.backend.respond(undefined, 300);
  }

  requestEmailSignIn(email: string): Observable<void> {
    return this.backend.respond(email, 500).pipe(map(() => undefined));
  }

  requestAccountDeletion(): Observable<void> {
    this.state.next(ANONYMOUS);
    return this.backend.respond(undefined, 200);
  }

  /** A minimal customer for the mock, built from the address given. */
  private customerFor(email: string): Customer {
    return {
      id: 'cust_mock',
      email,
      preferredLocale: 'he',
      preferredRegion: RegionCode.Israel,
      createdAt: new Date().toISOString(),
      emailVerified: false,
    } as Customer;
  }

  updateProfile(patch: Partial<Pick<Customer, 'displayName' | 'phone' | 'preferredLocale' | 'preferredRegion'>>): Observable<Customer> {
    const current = this.state.value;
    if (current.kind !== 'AUTHENTICATED') {
      return this.backend.respondOrNotFound<Customer>(undefined, 'Authenticated customer');
    }
    const updated: Customer = { ...current.customer, ...patch };
    this.state.next({ kind: 'AUTHENTICATED', customer: updated });
    return this.backend.respond(updated);
  }

  signOut(): Observable<void> {
    this.state.next(ANONYMOUS);
    return this.backend.respond(undefined, 60);
  }
}
