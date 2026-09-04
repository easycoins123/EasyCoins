/**
 * Wire types for the REST contract in docs/API-CONTRACT.md.
 *
 * These are **not** domain models, and nothing outside `data/http/mappers` may
 * import them. They describe what the backend sends, including the parts the
 * domain does not care about, and every field is typed as optional or loosely
 * where the client cannot guarantee the backend will send it.
 *
 * The point of the separation: when the backend renames a field, adds an enum
 * member or starts omitting something, exactly one mapper changes. No facade,
 * component or template is aware that the wire format moved.
 */

export interface MoneyDto {
  readonly amountMinor: number;
  readonly currency: string;
}

export interface PriceDto {
  readonly current: MoneyDto;
  readonly compareAt?: MoneyDto | null;
  readonly discountPercent?: number | null;
}

export interface LocalizedTextDto {
  readonly he: string;
  readonly en?: string | null;
}

export interface ImageDto {
  readonly url: string;
  readonly alt?: string | null;
  readonly role?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
}

export interface PageDto<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly hasMore?: boolean;
}

// --- Catalog ---------------------------------------------------------------

export interface GameDto {
  readonly id: string;
  readonly slug: string;
  readonly name: LocalizedTextDto;
  readonly publisher: string;
  readonly shortDescription: LocalizedTextDto;
  readonly platformIds?: readonly string[];
  readonly coverUrl?: string | null;
  readonly heroUrl?: string | null;
  readonly accentColor?: string | null;
  readonly active: boolean;
  readonly featured?: boolean;
  readonly sortOrder?: number;
}

export interface PlatformDto {
  readonly id: string;
  readonly kind: string;
  readonly family: string;
  readonly name: LocalizedTextDto;
  readonly shortName: LocalizedTextDto;
  readonly sortOrder?: number;
}

export interface RegionDto {
  readonly id: string;
  readonly code: string;
  readonly name: LocalizedTextDto;
  readonly currency: string;
  readonly flagEmoji?: string | null;
  readonly isRegionFree: boolean;
  readonly restrictionNotice?: LocalizedTextDto | null;
  /** ISO-3166 alpha-2 market this region maps to; informational for the UI. */
  readonly market?: string | null;
}

export interface ProductVariantDto {
  readonly id: string;
  readonly productId: string;
  readonly name: LocalizedTextDto;
  readonly sku: string;
  readonly quantityValue?: number | null;
  readonly quantityUnit?: LocalizedTextDto | null;
  readonly metadata?: Readonly<Record<string, string | number | boolean>> | null;
  readonly sortOrder?: number;
  readonly active?: boolean;
}

export interface InventoryDto {
  readonly status: string;
  readonly remaining?: number | null;
  readonly maxPerOrder?: number | null;
}

export interface CheckoutRequirementDto {
  readonly key: string;
  readonly control: string;
  readonly label: LocalizedTextDto;
  readonly hint?: LocalizedTextDto | null;
  readonly placeholder?: LocalizedTextDto | null;
  readonly required: boolean;
  readonly maxLength?: number | null;
  readonly pattern?: string | null;
  readonly options?: readonly { readonly value: string; readonly label: LocalizedTextDto }[] | null;
}

export interface OfferDto {
  readonly id: string;
  readonly productId: string;
  readonly variantId: string;
  readonly platformId: string;
  readonly regionId: string;
  readonly price: PriceDto;
  readonly inventory: InventoryDto;
  readonly fulfillmentMethod: string;
  readonly checkoutRequirements?: readonly CheckoutRequirementDto[];
  readonly terms?: LocalizedTextDto | null;
  readonly active: boolean;
}

export interface ProductDto {
  readonly id: string;
  readonly gameId: string;
  readonly slug: string;
  readonly type: string;
  readonly name: LocalizedTextDto;
  readonly shortDescription: LocalizedTextDto;
  readonly description: LocalizedTextDto;
  readonly platformIds?: readonly string[];
  readonly regionIds?: readonly string[];
  readonly images?: readonly ImageDto[];
  readonly metadata?: Readonly<Record<string, string | number | boolean>> | null;
  readonly variants?: readonly ProductVariantDto[];
  readonly fulfillmentMethods?: readonly string[];
  readonly tags?: readonly string[];
  readonly fromPrice?: PriceDto | null;
  readonly active: boolean;
  readonly featured?: boolean;
  readonly ratingAverage?: number | null;
  readonly ratingCount?: number | null;
}

export interface ProductDetailDto {
  readonly product: ProductDto;
  readonly offers: readonly OfferDto[];
}

export interface CatalogFacetsDto {
  readonly gameIds?: readonly string[];
  readonly platformIds?: readonly string[];
  readonly regionIds?: readonly string[];
  readonly types?: readonly string[];
  readonly tags?: readonly string[];
  readonly minPriceMinor?: number;
  readonly maxPriceMinor?: number;
}

// --- Cart / checkout -------------------------------------------------------

export interface CartItemDto {
  readonly id: string;
  readonly offerId: string;
  readonly productId: string;
  readonly variantId: string;
  readonly platformId: string;
  readonly regionId: string;
  readonly quantity: number;
  readonly unitPrice: MoneyDto;
  readonly totalPrice: MoneyDto;
  readonly fulfillmentMethod: string;
  readonly displayName: LocalizedTextDto;
  readonly displayVariantName: LocalizedTextDto;
  readonly imageUrl?: string | null;
  readonly addedAt?: string | null;
  readonly coins?: number | null;
  readonly bonusCoins?: number | null;
}

export interface CartTotalsDto {
  readonly subtotal: MoneyDto;
  readonly discount: MoneyDto;
  readonly total: MoneyDto;
  readonly itemCount?: number;
}

export interface AppliedBenefitDto {
  readonly kind: string;
  readonly label: LocalizedTextDto;
  readonly effect?: { readonly discountMinor?: number | null; readonly coins?: number | null } | null;
  readonly rewardId?: string | null;
  readonly couponCode?: string | null;
}

export interface RejectedBenefitDto {
  readonly kind: string;
  readonly label: LocalizedTextDto;
  readonly code: string;
  readonly reason: LocalizedTextDto;
  readonly rewardId?: string | null;
  readonly couponCode?: string | null;
}

export interface BenefitsDto {
  readonly applied?: readonly AppliedBenefitDto[] | null;
  readonly rejected?: readonly RejectedBenefitDto[] | null;
  readonly rewardId?: string | null;
  readonly rewardCoins?: number | null;
}

export interface CartDto {
  readonly id: string;
  readonly items: readonly CartItemDto[];
  readonly totals: CartTotalsDto;
  readonly couponCode?: string | null;
  readonly rewardId?: string | null;
  readonly benefits?: BenefitsDto | null;
  readonly updatedAt?: string | null;
}

export interface CartIssueDto {
  readonly code: string;
  readonly itemId?: string | null;
  readonly message: LocalizedTextDto;
}

export interface CartValidationDto {
  readonly cart: CartDto;
  readonly issues?: readonly CartIssueDto[];
  readonly valid: boolean;
}

export interface CouponApplicationDto {
  readonly applied: boolean;
  readonly code: string;
  readonly discount: MoneyDto;
  readonly message: LocalizedTextDto;
}

export interface PaymentProviderDto {
  readonly id: string;
  readonly name: LocalizedTextDto;
  readonly description: LocalizedTextDto;
  readonly icon?: string | null;
  readonly enabled: boolean;
  readonly simulated?: boolean;
}

export interface CheckoutSessionDto {
  readonly id: string;
  readonly cart: CartDto;
  readonly requirements?: readonly CheckoutRequirementDto[];
  readonly availableProviders?: readonly PaymentProviderDto[];
  readonly status?: string;
  readonly step?: string;
  readonly values?: Readonly<Record<string, string | boolean>> | null;
  readonly orderId?: string | null;
  readonly expiresAt: string;
}

export interface CheckoutSubmitDto {
  readonly session: CheckoutSessionDto;
  readonly issues?: readonly { readonly field: string; readonly message: LocalizedTextDto }[];
  readonly orderId?: string | null;
}

// --- Payment ---------------------------------------------------------------

export interface PaymentIntentDto {
  readonly id: string;
  readonly orderId: string;
  readonly provider: string;
  readonly amount: MoneyDto;
  readonly status: string;
  readonly action?: {
    readonly kind: string;
    readonly url?: string | null;
    readonly prompt?: LocalizedTextDto | null;
  } | null;
  readonly clientToken?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SimulatedInstrumentDto {
  readonly token: string;
  readonly label: LocalizedTextDto;
  readonly description: LocalizedTextDto;
  readonly expectedStatus: string;
}

export interface PaymentSessionDto {
  readonly intent: PaymentIntentDto;
  readonly availableProviders?: readonly PaymentProviderDto[];
  readonly instruments?: readonly SimulatedInstrumentDto[];
}

export interface PaymentResultDto {
  readonly intentId: string;
  readonly status: string;
  readonly orderId: string;
  readonly failureReason?: LocalizedTextDto | null;
}

// --- Orders / fulfillment --------------------------------------------------

export interface DeliveryDto {
  readonly deliveredAt: string;
  readonly payload?: {
    readonly kind: string;
    readonly code?: string | null;
    readonly redeemUrl?: string | null;
    readonly instructions?: LocalizedTextDto | null;
    readonly operatorNote?: LocalizedTextDto | null;
  } | null;
}

export interface FulfillmentDto {
  readonly id: string;
  readonly orderId: string;
  readonly orderItemId: string;
  readonly method: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly estimatedReadyAt?: string | null;
  readonly delivery?: DeliveryDto | null;
  readonly failureReason?: LocalizedTextDto | null;
}

export interface FulfillmentDescriptorDto {
  readonly method: string;
  readonly label: LocalizedTextDto;
  readonly description: LocalizedTextDto;
  readonly etaMinutesMin?: number | null;
  readonly etaMinutesMax?: number | null;
  readonly automated: boolean;
  readonly requiresCustomerAction: boolean;
}

export interface OrderItemDto {
  readonly id: string;
  readonly offerId: string;
  readonly productId: string;
  readonly variantId: string;
  readonly platformId: string;
  readonly regionId: string;
  readonly quantity: number;
  readonly unitPrice: MoneyDto;
  readonly totalPrice: MoneyDto;
  readonly fulfillmentMethod: string;
  readonly fulfillmentStatus: string;
  readonly displayName: LocalizedTextDto;
  readonly displayVariantName: LocalizedTextDto;
  readonly imageUrl?: string | null;
  readonly coins?: number | null;
  readonly bonusCoins?: number | null;
}

export interface OrderDto {
  readonly id: string;
  readonly reference: string;
  readonly customerId?: string | null;
  readonly contactEmail: string;
  readonly status: string;
  readonly items: readonly OrderItemDto[];
  readonly totals: { readonly subtotal: MoneyDto; readonly discount: MoneyDto; readonly total: MoneyDto };
  readonly fulfillments?: readonly FulfillmentDto[];
  readonly payment?: PaymentIntentDto | null;
  readonly checkoutValues?: Readonly<Record<string, string | boolean>> | null;
  readonly couponCode?: string | null;
  readonly rewardId?: string | null;
  readonly rewardCoins?: number | null;
  readonly benefits?: BenefitsDto | null;
  readonly paidAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly statusMessage?: LocalizedTextDto | null;
}

// --- Growth ----------------------------------------------------------------

export interface RewardDto {
  readonly id: string;
  readonly source: string;
  readonly kind: string;
  readonly value: number;
  readonly title: LocalizedTextDto;
  readonly status: string;
  readonly usage?: string | null;
  readonly minOrderMinor?: number | null;
  readonly expiresAt?: string | null;
  readonly sourceOrderId?: string | null;
  readonly redeemedOrderId?: string | null;
  readonly createdAt: string;
}

export interface RewardWalletDto {
  readonly available?: readonly RewardDto[] | null;
  readonly history?: readonly RewardDto[] | null;
}

export interface EasyDropDto {
  readonly orderId: string;
  readonly tier: string;
  readonly tierName: LocalizedTextDto;
  readonly status: string;
  readonly cardCount: number;
  readonly pickedIndex?: number | null;
  readonly reward?: RewardDto | null;
  readonly issuedAt: string;
  readonly revealedAt?: string | null;
}

export interface EasyDropEnvelopeDto {
  readonly drop?: EasyDropDto | null;
}

export interface ClubTierDto {
  readonly id: string;
  readonly name: LocalizedTextDto;
  readonly minPoints: number;
  readonly perks?: readonly LocalizedTextDto[] | null;
}

export interface FoundersDto {
  readonly enabled: boolean;
  readonly name: LocalizedTextDto;
  readonly cap: number;
  readonly taken: number;
  readonly remaining: number;
  readonly reward?: LocalizedTextDto | null;
  readonly seatNumber?: number | null;
}

export interface ReferralSummaryDto {
  readonly enabled: boolean;
  readonly code?: string | null;
  readonly path?: string | null;
  readonly friendReward: LocalizedTextDto;
  readonly referrerReward: LocalizedTextDto;
  readonly stats?: { readonly pending?: number; readonly rewarded?: number; readonly rejected?: number } | null;
  readonly monthlyCap?: number | null;
}

export interface ReferralAttachDto {
  readonly attached: boolean;
  readonly outcome: string;
  readonly friendReward?: LocalizedTextDto | null;
}

export interface ClubSummaryDto {
  readonly tier: { readonly id: string; readonly name: LocalizedTextDto; readonly index: number };
  readonly boost?: { readonly tiers: number; readonly until?: string | null } | null;
  readonly points: { readonly total: number; readonly base: number; readonly bonus: number; readonly perShekel: number };
  readonly nextTier?: { readonly id: string; readonly name: LocalizedTextDto; readonly minPoints: number; readonly pointsToGo: number; readonly percent: number } | null;
  readonly tiers?: readonly ClubTierDto[] | null;
  readonly perks?: readonly LocalizedTextDto[] | null;
  readonly orders: { readonly count: number; readonly lifetimeMinor: number; readonly lastPaidAt?: string | null };
  readonly streak: {
    readonly enabled: boolean;
    readonly count: number;
    readonly windowDays: number;
    readonly activeUntil?: string | null;
    readonly nextRewardAt?: number | null;
    readonly nextRewardTitle?: LocalizedTextDto | null;
  };
  readonly founders: FoundersDto;
  readonly rewards: RewardWalletDto;
  readonly referral: ReferralSummaryDto;
}

export interface DropDto {
  readonly id: string;
  readonly slug: string;
  readonly kind: string;
  readonly status: string;
  readonly title: LocalizedTextDto;
  readonly lede: LocalizedTextDto;
  readonly points?: readonly LocalizedTextDto[] | null;
  readonly startsAt?: string | null;
  readonly endsAt?: string | null;
  readonly reward?: { readonly title: LocalizedTextDto; readonly kind: string; readonly value: number } | null;
  readonly eligibility?: { readonly minOrderMinor?: number | null; readonly firstOrderOnly?: boolean | null } | null;
  readonly cta?: { readonly label: LocalizedTextDto; readonly link: string } | null;
  readonly remaining?: number | null;
}

export interface TrustMetricDto {
  readonly key: string;
  readonly label: LocalizedTextDto;
  readonly unit: string;
  readonly value?: number | null;
  readonly published: boolean;
  readonly sampleSize: number;
  readonly threshold: number;
}

export interface TrustSnapshotDto {
  readonly enabled: boolean;
  readonly asOf: string;
  readonly metrics?: readonly TrustMetricDto[] | null;
}

export interface CustomRulesDto {
  readonly enabled: boolean;
  readonly minCoins: number;
  readonly maxCoins: number;
  readonly stepCoins: number;
  readonly platformIds?: readonly string[] | null;
}

export interface CustomQuoteDto {
  readonly offerId: string;
  readonly productSlug: string;
  readonly variantId: string;
  readonly platformId: string;
  readonly regionId: string;
  readonly amount: number;
  readonly priceMinor: number;
  readonly currency: string;
  readonly bonus: number;
  readonly totalCoins: number;
  readonly perMillionMinor: number;
  readonly rungAmount: number;
  readonly mode: string;
  readonly rules: { readonly minCoins: number; readonly maxCoins: number; readonly stepCoins: number };
}

export interface ProgrammesDto {
  readonly easydrop: {
    readonly enabled: boolean;
    readonly cardsPerDrop: number;
    readonly expiresInDays: number;
    readonly tiers?: readonly { readonly tier: string; readonly name: LocalizedTextDto; readonly minTotalMinor: number }[] | null;
  };
  readonly easyclub: { readonly pointsPerShekel: number; readonly tiers?: readonly ClubTierDto[] | null };
  readonly founders: FoundersDto;
  readonly streak: { readonly enabled: boolean; readonly windowDays: number; readonly rewards?: readonly { readonly purchase: number; readonly title: LocalizedTextDto }[] | null };
  readonly referral: { readonly enabled: boolean; readonly friendReward: LocalizedTextDto; readonly referrerReward: LocalizedTextDto };
  readonly customCoins: CustomRulesDto;
  readonly easyback: { readonly enabled: boolean };
}

export interface SubmitReviewResultDto {
  readonly id: string;
  readonly published: boolean;
  readonly verifiedPurchase: boolean;
}

export interface OrderStatusDto {
  readonly orderId: string;
  readonly status: string;
  readonly fulfillments?: readonly FulfillmentDto[];
  readonly updatedAt: string;
  readonly statusMessage?: LocalizedTextDto | null;
}

// --- Customer / content ----------------------------------------------------

export interface CustomerDto {
  readonly id: string;
  readonly email: string;
  readonly displayName?: string | null;
  readonly phone?: string | null;
  readonly preferredLocale?: string | null;
  readonly preferredRegion?: string | null;
  readonly createdAt: string;
  readonly emailVerified?: boolean;
}

export interface MeDto {
  readonly authenticated: boolean;
  readonly customer?: CustomerDto | null;
}

export interface PromotionDto {
  readonly id: string;
  readonly slug: string;
  readonly kind: string;
  readonly title: LocalizedTextDto;
  readonly description: LocalizedTextDto;
  readonly bannerImageUrl?: string | null;
  readonly percentOff?: number | null;
  readonly amountOff?: MoneyDto | null;
  readonly gameIds?: readonly string[] | null;
  readonly productIds?: readonly string[] | null;
  readonly startsAt: string;
  readonly endsAt?: string | null;
  readonly active: boolean;
}

export interface ReviewDto {
  readonly id: string;
  readonly productId?: string | null;
  readonly authorDisplayName: string;
  readonly rating: number;
  readonly title?: string | null;
  readonly body: string;
  readonly createdAt: string;
  readonly verifiedPurchase?: boolean;
}

export interface ReviewSummaryDto {
  readonly average: number;
  readonly count: number;
  readonly distribution?: readonly number[];
}

export interface FaqEntryDto {
  readonly id: string;
  readonly topic: string;
  readonly question: LocalizedTextDto;
  readonly answer: LocalizedTextDto;
}

export interface SupportTicketDto {
  readonly id: string;
  readonly reference: string;
  readonly topic: string;
  readonly status: string;
  readonly orderId?: string | null;
  readonly contactEmail: string;
  readonly subject: string;
  readonly message: string;
  readonly createdAt: string;
}
