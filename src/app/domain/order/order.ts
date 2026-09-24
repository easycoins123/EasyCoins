import {
  CustomerId, IsoDateTime, LocalizedText, Money, OfferId, OrderId, OrderItemId,
  PlatformId, ProductId, RegionId, VariantId,
} from '../common';
import { CheckoutFieldValues } from '../checkout/requirements';
import { Fulfillment, FulfillmentMethod, FulfillmentStatus } from '../fulfillment';
import { CartBenefits } from '../growth';
import { PaymentIntent } from '../payment';

export enum OrderStatus {
  Draft = 'DRAFT',
  PendingPayment = 'PENDING_PAYMENT',
  PaymentProcessing = 'PAYMENT_PROCESSING',
  Paid = 'PAID',
  Processing = 'PROCESSING',
  FulfillmentPending = 'FULFILLMENT_PENDING',
  FulfillmentProcessing = 'FULFILLMENT_PROCESSING',
  Fulfilled = 'FULFILLED',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
  RefundPending = 'REFUND_PENDING',
  Refunded = 'REFUNDED',
}

/** Ordered lifecycle used by the OrderStatusTimeline component. */
export const ORDER_STATUS_FLOW: readonly OrderStatus[] = [
  OrderStatus.PendingPayment,
  OrderStatus.PaymentProcessing,
  OrderStatus.Paid,
  OrderStatus.FulfillmentProcessing,
  OrderStatus.Fulfilled,
];

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.Fulfilled,
  OrderStatus.Failed,
  OrderStatus.Cancelled,
  OrderStatus.Refunded,
];

export interface OrderItem {
  readonly id: OrderItemId;
  readonly offerId: OfferId;
  readonly productId: ProductId;
  readonly variantId: VariantId;
  readonly platformId: PlatformId;
  readonly regionId: RegionId;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly totalPrice: Money;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly fulfillmentStatus: FulfillmentStatus;
  readonly displayName: LocalizedText;
  readonly displayVariantName: LocalizedText;
  readonly imageUrl?: string;
  /** Coins the line delivers and the launch bonus on top, from the order's own record. */
  readonly coins?: number;
  readonly bonusCoins?: number;
  /** The game edition the product belonged to when it was sold, e.g. 'fc26'. */
  readonly edition?: string;
}

export interface OrderTotals {
  readonly subtotal: Money;
  readonly discount: Money;
  readonly total: Money;
}

export interface Order {
  readonly id: OrderId;
  readonly reference: string;
  readonly customerId?: CustomerId;
  readonly contactEmail: string;
  readonly status: OrderStatus;
  readonly items: readonly OrderItem[];
  readonly totals: OrderTotals;
  readonly fulfillments: readonly Fulfillment[];
  readonly payment?: PaymentIntent;
  /** Non-credential answers to the offer's checkout requirements. */
  readonly checkoutValues: CheckoutFieldValues;
  readonly couponCode?: string;
  /** The earned reward this order used, and the coins it added to the delivery. */
  readonly rewardId?: string;
  readonly rewardCoins: number;
  /** Coins the launch welcome benefit adds to the delivery. */
  readonly campaignCoins?: number;
  /** The stacking decision frozen with the order. */
  readonly benefits: CartBenefits;
  readonly paidAt?: IsoDateTime;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly statusMessage?: LocalizedText;
}

export interface OrderStatusSnapshot {
  readonly orderId: OrderId;
  readonly status: OrderStatus;
  readonly fulfillments: readonly Fulfillment[];
  readonly updatedAt: IsoDateTime;
  readonly statusMessage?: LocalizedText;
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.includes(status);
}
