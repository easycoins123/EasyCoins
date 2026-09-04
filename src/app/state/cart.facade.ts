import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { AnalyticsEvent, AnalyticsService } from '../core/analytics';
import { NotificationService } from '../core/error';
import {
  AddToCartRequest, Cart, CartBenefits, CartIssue, CartItem, CartItemId, CartValidationResult,
  Money, computeTotals, localized, toAppError,
} from '../domain';
import { CartApiService } from '../data/api';
import { CartStorageService } from './cart-storage.service';

/**
 * Cart state for the whole application.
 *
 * The facade owns an immutable signal of cart state; components read it and call
 * intent methods. Every mutation produces a new array so `OnPush` components
 * update reliably, and every mutation is persisted.
 *
 * The locally held prices are display state. `validate()` asks the API to
 * re-price the cart against the catalog and is called before checkout — the
 * frontend never decides what a customer pays.
 */
@Injectable({ providedIn: 'root' })
export class CartFacade {
  private readonly api = inject(CartApiService);
  private readonly storage = inject(CartStorageService);
  private readonly notifications = inject(NotificationService);
  private readonly analytics = inject(AnalyticsService);

  private readonly itemsSignal = signal<readonly CartItem[]>(this.storage.load());
  private readonly couponSignal = signal<string | undefined>(undefined);

  /**
   * The discount the server calculated for the applied coupon.
   *
   * Held separately from the code because the code is not a price. The totals
   * used to be computed from the items alone, so a coupon could be accepted,
   * announced with a success toast and shown as applied while every figure on
   * the page, and the order that followed, stayed at full price. Only a value
   * the server returned is ever stored here.
   */
  private readonly discountSignal = signal<Money | undefined>(undefined);
  private readonly busySignal = signal(false);
  private readonly issuesSignal = signal<readonly CartIssue[]>([]);

  /**
   * The earned reward the customer chose, and the server's decision about it.
   *
   * The choice is the customer's; whether it applies, and what it does to the
   * total, is the server's, read back from every re-pricing. A reward the
   * server set aside stays chosen so it can apply once the basket qualifies,
   * and the reason is shown from `benefits.rejected` in the meantime.
   */
  private readonly rewardSignal = signal<string | undefined>(undefined);
  private readonly benefitsSignal = signal<CartBenefits | undefined>(undefined);

  readonly items = this.itemsSignal.asReadonly();
  readonly busy = this.busySignal.asReadonly();
  readonly issues = this.issuesSignal.asReadonly();
  readonly rewardId = this.rewardSignal.asReadonly();
  readonly benefits = this.benefitsSignal.asReadonly();
  readonly totals = computed(() => computeTotals(this.itemsSignal(), this.discountSignal()));
  readonly itemCount = computed(() => this.totals().itemCount);
  readonly isEmpty = computed(() => this.itemsSignal().length === 0);

  /** Coins the basket delivers, launch bonus and applied reward included; undefined when no line is coins. */
  readonly totalCoins = computed<number | undefined>(() => {
    const items = this.itemsSignal();
    if (!items.some((item) => (item.coins ?? 0) > 0)) {
      return undefined;
    }
    const lines = items.reduce((sum, item) => sum + (item.coins ?? 0) + (item.bonusCoins ?? 0), 0);
    return lines + (this.benefitsSignal()?.rewardCoins ?? 0);
  });

  readonly cart = computed<Cart>(() => ({
    id: 'local-cart',
    items: this.itemsSignal(),
    totals: this.totals(),
    couponCode: this.couponSignal(),
    rewardId: this.rewardSignal(),
    benefits: this.benefitsSignal(),
    updatedAt: new Date().toISOString(),
  }));

  /**
   * Adds an offer to the cart. The line is built by the API from the offer id, so
   * the component never assembles a price.
   */
  add(request: AddToCartRequest): Observable<CartItem | null> {
    this.busySignal.set(true);
    return this.api.createItem(request).pipe(
      tap((item) => {
        this.mergeItem(item);
        this.busySignal.set(false);
        this.analytics.track(AnalyticsEvent.AddToCart, {
          offerId: item.offerId,
          productId: item.productId,
          quantity: item.quantity,
          priceMinor: item.unitPrice.amountMinor,
        });
        this.notifications.success(localized('הפריט נוסף לעגלה.', 'Added to your cart.'));
      }),
      catchError((error: unknown) => {
        this.busySignal.set(false);
        this.notifications.error(toAppError(error));
        return of(null);
      }),
    );
  }

  updateQuantity(itemId: CartItemId, quantity: number): void {
    if (quantity <= 0) {
      this.remove(itemId);
      return;
    }
    this.commit(this.itemsSignal().map((item) => (item.id === itemId
      ? { ...item, quantity, totalPrice: { ...item.unitPrice, amountMinor: item.unitPrice.amountMinor * quantity } }
      : item)));
  }

  remove(itemId: CartItemId): void {
    const removed = this.itemsSignal().find((item) => item.id === itemId);
    this.commit(this.itemsSignal().filter((item) => item.id !== itemId));
    if (removed) {
      this.analytics.track(AnalyticsEvent.RemoveFromCart, {
        offerId: removed.offerId,
        productId: removed.productId,
        quantity: removed.quantity,
      });
    }
  }

  clear(): void {
    this.clearCoupon();
    this.rewardSignal.set(undefined);
    this.benefitsSignal.set(undefined);
    this.issuesSignal.set([]);
    this.commit([], false);
  }

  /** Drops the coupon and the discount together; one without the other lies. */
  private clearCoupon(): void {
    this.couponSignal.set(undefined);
    this.discountSignal.set(undefined);
  }

  /**
   * Chooses an earned reward for this order and asks the server to price it.
   *
   * Resolves to whether the reward applied. When it did not, the server's
   * reason is shown and the choice is kept, so the reward applies by itself
   * once the basket qualifies (a larger order, a coin line).
   */
  applyReward(rewardId: string): Observable<boolean> {
    this.rewardSignal.set(rewardId);
    return this.validate().pipe(
      tap((result) => {
        const rejected = result?.cart.benefits?.rejected.find((benefit) => benefit.kind === 'REWARD');
        if (rejected) {
          this.notifications.info(rejected.reason);
        }
      }),
      map((result) => result?.cart.benefits?.rewardId === rewardId),
    );
  }

  /** Lets go of the chosen reward and re-prices without it. */
  clearReward(): void {
    if (!this.rewardSignal()) {
      return;
    }
    this.rewardSignal.set(undefined);
    this.benefitsSignal.set(undefined);
    if (this.itemsSignal().length > 0) {
      this.validate().subscribe();
    } else {
      this.discountSignal.set(undefined);
    }
  }

  applyCoupon(code: string): Observable<boolean> {
    this.busySignal.set(true);
    return new Observable<boolean>((subscriber) => {
      const subscription = this.api.applyCoupon(this.cart(), code).subscribe({
        next: (application) => {
          this.busySignal.set(false);
          if (application.applied) {
            this.couponSignal.set(application.code);
            this.discountSignal.set(application.discount);
            this.notifications.success(application.message);
          } else {
            this.clearCoupon();
            this.notifications.info(application.message);
          }
          subscriber.next(application.applied);
          subscriber.complete();
        },
        error: (error: unknown) => {
          this.busySignal.set(false);
          this.notifications.error(toAppError(error));
          subscriber.next(false);
          subscriber.complete();
        },
      });
      return () => subscription.unsubscribe();
    });
  }

  /** Server-side re-pricing. Adopts whatever the API returns as the new cart. */
  validate(): Observable<CartValidationResult | null> {
    this.busySignal.set(true);
    return this.api.validate(this.cart()).pipe(
      tap((result) => {
        this.busySignal.set(false);
        this.issuesSignal.set(result.issues);
        this.commit(result.cart.items, false);
        // The server's discount is the authoritative one. Adopting only the
        // items, as this used to, meant a re-price could correct every line and
        // still leave a stale discount on screen. The stacking decision comes
        // with it, so the cart can say which benefit is on and which is not.
        this.discountSignal.set(result.cart.totals.discount);
        this.couponSignal.set(result.cart.couponCode);
        this.benefitsSignal.set(result.cart.benefits);
      }),
      catchError((error: unknown) => {
        this.busySignal.set(false);
        this.notifications.error(toAppError(error));
        return of(null);
      }),
    );
  }

  private mergeItem(incoming: CartItem): void {
    const existing = this.itemsSignal().find((item) => item.offerId === incoming.offerId);
    if (!existing) {
      this.commit([...this.itemsSignal(), incoming]);
      return;
    }
    const quantity = existing.quantity + incoming.quantity;
    this.commit(this.itemsSignal().map((item) => (item.id === existing.id
      ? { ...item, quantity, totalPrice: { ...item.unitPrice, amountMinor: item.unitPrice.amountMinor * quantity } }
      : item)));
  }

  /**
   * Writes the lines and, unless told otherwise, re-checks the coupon.
   *
   * A discount is a function of the basket, so changing the basket can make it
   * invalid: `LAUNCH10` needs a hundred shekels, and removing a line can drop
   * the cart below that. Re-asking the server keeps the figure on screen true
   * instead of leaving a discount that only disappears at checkout.
   *
   * `recheck` is false when the caller has just adopted the server's own
   * totals, which would otherwise ask the same question twice.
   */
  private commit(items: readonly CartItem[], recheck = true): void {
    this.itemsSignal.set(items);
    this.storage.save(items);

    if (!recheck) {
      return;
    }
    if (this.rewardSignal()) {
      // A reward's effect depends on the basket (a minimum, a coin line), so
      // the whole decision is re-asked; the coupon is part of that answer.
      this.recheckBenefits();
      return;
    }
    const code = this.couponSignal();
    if (code) {
      this.recheckCoupon(code);
    }
  }

  /** Silently re-prices after the basket changed while a reward is chosen. */
  private recheckBenefits(): void {
    if (this.itemsSignal().length === 0) {
      this.discountSignal.set(undefined);
      this.benefitsSignal.set(undefined);
      return;
    }
    this.api.validate(this.cart()).subscribe({
      next: (result) => {
        this.discountSignal.set(result.cart.totals.discount);
        this.couponSignal.set(result.cart.couponCode);
        this.benefitsSignal.set(result.cart.benefits);
      },
      error: () => {
        this.discountSignal.set(undefined);
        this.benefitsSignal.set(undefined);
      },
    });
  }

  /**
   * Silently re-applies the current coupon after the basket changed.
   *
   * Silent on purpose: the customer did not just type a code, so a toast here
   * would be noise. If it no longer qualifies the discount is dropped, and the
   * total they see corrects itself.
   */
  private recheckCoupon(code: string): void {
    this.api.applyCoupon(this.cart(), code).subscribe({
      next: (application) => {
        if (application.applied) {
          this.discountSignal.set(application.discount);
        } else {
          this.clearCoupon();
        }
      },
      error: () => this.clearCoupon(),
    });
  }
}
