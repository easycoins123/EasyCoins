import { FulfillmentId, IsoDateTime, LocalizedText, OrderId, OrderItemId } from '../common';

/**
 * How an offer actually reaches the customer. This is the honest field: nothing
 * may be labelled AutomatedApi unless a real integration exists behind it.
 */
export enum FulfillmentMethod {
  /** A pre-purchased code is released from stock right after payment. */
  DigitalCode = 'DIGITAL_CODE',
  /** A live supplier/publisher API provisions the item. Requires a real integration. */
  AutomatedApi = 'AUTOMATED_API',
  /** Payment succeeds but a human approves before delivery (fraud / KYC checks). */
  ManualReview = 'MANUAL_REVIEW',
  /** A human delivers the item; ETA is a range, not a promise of instant delivery. */
  ManualDelivery = 'MANUAL_DELIVERY',
  /** Delivered inside the game by an operator, coordinated with the customer. */
  InGameService = 'IN_GAME_SERVICE',
  /** Modelled and displayable, but we cannot currently deliver it. Not purchasable. */
  NotSupported = 'NOT_SUPPORTED',
}

/** Customer-facing description of a delivery method, including an honest ETA. */
export interface FulfillmentDescriptor {
  readonly method: FulfillmentMethod;
  readonly label: LocalizedText;
  readonly description: LocalizedText;
  /** Inclusive delivery window in minutes. Omit rather than invent a number. */
  readonly etaMinutesMin?: number;
  readonly etaMinutesMax?: number;
  /** True only when delivery is fully automated end to end. */
  readonly automated: boolean;
  /** True when the customer must supply information after paying. */
  readonly requiresCustomerAction: boolean;
}

export enum FulfillmentStatus {
  Pending = 'PENDING',
  Processing = 'PROCESSING',
  WaitingForCustomer = 'WAITING_FOR_CUSTOMER',
  Ready = 'READY',
  Delivered = 'DELIVERED',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
  Refunded = 'REFUNDED',
}

export const TERMINAL_FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = [
  FulfillmentStatus.Delivered,
  FulfillmentStatus.Failed,
  FulfillmentStatus.Cancelled,
  FulfillmentStatus.Refunded,
];

/** What the customer actually receives. Codes are only ever revealed post-payment. */
export type DeliveryPayload =
  | { readonly kind: 'CODE'; readonly code: string; readonly redeemUrl?: string }
  | { readonly kind: 'INSTRUCTIONS'; readonly instructions: LocalizedText }
  | { readonly kind: 'IN_GAME'; readonly operatorNote: LocalizedText }
  | { readonly kind: 'NONE' };

export interface Delivery {
  readonly deliveredAt: IsoDateTime;
  readonly payload: DeliveryPayload;
}

/** One transfer-market listing the customer is asked to create. Public data only. */
export interface TradeListing {
  readonly sequence: number;
  /** The exact Buy-It-Now price to enter. */
  readonly binPrice: number;
  /** Coins the customer receives from this listing, after the market tax. */
  readonly netCoins: number;
}

/**
 * What the customer must do for a coin order to be delivered.
 *
 * The "Buy the Player" method: the customer lists a named card at an exact price
 * and our account buys it, so the coins move without anyone signing into their
 * account. This is shown *before* delivery, unlike `Delivery`, because the
 * customer performs the listing. It carries a card name and a price, never a
 * credential.
 */
export interface CoinTradeInstruction {
  readonly kind: 'TRADE';
  readonly playerName: string;
  readonly requestedCoins: number;
  readonly deliveredCoins: number;
  readonly trades: readonly TradeListing[];
  readonly note?: string;
}

export interface Fulfillment {
  readonly id: FulfillmentId;
  readonly orderId: OrderId;
  readonly orderItemId: OrderItemId;
  readonly method: FulfillmentMethod;
  readonly status: FulfillmentStatus;
  readonly updatedAt: IsoDateTime;
  readonly estimatedReadyAt?: IsoDateTime;
  /** The customer's next step, present while the order waits on them. */
  readonly instruction?: CoinTradeInstruction;
  readonly delivery?: Delivery;
  /** Safe, customer-readable reason. Never a stack trace or provider payload. */
  readonly failureReason?: LocalizedText;
}

export function isTerminalFulfillment(status: FulfillmentStatus): boolean {
  return TERMINAL_FULFILLMENT_STATUSES.includes(status);
}

export function isDeliverableMethod(method: FulfillmentMethod): boolean {
  return method !== FulfillmentMethod.NotSupported;
}
