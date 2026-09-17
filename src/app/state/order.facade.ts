import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Order, OrderId, OrderStatusSnapshot } from '../domain';
import { OrderApiService } from '../data/api';

/**
 * Read side of the order lifecycle. Order state is server-owned: this facade
 * never caches or mutates it, it only asks.
 */
@Injectable({ providedIn: 'root' })
export class OrderFacade {
  private readonly api = inject(OrderApiService);

  order(orderId: OrderId): Observable<Order> {
    return this.api.getOrder(orderId);
  }

  status(orderId: OrderId): Observable<OrderStatusSnapshot> {
    return this.api.getOrderStatus(orderId);
  }

  orders(): Observable<readonly Order[]> {
    return this.api.listOrders();
  }

  /**
   * The customer confirming they listed their card. Returns the refreshed order
   * so the caller re-renders progress from the response, not from a guess.
   */
  markListed(orderId: OrderId): Observable<Order> {
    return this.api.markListed(orderId);
  }
}
