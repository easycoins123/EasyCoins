import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, combineLatest, timer } from 'rxjs';
import { catchError, map, shareReplay, switchMap, takeWhile } from 'rxjs/operators';

import { AnalyticsEvent, AnalyticsService } from '../../core/analytics';
import { LocalizePipe } from '../../core/i18n';
import {
  AppError, AppErrorKind, Fulfillment, Order, OrderStatus, isTerminalOrderStatus, toAppError,
} from '../../domain';
import { CatalogFacade, OrderFacade } from '../../state';
import {
  DeliveryPayloadComponent, ErrorStateComponent, FulfillmentBadgeComponent, MoneyPipe,
  OrderStatusTimelineComponent, PlatformBadgeComponent, RegionBadgeComponent, IconComponent,
} from '../../ui';

/** How often a still-moving order re-checks its status. */
const POLL_INTERVAL_MS = 2500;

/**
 * One page serves /order/:id, /order/:id/success and /order/:id/status, because
 * they show the same thing: where the order stands and what was delivered. The
 * success variant only adds a confirmation banner.
 */
@Component({
  selector: 'tt-order-status-page',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe, MoneyPipe,
    OrderStatusTimelineComponent, DeliveryPayloadComponent, FulfillmentBadgeComponent,
    PlatformBadgeComponent, RegionBadgeComponent, ErrorStateComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section">
      <ng-container *ngIf="error() as appError; else content">
        <!--
          A missing order is expected in this build: the mock backend keeps orders
          in memory, so a hard reload or a new tab cannot find them. That is a
          different situation from a real failure and gets its own explanation.
        -->
        <div class="tt-card tt-card--pad missing" *ngIf="isMissing(appError); else realError">
          <h1>ההזמנה אינה זמינה בדפדפן הזה</h1>
          <p class="tt-muted">
            האתר נמצא בפיתוח וההזמנות נשמרות בזיכרון הדפדפן בלבד, ולכן רענון הדף או פתיחה בכרטיסייה
            אחרת מאבדים אותן. בגרסה עם שרת, קישור ההזמנה יעבוד מכל מכשיר.
          </p>
          <div class="tt-row">
            <a class="tt-btn tt-btn--primary" routerLink="/store">חזרה לחנות</a>
            <a class="tt-btn tt-btn--ghost" routerLink="/support">פנייה לתמיכה</a>
          </div>
        </div>

        <ng-template #realError>
          <tt-error-state [error]="appError" (retry)="retry()"
                          title="לא הצלחנו לטעון את ההזמנה"></tt-error-state>
        </ng-template>
      </ng-container>

      <ng-template #content>
        <ng-container *ngIf="vm$ | async as vm; else loading">
          <div class="tt-alert tt-alert--success banner" *ngIf="celebrate">
            <span class="banner__glyph" aria-hidden="true"><tt-icon name="check" [size]="20"></tt-icon></span>
            <span>
              <strong>ההזמנה התקבלה</strong>
              <span class="tt-faint">אישור נשלח לכתובת {{ vm.order.contactEmail }}. זה הכרטיס שלכם, ומספר ההזמנה מודפס עליו.</span>
            </span>
          </div>

          <header class="tt-head tt-head--tight">
            <span class="tt-eyebrow">הזמנה {{ vm.order.reference }}</span>
            <h1>{{ heading(vm.order.status) }}</h1>
            <p class="tt-head__lede" *ngIf="vm.order.statusMessage">{{ vm.order.statusMessage | t }}</p>
          </header>

          <div class="layout">
            <section>
              <h2>סטטוס</h2>
              <tt-order-status-timeline [status]="vm.order.status"></tt-order-status-timeline>

              <h2>הפריטים שלכם</h2>
              <ul class="lines">
                <li class="tt-card tt-card--pad" *ngFor="let item of vm.order.items">
                  <div class="line-head">
                    <strong>{{ item.displayName | t }} · {{ item.displayVariantName | t }}</strong>
                    <span>{{ item.totalPrice | money }}</span>
                  </div>
                  <div class="tt-row">
                    <tt-platform-badge [platform]="vm.lookups.platforms.get(item.platformId)"></tt-platform-badge>
                    <tt-region-badge [region]="vm.lookups.regions.get(item.regionId)"></tt-region-badge>
                    <tt-fulfillment-badge [descriptor]="vm.lookups.fulfillment.get(item.fulfillmentMethod)">
                    </tt-fulfillment-badge>
                  </div>
                  <tt-delivery-payload [fulfillment]="fulfillmentFor(vm.order, item.id)"></tt-delivery-payload>
                </li>
              </ul>
            </section>

            <aside class="tt-ticket tt-ticket--gold summary">
              <div class="tt-ticket__main summary__main">
              <p class="tt-ticket__eyebrow"><span>כרטיס · ההזמנה שלך</span><span class="tt-numeric">{{ vm.order.reference }}</span></p>
              <h2>סיכום</h2>
              <div class="row"><span>סכום ביניים</span><span>{{ vm.order.totals.subtotal | money }}</span></div>
              <div class="row" *ngIf="vm.order.totals.discount.amountMinor > 0">
                <span>הנחה</span><span>−{{ vm.order.totals.discount | money }}</span>
              </div>
              <div class="row total"><span>שולם</span><span>{{ vm.order.totals.total | money }}</span></div>
              <a class="tt-btn tt-btn--ghost tt-btn--block" routerLink="/support">צריך עזרה?</a>
              <a class="tt-btn tt-btn--quiet tt-btn--block" routerLink="/store">המשך קנייה</a>
              </div>
              <div class="tt-ticket__stub">
                <span class="tt-ticket__tally"></span>
                <span class="summary__stub tt-numeric">הזמנה {{ vm.order.reference }}</span>
              </div>
            </aside>
          </div>
        </ng-container>
      </ng-template>

      <ng-template #loading>
        <div class="tt-stack">
          <div class="tt-skeleton" style="height:28px;width:40%"></div>
          <div class="tt-skeleton" style="height:200px"></div>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .missing { max-inline-size: 620px; }
    .missing h1 { font-size: var(--tt-text-xl); }
    .banner { margin-block-end: var(--tt-space-5); align-items: center; }
    .banner span span { display: block; }
    .banner__glyph { display: grid; place-items: center; flex: none; inline-size: 40px; block-size: 40px; border-radius: 50%; background: var(--tt-success); color: #062814; }
    .summary__main { display: flex; flex-direction: column; gap: var(--tt-space-3); padding: var(--tt-space-5); }
    .summary__stub { font-size: var(--tt-caption); font-weight: 700; color: var(--tt-text-muted); }
    .layout { display: grid; gap: var(--tt-space-5); align-items: start; }
    @media (min-width: 900px) { .layout { grid-template-columns: 1fr 300px; } }
    h2 { font-size: var(--tt-text-lg); margin-block: var(--tt-space-5) var(--tt-space-3); }
    section h2:first-child { margin-block-start: 0; }
    .lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--tt-space-3); }
    .line-head { display: flex; justify-content: space-between; gap: var(--tt-space-3); margin-block-end: var(--tt-space-2); }
    .summary h2 { margin-block-start: 0; }
    .row { display: flex; justify-content: space-between; font-size: var(--tt-text-sm); margin-block-end: var(--tt-space-2); }
    .row.total { font-weight: 700; font-size: var(--tt-text-md); padding-block-start: var(--tt-space-2); border-block-start: 1px solid var(--tt-border); margin-block-end: var(--tt-space-4); }
  `],
})
export class OrderStatusPage {
  private readonly route = inject(ActivatedRoute);
  private readonly orders = inject(OrderFacade);
  private readonly catalog = inject(CatalogFacade);
  private readonly analytics = inject(AnalyticsService);

  readonly error = signal<AppError | undefined>(undefined);
  readonly celebrate = this.route.snapshot.data['celebrate'] === true;

  /**
   * Polls while the order is still moving.
   *
   * Manual fulfillment completes asynchronously, so without this the customer
   * would sit on "being prepared" until they reloaded. Polling stops as soon as
   * the order reaches a terminal status, so a delivered order costs nothing.
   */
  readonly vm$ = this.route.paramMap.pipe(
    map((params) => params.get('orderId') ?? ''),
    switchMap((orderId) => timer(0, POLL_INTERVAL_MS).pipe(
      switchMap(() => combineLatest([this.orders.order(orderId), this.catalog.lookups$])),
      takeWhile(([order]) => !isTerminalOrderStatus(order.status), true),
    )),
    map(([order, lookups]) => ({ order, lookups })),
    catchError((error: unknown) => {
      this.error.set(toAppError(error));
      return EMPTY;
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor() {
    this.analytics.track(AnalyticsEvent.OrderCompleted, { celebrate: this.celebrate });
  }

  heading(status: OrderStatus): string {
    switch (status) {
      case OrderStatus.Fulfilled:
        return 'ההזמנה סופקה';
      case OrderStatus.FulfillmentProcessing:
      case OrderStatus.Processing:
        return 'ההזמנה בהכנה';
      case OrderStatus.PendingPayment:
        return 'ממתין לתשלום';
      case OrderStatus.Failed:
        return 'ההזמנה נעצרה';
      case OrderStatus.Cancelled:
        return 'ההזמנה בוטלה';
      case OrderStatus.Refunded:
        return 'בוצע החזר כספי';
      default:
        return 'סטטוס ההזמנה';
    }
  }

  /** True when the order simply is not in this browser session's mock backend. */
  isMissing(error: AppError): boolean {
    return error.kind === AppErrorKind.NotFound;
  }

  fulfillmentFor(order: Order, orderItemId: string): Fulfillment | undefined {
    return order.fulfillments.find((fulfillment) => fulfillment.orderItemId === orderItemId);
  }

  /**
   * Clears the error so the view re-subscribes.
   *
   * The stream ends in catchError -> EMPTY, which completes it, so nothing
   * retries by itself. Dropping the error swaps the template back to the
   * content branch, and because the stream is shared with refCount the last
   * unsubscribe tears it down and the next subscribe runs it again. Without
   * this the error component still drew a "try again" button that did nothing
   * when pressed.
   */
  retry(): void {
    this.error.set(undefined);
  }

}
