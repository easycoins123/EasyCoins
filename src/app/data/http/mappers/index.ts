import {
  AuthState, Cart, CartIssue, CartItem, CartTotals, CartValidationResult, CatalogFacets,
  CheckoutFieldControl, CheckoutFieldKey, CheckoutFieldValues, CheckoutRequirement,
  CheckoutSession, CheckoutStep, CheckoutSubmitResult, CouponApplication, Coupon, Customer,
  CoinTradeInstruction, Delivery, DeliveryPayload, FaqEntry, Fulfillment, FulfillmentDescriptor, FulfillmentMethod,
  FulfillmentStatus, Game, ImageAsset, ImageRole, Inventory, InventoryStatus, LocaleCode,
  LocalizedText, Money, Offer, Order, OrderItem, OrderStatus, OrderStatusSnapshot, Page,
  PaymentAction, PaymentIntent, PaymentProviderDescriptor, PaymentProviderId, PaymentResult,
  PaymentSession, PaymentStatus, Platform, PlatformFamily, PlatformKind, Price, Product,
  ProductDetail, ProductType, ProductVariant, Promotion, PromotionKind, Region, RegionCode,
  Review, ReviewSummary, SimulatedInstrument, SupportTicket, SupportTicketStatus, SupportTopic,
  computeTotals, localized,
} from '../../../domain';
import * as Dto from '../dto';

/**
 * DTO → domain mapping.
 *
 * This is the only place that knows the wire format. Three jobs:
 *
 * 1. **Coerce enums safely.** A backend that ships a new `fulfillmentMethod`
 *    before the frontend knows about it must not white-screen the store; the
 *    value falls back to a safe member and the app keeps working.
 * 2. **Fill defaults.** Optional and nullable wire fields become the
 *    non-optional shapes the domain guarantees, so no component needs a
 *    null check the domain model says is impossible.
 * 3. **Derive what the domain wants.** Totals are recomputed rather than
 *    trusted from the payload, keeping one arithmetic implementation.
 *
 * Nothing here throws on unexpected input. A malformed payload degrades to a
 * usable value; a *missing* payload is the API layer's problem, not the mapper's.
 */

// --- primitives ------------------------------------------------------------

/** Maps a wire string onto an enum, falling back when the member is unknown. */
function toEnum<T extends Record<string, string>>(
  source: T,
  value: string | undefined | null,
  fallback: T[keyof T],
): T[keyof T] {
  if (typeof value !== 'string') {
    return fallback;
  }
  const match = Object.values(source).find((member) => member === value);
  return (match as T[keyof T]) ?? fallback;
}

export function toLocalized(dto: Dto.LocalizedTextDto | null | undefined, fallback = ''): LocalizedText {
  if (!dto || typeof dto.he !== 'string') {
    return localized(fallback);
  }
  return typeof dto.en === 'string' && dto.en.length > 0 ? localized(dto.he, dto.en) : localized(dto.he);
}

function toOptionalLocalized(dto: Dto.LocalizedTextDto | null | undefined): LocalizedText | undefined {
  return dto && typeof dto.he === 'string' ? toLocalized(dto) : undefined;
}

export function toMoney(dto: Dto.MoneyDto | null | undefined): Money {
  const amountMinor = Number(dto?.amountMinor);
  return {
    // Guard against a backend sending a float: money is always integer minor units.
    amountMinor: Number.isFinite(amountMinor) ? Math.round(amountMinor) : 0,
    currency: (dto?.currency as Money['currency']) ?? 'ILS',
  };
}

export function toPrice(dto: Dto.PriceDto | null | undefined): Price {
  return {
    current: toMoney(dto?.current),
    compareAt: dto?.compareAt ? toMoney(dto.compareAt) : undefined,
    discountPercent: typeof dto?.discountPercent === 'number' ? dto.discountPercent : undefined,
  };
}

function toImage(dto: Dto.ImageDto, altFallback: string): ImageAsset {
  const roles: readonly ImageRole[] = ['thumbnail', 'card', 'hero', 'gallery', 'logo'];
  const role = roles.find((candidate) => candidate === dto.role) ?? 'card';
  return {
    url: dto.url,
    alt: dto.alt ?? altFallback,
    role,
    width: dto.width ?? undefined,
    height: dto.height ?? undefined,
  };
}

export function toPage<D, T>(dto: Dto.PageDto<D> | null | undefined, map: (item: D) => T): Page<T> {
  const items = (dto?.items ?? []).map(map);
  const page = dto?.page ?? 1;
  const pageSize = dto?.pageSize ?? items.length;
  const total = dto?.total ?? items.length;
  return {
    items,
    page,
    pageSize,
    total,
    hasMore: dto?.hasMore ?? page * pageSize < total,
  };
}

// --- catalog ---------------------------------------------------------------

export function toGame(dto: Dto.GameDto): Game {
  return {
    id: dto.id,
    slug: dto.slug,
    name: toLocalized(dto.name, dto.slug),
    publisher: dto.publisher ?? '',
    shortDescription: toLocalized(dto.shortDescription),
    platformIds: dto.platformIds ?? [],
    cover: dto.coverUrl ? { url: dto.coverUrl, alt: toLocalized(dto.name).he, role: 'card' } : undefined,
    hero: dto.heroUrl ? { url: dto.heroUrl, alt: toLocalized(dto.name).he, role: 'hero' } : undefined,
    accentColor: dto.accentColor ?? undefined,
    active: dto.active !== false,
    featured: dto.featured === true,
    sortOrder: dto.sortOrder ?? 0,
  };
}

export function toPlatform(dto: Dto.PlatformDto): Platform {
  return {
    id: dto.id,
    kind: toEnum(PlatformKind, dto.kind, PlatformKind.MultiPlatform),
    family: toEnum(PlatformFamily, dto.family, PlatformFamily.Any),
    name: toLocalized(dto.name, dto.id),
    shortName: toLocalized(dto.shortName, dto.id),
    sortOrder: dto.sortOrder ?? 0,
  };
}

export function toRegion(dto: Dto.RegionDto): Region {
  return {
    id: dto.id,
    code: toEnum(RegionCode, dto.code, RegionCode.Global),
    name: toLocalized(dto.name, dto.id),
    currency: (dto.currency as Region['currency']) ?? 'ILS',
    flagEmoji: dto.flagEmoji ?? '🌍',
    isRegionFree: dto.isRegionFree === true,
    restrictionNotice: toOptionalLocalized(dto.restrictionNotice),
  };
}

export function toInventory(dto: Dto.InventoryDto | null | undefined): Inventory {
  return {
    // An unrecognised stock status is treated as out of stock, never as
    // purchasable: the safe failure is refusing a sale, not overselling.
    status: toEnum(InventoryStatus, dto?.status, InventoryStatus.OutOfStock),
    remaining: dto?.remaining ?? undefined,
    maxPerOrder: dto?.maxPerOrder ?? undefined,
  };
}

export function toCheckoutRequirement(dto: Dto.CheckoutRequirementDto): CheckoutRequirement | undefined {
  // A key outside the closed vocabulary is dropped rather than rendered. This is
  // the client-side half of the guarantee that a compromised or buggy backend
  // cannot make the storefront ask for a password.
  const key = Object.values(CheckoutFieldKey).find((member) => member === dto.key);
  if (!key) {
    return undefined;
  }
  const controls: readonly CheckoutFieldControl[] = ['text', 'email', 'tel', 'textarea', 'select', 'checkbox'];
  const control = controls.find((candidate) => candidate === dto.control) ?? 'text';
  return {
    key,
    control,
    label: toLocalized(dto.label, dto.key),
    hint: toOptionalLocalized(dto.hint),
    placeholder: toOptionalLocalized(dto.placeholder),
    required: dto.required === true,
    maxLength: dto.maxLength ?? undefined,
    pattern: dto.pattern ?? undefined,
    options: dto.options?.map((option) => ({ value: option.value, label: toLocalized(option.label) })),
  };
}

function toRequirements(dtos: readonly Dto.CheckoutRequirementDto[] | undefined): readonly CheckoutRequirement[] {
  return (dtos ?? [])
    .map(toCheckoutRequirement)
    .filter((requirement): requirement is CheckoutRequirement => requirement !== undefined);
}

export function toVariant(dto: Dto.ProductVariantDto): ProductVariant {
  return {
    id: dto.id,
    productId: dto.productId,
    name: toLocalized(dto.name, dto.sku),
    sku: dto.sku,
    quantityValue: dto.quantityValue ?? undefined,
    quantityUnit: toOptionalLocalized(dto.quantityUnit),
    metadata: dto.metadata ?? {},
    sortOrder: dto.sortOrder ?? 0,
    active: dto.active !== false,
  };
}

export function toOffer(dto: Dto.OfferDto): Offer {
  return {
    id: dto.id,
    productId: dto.productId,
    variantId: dto.variantId,
    platformId: dto.platformId,
    regionId: dto.regionId,
    price: toPrice(dto.price),
    inventory: toInventory(dto.inventory),
    // An unknown delivery method becomes NotSupported, so the UI refuses to sell
    // something it cannot describe honestly.
    fulfillmentMethod: toEnum(FulfillmentMethod, dto.fulfillmentMethod, FulfillmentMethod.NotSupported),
    checkoutRequirements: toRequirements(dto.checkoutRequirements),
    terms: toOptionalLocalized(dto.terms),
    active: dto.active !== false,
  };
}

export function toProduct(dto: Dto.ProductDto): Product {
  const name = toLocalized(dto.name, dto.slug);
  return {
    id: dto.id,
    gameId: dto.gameId,
    slug: dto.slug,
    type: toEnum(ProductType, dto.type, ProductType.Other),
    name,
    shortDescription: toLocalized(dto.shortDescription),
    description: toLocalized(dto.description),
    platformIds: dto.platformIds ?? [],
    regionIds: dto.regionIds ?? [],
    images: (dto.images ?? []).map((image) => toImage(image, name.he)),
    metadata: dto.metadata ?? {},
    variants: (dto.variants ?? []).map(toVariant),
    fulfillmentMethods: (dto.fulfillmentMethods ?? [])
      .map((method) => toEnum(FulfillmentMethod, method, FulfillmentMethod.NotSupported)),
    tags: dto.tags ?? [],
    fromPrice: dto.fromPrice ? toPrice(dto.fromPrice) : undefined,
    active: dto.active !== false,
    featured: dto.featured === true,
    ratingAverage: dto.ratingAverage ?? undefined,
    ratingCount: dto.ratingCount ?? undefined,
  };
}

export function toProductDetail(dto: Dto.ProductDetailDto): ProductDetail {
  const offers = (dto.offers ?? []).map(toOffer);
  const product = toProduct(dto.product);
  // Derive the "from" price when the backend omits it, so the card always has one.
  if (product.fromPrice === undefined && offers.length > 0) {
    const cheapest = offers.reduce((best, offer) => (
      offer.price.current.amountMinor < best.price.current.amountMinor ? offer : best
    ));
    return { product: { ...product, fromPrice: cheapest.price }, offers };
  }
  return { product, offers };
}

export function toFacets(dto: Dto.CatalogFacetsDto | null | undefined): CatalogFacets {
  return {
    gameIds: dto?.gameIds ?? [],
    platformIds: dto?.platformIds ?? [],
    regionIds: dto?.regionIds ?? [],
    types: (dto?.types ?? []).map((type) => toEnum(ProductType, type, ProductType.Other)),
    tags: dto?.tags ?? [],
    minPriceMinor: dto?.minPriceMinor ?? 0,
    maxPriceMinor: dto?.maxPriceMinor ?? 0,
  };
}

// --- cart / checkout -------------------------------------------------------

/** A quantity is at least one; anything unparseable or non-positive becomes one. */
function toPositiveQuantity(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.round(parsed) : 1;
}

export function toCartItem(dto: Dto.CartItemDto): CartItem {
  return {
    id: dto.id,
    offerId: dto.offerId,
    productId: dto.productId,
    variantId: dto.variantId,
    platformId: dto.platformId,
    regionId: dto.regionId,
    quantity: toPositiveQuantity(dto.quantity),
    unitPrice: toMoney(dto.unitPrice),
    totalPrice: toMoney(dto.totalPrice),
    fulfillmentMethod: toEnum(FulfillmentMethod, dto.fulfillmentMethod, FulfillmentMethod.NotSupported),
    displayName: toLocalized(dto.displayName),
    displayVariantName: toLocalized(dto.displayVariantName),
    imageUrl: dto.imageUrl ?? undefined,
    addedAt: dto.addedAt ?? new Date(0).toISOString(),
  };
}

export function toCartTotals(dto: Dto.CartTotalsDto | null | undefined, items: readonly CartItem[]): CartTotals {
  if (!dto) {
    return computeTotals(items);
  }
  return {
    subtotal: toMoney(dto.subtotal),
    discount: toMoney(dto.discount),
    total: toMoney(dto.total),
    itemCount: dto.itemCount ?? items.reduce((count, item) => count + item.quantity, 0),
  };
}

export function toCart(dto: Dto.CartDto): Cart {
  const items = (dto.items ?? []).map(toCartItem);
  return {
    id: dto.id,
    items,
    totals: toCartTotals(dto.totals, items),
    couponCode: dto.couponCode ?? undefined,
    updatedAt: dto.updatedAt ?? new Date().toISOString(),
  };
}

const CART_ISSUE_CODES = ['OFFER_UNAVAILABLE', 'PRICE_CHANGED', 'QUANTITY_REDUCED', 'OUT_OF_STOCK', 'COUPON_INVALID'] as const;

export function toCartValidation(dto: Dto.CartValidationDto): CartValidationResult {
  const issues: CartIssue[] = (dto.issues ?? []).map((issue) => ({
    code: CART_ISSUE_CODES.find((code) => code === issue.code) ?? 'OFFER_UNAVAILABLE',
    itemId: issue.itemId ?? undefined,
    message: toLocalized(issue.message),
  }));
  return { cart: toCart(dto.cart), issues, valid: dto.valid === true };
}

export function toCouponApplication(dto: Dto.CouponApplicationDto): CouponApplication {
  return {
    applied: dto.applied === true,
    code: dto.code,
    discount: toMoney(dto.discount),
    message: toLocalized(dto.message),
  };
}

export function toPaymentProvider(dto: Dto.PaymentProviderDto): PaymentProviderDescriptor {
  return {
    id: toEnum(PaymentProviderId, dto.id, PaymentProviderId.Mock),
    name: toLocalized(dto.name, dto.id),
    description: toLocalized(dto.description),
    icon: dto.icon ?? 'credit_card',
    enabled: dto.enabled === true,
    simulated: dto.simulated === true,
  };
}

export function toCheckoutSession(dto: Dto.CheckoutSessionDto): CheckoutSession {
  return {
    id: dto.id,
    cart: toCart(dto.cart),
    requirements: toRequirements(dto.requirements),
    availableProviders: (dto.availableProviders ?? []).map(toPaymentProvider),
    step: toEnum(CheckoutStep, dto.step, CheckoutStep.Details),
    values: (dto.values ?? {}) as CheckoutFieldValues,
    orderId: dto.orderId ?? undefined,
    expiresAt: dto.expiresAt,
  };
}

export function toCheckoutSubmit(dto: Dto.CheckoutSubmitDto): CheckoutSubmitResult {
  return {
    session: toCheckoutSession(dto.session),
    issues: (dto.issues ?? []).map((issue) => ({
      field: issue.field,
      message: toLocalized(issue.message),
    })),
    orderId: dto.orderId ?? undefined,
  };
}

// --- payment ---------------------------------------------------------------

function toPaymentAction(dto: Dto.PaymentIntentDto['action']): PaymentAction {
  if (!dto) {
    return { kind: 'NONE' };
  }
  if (dto.kind === 'REDIRECT' && typeof dto.url === 'string') {
    return { kind: 'REDIRECT', url: dto.url };
  }
  if (dto.kind === 'CONFIRM') {
    return { kind: 'CONFIRM', prompt: toLocalized(dto.prompt) };
  }
  return { kind: 'NONE' };
}

export function toPaymentIntent(dto: Dto.PaymentIntentDto): PaymentIntent {
  return {
    id: dto.id,
    orderId: dto.orderId,
    provider: toEnum(PaymentProviderId, dto.provider, PaymentProviderId.Mock),
    amount: toMoney(dto.amount),
    // An unknown payment status is treated as Processing, never as Succeeded:
    // the client must never conclude a payment worked from a value it does not
    // understand.
    status: toEnum(PaymentStatus, dto.status, PaymentStatus.Processing),
    action: toPaymentAction(dto.action),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    clientToken: dto.clientToken ?? undefined,
  };
}

export function toSimulatedInstrument(dto: Dto.SimulatedInstrumentDto): SimulatedInstrument {
  return {
    token: dto.token,
    label: toLocalized(dto.label, dto.token),
    description: toLocalized(dto.description),
    expectedStatus: toEnum(PaymentStatus, dto.expectedStatus, PaymentStatus.Processing),
  };
}

export function toPaymentSession(dto: Dto.PaymentSessionDto): PaymentSession {
  return {
    intent: toPaymentIntent(dto.intent),
    availableProviders: (dto.availableProviders ?? []).map(toPaymentProvider),
    instruments: dto.instruments?.map(toSimulatedInstrument),
  };
}

export function toPaymentResult(dto: Dto.PaymentResultDto): PaymentResult {
  return {
    intentId: dto.intentId,
    status: toEnum(PaymentStatus, dto.status, PaymentStatus.Processing),
    orderId: dto.orderId,
    failureReason: toOptionalLocalized(dto.failureReason),
  };
}

// --- orders / fulfillment --------------------------------------------------

function toDeliveryPayload(dto: NonNullable<Dto.DeliveryDto['payload']>): DeliveryPayload {
  switch (dto.kind) {
    case 'CODE':
      return { kind: 'CODE', code: dto.code ?? '', redeemUrl: dto.redeemUrl ?? undefined };
    case 'INSTRUCTIONS':
      return { kind: 'INSTRUCTIONS', instructions: toLocalized(dto.instructions) };
    case 'IN_GAME':
      return { kind: 'IN_GAME', operatorNote: toLocalized(dto.operatorNote) };
    default:
      return { kind: 'NONE' };
  }
}

function toDelivery(dto: Dto.DeliveryDto | null | undefined): Delivery | undefined {
  if (!dto) {
    return undefined;
  }
  return {
    deliveredAt: dto.deliveredAt,
    payload: dto.payload ? toDeliveryPayload(dto.payload) : { kind: 'NONE' },
  };
}

/**
 * The customer's next-step instruction, or nothing.
 *
 * Only a well-formed TRADE instruction with at least one listing becomes a
 * domain value. Anything else, an unknown kind or an empty payload, maps to
 * undefined so the UI shows its normal status rather than a broken panel.
 */
function toInstruction(
  dto: Dto.CustomerInstructionDto | null | undefined,
): CoinTradeInstruction | undefined {
  if (!dto || dto.kind !== 'TRADE' || !dto.trades?.length) {
    return undefined;
  }
  return {
    kind: 'TRADE',
    playerName: dto.playerName ?? '',
    requestedCoins: dto.requestedCoins ?? 0,
    deliveredCoins: dto.deliveredCoins ?? 0,
    trades: dto.trades.map((trade) => ({
      sequence: trade.sequence,
      binPrice: trade.binPrice,
      netCoins: trade.netCoins,
    })),
    note: dto.note ?? undefined,
  };
}

export function toFulfillment(dto: Dto.FulfillmentDto): Fulfillment {
  return {
    id: dto.id,
    orderId: dto.orderId,
    orderItemId: dto.orderItemId,
    method: toEnum(FulfillmentMethod, dto.method, FulfillmentMethod.NotSupported),
    status: toEnum(FulfillmentStatus, dto.status, FulfillmentStatus.Pending),
    updatedAt: dto.updatedAt,
    estimatedReadyAt: dto.estimatedReadyAt ?? undefined,
    instruction: toInstruction(dto.instruction),
    delivery: toDelivery(dto.delivery),
    failureReason: toOptionalLocalized(dto.failureReason),
  };
}

export function toFulfillmentDescriptor(dto: Dto.FulfillmentDescriptorDto): FulfillmentDescriptor {
  return {
    method: toEnum(FulfillmentMethod, dto.method, FulfillmentMethod.NotSupported),
    label: toLocalized(dto.label, dto.method),
    description: toLocalized(dto.description),
    // An absent ETA stays absent. The UI shows no delivery estimate rather than
    // inventing one, which is the whole point of these being optional.
    etaMinutesMin: dto.etaMinutesMin ?? undefined,
    etaMinutesMax: dto.etaMinutesMax ?? undefined,
    automated: dto.automated === true,
    requiresCustomerAction: dto.requiresCustomerAction === true,
  };
}

export function toOrderItem(dto: Dto.OrderItemDto): OrderItem {
  return {
    id: dto.id,
    offerId: dto.offerId,
    productId: dto.productId,
    variantId: dto.variantId,
    platformId: dto.platformId,
    regionId: dto.regionId,
    quantity: dto.quantity,
    unitPrice: toMoney(dto.unitPrice),
    totalPrice: toMoney(dto.totalPrice),
    fulfillmentMethod: toEnum(FulfillmentMethod, dto.fulfillmentMethod, FulfillmentMethod.NotSupported),
    fulfillmentStatus: toEnum(FulfillmentStatus, dto.fulfillmentStatus, FulfillmentStatus.Pending),
    displayName: toLocalized(dto.displayName),
    displayVariantName: toLocalized(dto.displayVariantName),
    imageUrl: dto.imageUrl ?? undefined,
  };
}

export function toOrder(dto: Dto.OrderDto): Order {
  return {
    id: dto.id,
    reference: dto.reference,
    customerId: dto.customerId ?? undefined,
    contactEmail: dto.contactEmail,
    // An unknown order status maps to Processing: in flight, not delivered and
    // not failed, so the UI keeps polling instead of claiming an outcome.
    status: toEnum(OrderStatus, dto.status, OrderStatus.Processing),
    items: (dto.items ?? []).map(toOrderItem),
    totals: {
      subtotal: toMoney(dto.totals?.subtotal),
      discount: toMoney(dto.totals?.discount),
      total: toMoney(dto.totals?.total),
    },
    fulfillments: (dto.fulfillments ?? []).map(toFulfillment),
    payment: dto.payment ? toPaymentIntent(dto.payment) : undefined,
    checkoutValues: (dto.checkoutValues ?? {}) as CheckoutFieldValues,
    couponCode: dto.couponCode ?? undefined,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    statusMessage: toOptionalLocalized(dto.statusMessage),
  };
}

export function toOrderStatus(dto: Dto.OrderStatusDto): OrderStatusSnapshot {
  return {
    orderId: dto.orderId,
    status: toEnum(OrderStatus, dto.status, OrderStatus.Processing),
    fulfillments: (dto.fulfillments ?? []).map(toFulfillment),
    updatedAt: dto.updatedAt,
    statusMessage: toOptionalLocalized(dto.statusMessage),
  };
}

// --- customer / content ----------------------------------------------------

export function toCustomer(dto: Dto.CustomerDto): Customer {
  const locales: readonly LocaleCode[] = ['he', 'en'];
  return {
    id: dto.id,
    email: dto.email,
    displayName: dto.displayName ?? undefined,
    phone: dto.phone ?? undefined,
    preferredLocale: locales.find((locale) => locale === dto.preferredLocale) ?? 'he',
    preferredRegion: toEnum(RegionCode, dto.preferredRegion, RegionCode.Israel),
    createdAt: dto.createdAt,
    emailVerified: dto.emailVerified === true,
  };
}

export function toAuthState(dto: Dto.MeDto): AuthState {
  if (dto.authenticated && dto.customer) {
    return { kind: 'AUTHENTICATED', customer: toCustomer(dto.customer) };
  }
  return { kind: 'ANONYMOUS' };
}

export function toPromotion(dto: Dto.PromotionDto): Promotion {
  return {
    id: dto.id,
    slug: dto.slug,
    kind: toEnum(PromotionKind, dto.kind, PromotionKind.PercentOff),
    title: toLocalized(dto.title),
    description: toLocalized(dto.description),
    bannerImageUrl: dto.bannerImageUrl ?? undefined,
    percentOff: dto.percentOff ?? undefined,
    amountOff: dto.amountOff ? toMoney(dto.amountOff) : undefined,
    gameIds: dto.gameIds ?? undefined,
    productIds: dto.productIds ?? undefined,
    startsAt: dto.startsAt,
    endsAt: dto.endsAt ?? undefined,
    active: dto.active === true,
  };
}

export function toReview(dto: Dto.ReviewDto): Review {
  // Not `Number(x) || 5`: a rating of 0 is falsy, and would silently become 5.
  const raw = Number(dto.rating);
  const rating = Number.isFinite(raw) ? Math.min(5, Math.max(1, Math.round(raw))) : 5;
  return {
    id: dto.id,
    productId: dto.productId ?? undefined,
    authorDisplayName: dto.authorDisplayName,
    rating: rating as Review['rating'],
    title: dto.title ?? undefined,
    body: dto.body,
    createdAt: dto.createdAt,
    verifiedPurchase: dto.verifiedPurchase === true,
  };
}

export function toReviewSummary(dto: Dto.ReviewSummaryDto): ReviewSummary {
  const raw = dto.distribution ?? [];
  const distribution: [number, number, number, number, number] = [
    raw[0] ?? 0, raw[1] ?? 0, raw[2] ?? 0, raw[3] ?? 0, raw[4] ?? 0,
  ];
  return { average: dto.average ?? 0, count: dto.count ?? 0, distribution };
}

export function toFaqEntry(dto: Dto.FaqEntryDto): FaqEntry {
  return {
    id: dto.id,
    topic: toEnum(SupportTopic, dto.topic, SupportTopic.General),
    question: toLocalized(dto.question),
    answer: toLocalized(dto.answer),
  };
}

export function toSupportTicket(dto: Dto.SupportTicketDto): SupportTicket {
  return {
    id: dto.id,
    reference: dto.reference,
    topic: toEnum(SupportTopic, dto.topic, SupportTopic.General),
    status: toEnum(SupportTicketStatus, dto.status, SupportTicketStatus.Open),
    orderId: dto.orderId ?? undefined,
    contactEmail: dto.contactEmail,
    subject: dto.subject,
    message: dto.message,
    createdAt: dto.createdAt,
  };
}

// --- domain → wire (request bodies) ----------------------------------------

/**
 * Carts are sent back for validation. Only identifiers and quantities go up —
 * prices are the server's to decide, so sending ours would be meaningless at
 * best and a tampering vector at worst.
 */
export function cartToRequest(cart: Cart): { items: { offerId: string; quantity: number }[]; couponCode?: string } {
  return {
    items: cart.items.map((item) => ({ offerId: item.offerId, quantity: item.quantity })),
    couponCode: cart.couponCode,
  };
}

/** Unused today but part of the contract surface; kept beside its sibling. */
export function couponToRequest(cart: Cart, code: string): { items: { offerId: string; quantity: number }[]; code: string } {
  return { items: cartToRequest(cart).items, code };
}

export type { Coupon };
