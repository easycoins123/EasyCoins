import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { AnalyticsService } from '../../core/analytics';
import { OrderFacade } from '../../state';
import { AuthFacade } from '../../state/customer.facade';
import { EmptyStateComponent, MoneyPipe, SkeletonGridComponent } from '../../ui';

/**
 * Order history.
 *
 * Orders are server records owned by whoever placed them: a signed-in customer,
 * or the anonymous session of a guest. Both can read theirs here, which is why
 * the page is not behind the sign-in guard. What changes with the account state
 * is what an empty list means: a guest is invited to sign in to see orders from
 * every device, a customer is invited to shop.
 */
@Component({
  selector: 'tt-account-orders-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MoneyPipe, EmptyStateComponent, SkeletonGridComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <h1>ההזמנות שלי</h1>

      <ng-container *ngIf="orders$ | async as orders; else loading">
        <ng-container *ngIf="orders.length === 0 && !auth.isChecking()">
          <tt-empty-state *ngIf="auth.isAuthenticated(); else guest"
                          icon="box"
                          title="אין הזמנות עדיין"
                          message="ההזמנה הראשונה שלכם תופיע כאן, עם סטטוס התשלום והאספקה."
                          actionLabel="לחנות הקוינס"
                          (action)="toStore()">
          </tt-empty-state>
          <ng-template #guest>
            <tt-empty-state icon="user"
                            title="אין הזמנות להצגה"
                            message="הזמנות שבוצעו בדפדפן הזה מופיעות כאן. כדי לראות את כל ההזמנות שלכם מכל מכשיר, היכנסו לחשבון."
                            actionLabel="כניסה לחשבון"
                            (action)="toSignIn()">
            </tt-empty-state>
          </ng-template>
        </ng-container>

        <ul class="list" *ngIf="orders.length > 0">
          <li class="tt-card tt-card--pad" *ngFor="let order of orders">
            <div class="row">
              <strong>{{ order.reference }}</strong>
              <span>{{ order.totals.total | money }}</span>
            </div>
            <div class="row tt-faint">
              <span>{{ order.createdAt | date:'d MMM yyyy, HH:mm' }}</span>
              <span>{{ order.items.length }}</span>
            </div>
            <a class="tt-btn tt-btn--ghost tt-btn--sm" [routerLink]="['/account/order', order.id]">
              לצפייה בהזמנה
            </a>
          </li>
        </ul>
      </ng-container>

      <ng-template #loading><tt-skeleton-grid [count]="2"></tt-skeleton-grid></ng-template>
    </div>
  `,
  styles: [`
    h1 { margin-block-end: var(--tt-space-5); }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .row { display: flex; justify-content: space-between; gap: var(--tt-space-3); margin-block-end: var(--tt-space-2); }
  `],
})
export class AccountOrdersPage {
  private readonly orderFacade = inject(OrderFacade);
  private readonly analytics = inject(AnalyticsService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthFacade);

  readonly orders$ = this.orderFacade.orders();

  constructor() {
    this.analytics.pageView('/account/orders', 'Account orders');
  }

  toStore(): void {
    void this.router.navigateByUrl('/store');
  }

  toSignIn(): void {
    void this.router.navigate(['/account'], { queryParams: { returnTo: '/account/orders' } });
  }
}
