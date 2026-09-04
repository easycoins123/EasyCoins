import {
  CheckoutFieldKey,
  CheckoutRequirement,
  FulfillmentDescriptor,
  FulfillmentMethod,
  Game,
  ImageAsset,
  Inventory,
  InventoryStatus,
  Offer,
  Platform,
  PlatformFamily,
  PlatformKind,
  Product,
  ProductType,
  ProductVariant,
  Region,
  RegionCode,
  fromMajor,
  localized,
} from '../../domain';

/**
 * Seed data for the mock backend.
 *
 * Everything the storefront knows about games, platforms, regions and products
 * lives here as data. Adding EA FC 26, Fortnite or NBA 2K is an edit to this file
 * (and later, rows in a real database) — no component or service changes.
 */

// ---------------------------------------------------------------------------
// Platforms
// ---------------------------------------------------------------------------

export const PLATFORMS: readonly Platform[] = [
  {
    id: 'plat-ps5',
    kind: PlatformKind.PlayStation5,
    family: PlatformFamily.PlayStation,
    name: localized('פלייסטיישן 5', 'PlayStation 5'),
    shortName: localized('PS5', 'PS5'),
    sortOrder: 1,
  },
  {
    id: 'plat-ps4',
    kind: PlatformKind.PlayStation4,
    family: PlatformFamily.PlayStation,
    name: localized('פלייסטיישן 4', 'PlayStation 4'),
    shortName: localized('PS4', 'PS4'),
    sortOrder: 2,
  },
  {
    id: 'plat-xbox',
    kind: PlatformKind.Xbox,
    family: PlatformFamily.Xbox,
    name: localized('אקסבוקס', 'Xbox'),
    shortName: localized('Xbox', 'Xbox'),
    sortOrder: 3,
  },
  {
    id: 'plat-pc',
    kind: PlatformKind.Pc,
    family: PlatformFamily.Pc,
    name: localized('מחשב', 'PC'),
    shortName: localized('PC', 'PC'),
    sortOrder: 4,
  },
  {
    id: 'plat-mobile',
    kind: PlatformKind.Mobile,
    family: PlatformFamily.Mobile,
    name: localized('מובייל', 'Mobile'),
    shortName: localized('Mobile', 'Mobile'),
    sortOrder: 5,
  },
  {
    id: 'plat-any',
    kind: PlatformKind.MultiPlatform,
    family: PlatformFamily.Any,
    name: localized('כל הפלטפורמות', 'All platforms'),
    shortName: localized('הכול', 'All'),
    sortOrder: 6,
  },
];

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

export const REGIONS: readonly Region[] = [
  {
    id: 'reg-il',
    code: RegionCode.Israel,
    name: localized('ישראל', 'Israel'),
    currency: 'ILS',
    flagEmoji: '🇮🇱',
    isRegionFree: false,
    restrictionNotice: localized(
      'ניתן למימוש רק בחשבון שאזור החנות שלו הוא ישראל.',
      'Redeemable only on an account whose store region is Israel.',
    ),
  },
  {
    id: 'reg-us',
    code: RegionCode.UnitedStates,
    name: localized('ארצות הברית', 'United States'),
    currency: 'ILS',
    flagEmoji: '🇺🇸',
    isRegionFree: false,
    restrictionNotice: localized(
      'ניתן למימוש רק בחשבון שאזור החנות שלו הוא ארצות הברית.',
      'Redeemable only on an account whose store region is the United States.',
    ),
  },
  {
    id: 'reg-eu',
    code: RegionCode.Europe,
    name: localized('אירופה', 'Europe'),
    currency: 'ILS',
    flagEmoji: '🇪🇺',
    isRegionFree: false,
    restrictionNotice: localized(
      'ניתן למימוש רק בחשבון אירופאי.',
      'Redeemable only on a European account.',
    ),
  },
  {
    id: 'reg-global',
    code: RegionCode.Global,
    name: localized('גלובלי', 'Global'),
    currency: 'ILS',
    flagEmoji: '🌍',
    isRegionFree: true,
  },
];

// ---------------------------------------------------------------------------
// Fulfillment descriptors — the honest delivery copy
// ---------------------------------------------------------------------------

export const FULFILLMENT_DESCRIPTORS: readonly FulfillmentDescriptor[] = [
  {
    method: FulfillmentMethod.DigitalCode,
    label: localized('קוד דיגיטלי', 'Digital code'),
    description: localized(
      'הקוד נשלח למייל ומוצג בדף ההזמנה מיד לאחר אישור התשלום.',
      'The code is emailed to you and shown on the order page right after payment is approved.',
    ),
    etaMinutesMin: 0,
    etaMinutesMax: 5,
    automated: true,
    requiresCustomerAction: false,
  },
  {
    method: FulfillmentMethod.AutomatedApi,
    label: localized('אספקה אוטומטית', 'Automated delivery'),
    description: localized(
      'אספקה אוטומטית דרך ספק מקושר. שיטה זו אינה פעילה בשלב זה.',
      'Automated delivery through a connected supplier. This method is not active yet.',
    ),
    automated: true,
    requiresCustomerAction: false,
  },
  {
    method: FulfillmentMethod.ManualReview,
    label: localized('בבדיקה ידנית', 'Manual review'),
    description: localized(
      'ההזמנה עוברת בדיקה אנושית קצרה לפני האספקה.',
      'Your order goes through a short human review before delivery.',
    ),
    etaMinutesMin: 10,
    etaMinutesMax: 120,
    automated: false,
    requiresCustomerAction: false,
  },
  {
    method: FulfillmentMethod.ManualDelivery,
    label: localized('אספקה ידנית', 'Manual delivery'),
    description: localized(
      'נציג שלנו מבצע את האספקה באופן ידני ומעדכן אתכם בדף ההזמנה.',
      'A member of our team delivers this manually and updates you on the order page.',
    ),
    etaMinutesMin: 5,
    etaMinutesMax: 30,
    automated: false,
    requiresCustomerAction: true,
  },
  {
    method: FulfillmentMethod.InGameService,
    label: localized('שירות בתוך המשחק', 'In-game service'),
    description: localized(
      'השירות מתבצע בתוך המשחק בתיאום איתכם. לעולם לא נבקש סיסמה או קוד אימות.',
      'Performed inside the game in coordination with you. We will never ask for a password or a verification code.',
    ),
    etaMinutesMin: 30,
    etaMinutesMax: 240,
    automated: false,
    requiresCustomerAction: true,
  },
  {
    method: FulfillmentMethod.NotSupported,
    label: localized('לא זמין', 'Not available'),
    description: localized(
      'המוצר מוצג לצורכי מידע בלבד ואינו ניתן לרכישה כרגע.',
      'Listed for information only and cannot be purchased at the moment.',
    ),
    automated: false,
    requiresCustomerAction: false,
  },
];

// ---------------------------------------------------------------------------
// Reusable checkout requirements
// ---------------------------------------------------------------------------

const REGION_CONFIRMATION: CheckoutRequirement = {
  key: CheckoutFieldKey.RegionConfirmation,
  control: 'checkbox',
  label: localized(
    'אני מאשר/ת שאזור החשבון שלי תואם לאזור המוצר',
    'I confirm my account region matches the product region',
  ),
  hint: localized(
    'קוד שנרכש לאזור שגוי לא ניתן למימוש ולא ניתן להחזר.',
    'A code bought for the wrong region cannot be redeemed and cannot be refunded.',
  ),
  required: true,
};

const PLATFORM_ACCOUNT_HANDLE: CheckoutRequirement = {
  key: CheckoutFieldKey.PlatformAccountHandle,
  control: 'text',
  label: localized('שם המשתמש שלכם בפלטפורמה', 'Your platform username'),
  hint: localized(
    'שם המשתמש הפומבי בלבד. לעולם לא נבקש סיסמה.',
    'Public username only. We will never ask for your password.',
  ),
  placeholder: localized('לדוגמה: TopGamer_IL', 'e.g. TopGamer_IL'),
  required: true,
  maxLength: 64,
};

const GAME_PLAYER_ID: CheckoutRequirement = {
  key: CheckoutFieldKey.GamePlayerId,
  control: 'text',
  label: localized('מזהה השחקן במשחק', 'In-game player ID'),
  hint: localized(
    'המזהה הפומבי שמופיע בפרופיל שלכם במשחק.',
    'The public identifier shown on your in-game profile.',
  ),
  required: true,
  maxLength: 64,
};

const SERVICE_NOTE: CheckoutRequirement = {
  key: CheckoutFieldKey.ServiceNote,
  control: 'textarea',
  label: localized('הערות לשירות (אופציונלי)', 'Notes for the service (optional)'),
  placeholder: localized('חלון זמן מועדף, העדפות נוספות…', 'Preferred time window, other preferences…'),
  required: false,
  maxLength: 500,
};

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

const image = (url: string, alt: string, role: ImageAsset['role']): ImageAsset => ({ url, alt, role });

export const GAMES: readonly Game[] = [
  {
    id: 'game-ea-fc',
    slug: 'ea-sports-fc',
    name: localized('EA SPORTS FC', 'EA SPORTS FC'),
    publisher: 'Electronic Arts',
    shortDescription: localized(
      'מטבעות, נקודות FC ושירותי Ultimate Team.',
      'Coins, FC Points and Ultimate Team services.',
    ),
    platformIds: ['plat-ps5', 'plat-ps4', 'plat-xbox', 'plat-pc'],
    accentColor: '#00e5a0',
    active: true,
    featured: true,
    sortOrder: 1,
  },
  {
    id: 'game-playstation',
    slug: 'playstation',
    name: localized('פלייסטיישן', 'PlayStation'),
    publisher: 'Sony Interactive Entertainment',
    shortDescription: localized(
      'גיפט קארד לחנות, מנויי PlayStation Plus ותוכן דיגיטלי.',
      'Store gift cards, PlayStation Plus subscriptions and digital content.',
    ),
    platformIds: ['plat-ps5', 'plat-ps4'],
    accentColor: '#4f8cff',
    active: true,
    featured: true,
    sortOrder: 2,
  },
  {
    id: 'game-fortnite',
    slug: 'fortnite',
    name: localized('פורטנייט', 'Fortnite'),
    publisher: 'Epic Games',
    shortDescription: localized('V-Bucks לכל הפלטפורמות.', 'V-Bucks for every platform.'),
    platformIds: ['plat-any'],
    accentColor: '#a05cff',
    active: true,
    featured: true,
    sortOrder: 3,
  },
  {
    id: 'game-cod',
    slug: 'call-of-duty',
    name: localized('קול אוף דיוטי', 'Call of Duty'),
    publisher: 'Activision',
    shortDescription: localized('COD Points לכל הפלטפורמות.', 'COD Points for every platform.'),
    platformIds: ['plat-any'],
    accentColor: '#ff8a3d',
    active: true,
    featured: false,
    sortOrder: 4,
  },
  {
    id: 'game-nba2k',
    slug: 'nba-2k',
    name: localized('NBA 2K', 'NBA 2K'),
    publisher: '2K Games',
    shortDescription: localized('חבילות VC לקריירה ול-MyTEAM.', 'VC bundles for MyCAREER and MyTEAM.'),
    platformIds: ['plat-ps5', 'plat-xbox', 'plat-pc'],
    accentColor: '#ff4d6d',
    active: true,
    featured: false,
    sortOrder: 5,
  },
];

// ---------------------------------------------------------------------------
// Products, variants and offers
//
// Offers are generated from a compact declaration so that a product sold on four
// platforms in two regions does not require 8 hand-written records.
// ---------------------------------------------------------------------------

interface VariantSeed {
  readonly key: string;
  readonly nameHe: string;
  readonly nameEn: string;
  readonly quantityValue?: number;
  readonly unitHe?: string;
  readonly unitEn?: string;
  readonly priceMajor: number;
  readonly compareAtMajor?: number;
  readonly metadata?: Record<string, string | number | boolean>;
  readonly inventory?: Inventory;
}

interface ProductSeed {
  readonly id: string;
  readonly gameId: string;
  readonly slug: string;
  readonly type: ProductType;
  readonly nameHe: string;
  readonly nameEn: string;
  readonly shortHe: string;
  readonly shortEn: string;
  readonly descHe: string;
  readonly descEn: string;
  readonly platformIds: readonly string[];
  readonly regionIds: readonly string[];
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly extraRequirements: readonly CheckoutRequirement[];
  readonly tags: readonly string[];
  readonly featured: boolean;
  readonly imageUrl: string;
  readonly termsHe?: string;
  readonly termsEn?: string;
  /**
   * A star average, when one genuinely exists.
   *
   * No seeded product carries one. EASYCOINS has not taken an order yet, so any
   * figure here would be an invented claim about customers who do not exist,
   * and a rating is the single most load-bearing thing a shop can fake. The
   * field stays so real aggregates can populate it later; the product page
   * already renders nothing when it is absent.
   */
  readonly ratingAverage?: number;
  readonly ratingCount?: number;
  readonly metadata?: Record<string, string | number | boolean>;
  readonly variants: readonly VariantSeed[];
}

const IN_STOCK: Inventory = { status: InventoryStatus.InStock, maxPerOrder: 10 };

const PRODUCT_SEEDS: readonly ProductSeed[] = [
  {
    id: 'prod-fc-coins',
    gameId: 'game-ea-fc',
    slug: 'ea-fc-ultimate-team-coins',
    type: ProductType.GameCurrency,
    nameHe: 'מטבעות Ultimate Team',
    nameEn: 'Ultimate Team Coins',
    shortHe: 'מטבעות ל-EA SPORTS FC Ultimate Team',
    shortEn: 'Coins for EA SPORTS FC Ultimate Team',
    descHe: 'חבילות מטבעות ל-Ultimate Team. האספקה מתבצעת ידנית על ידי נציג, בתיאום איתכם, ללא צורך בפרטי התחברות כלשהם.',
    descEn: 'Coin bundles for Ultimate Team. Delivery is performed manually by a team member in coordination with you, and never requires any login details.',
    platformIds: ['plat-ps5', 'plat-ps4', 'plat-xbox', 'plat-pc'],
    regionIds: ['reg-global'],
    fulfillmentMethod: FulfillmentMethod.ManualDelivery,
    extraRequirements: [PLATFORM_ACCOUNT_HANDLE, SERVICE_NOTE],
    tags: ['coins', 'ultimate-team', 'popular'],
    featured: true,
    imageUrl: 'assets/products/coins.svg',
    termsHe: 'האספקה מתבצעת בתיאום מולכם. לעולם לא נבקש סיסמה, קוד אימות או קודי גיבוי.',
    termsEn: 'Delivery is coordinated with you. We will never ask for a password, a verification code or backup codes.',
    variants: [
      // Mirrors backend/prisma/seed.ts: the launch ladder with its bonus coins.
      { key: '100k', nameHe: '100K מטבעות + 10K בונוס השקה', nameEn: '100K coins + 10K launch bonus', quantityValue: 100000, unitHe: 'מטבעות', unitEn: 'coins', priceMajor: 15, metadata: { launchBonus: 10000 } },
      { key: '200k', nameHe: '200K מטבעות + 20K בונוס השקה', nameEn: '200K coins + 20K launch bonus', quantityValue: 200000, unitHe: 'מטבעות', unitEn: 'coins', priceMajor: 27, metadata: { launchBonus: 20000 } },
      { key: '250k', nameHe: '250K מטבעות + 25K בונוס השקה', nameEn: '250K coins + 25K launch bonus', quantityValue: 250000, unitHe: 'מטבעות', unitEn: 'coins', priceMajor: 31, metadata: { launchBonus: 25000 } },
      { key: '300k', nameHe: '300K מטבעות + 30K בונוס השקה', nameEn: '300K coins + 30K launch bonus', quantityValue: 300000, unitHe: 'מטבעות', unitEn: 'coins', priceMajor: 35, metadata: { launchBonus: 30000 } },
      { key: '500k', nameHe: '500K מטבעות + 50K בונוס השקה', nameEn: '500K coins + 50K launch bonus', quantityValue: 500000, unitHe: 'מטבעות', unitEn: 'coins', priceMajor: 39, metadata: { launchBonus: 50000 } },
      { key: '750k', nameHe: '750K מטבעות + 75K בונוס השקה', nameEn: '750K coins + 75K launch bonus', quantityValue: 750000, unitHe: 'מטבעות', unitEn: 'coins', priceMajor: 58, metadata: { launchBonus: 75000 } },
      { key: '1m', nameHe: '1M מטבעות + 100K בונוס השקה', nameEn: '1M coins + 100K launch bonus', quantityValue: 1000000, unitHe: 'מטבעות', unitEn: 'coins', priceMajor: 75, metadata: { launchBonus: 100000 } },
      { key: '1500k', nameHe: '1.5M מטבעות + 150K בונוס השקה', nameEn: '1.5M coins + 150K launch bonus', quantityValue: 1500000, unitHe: 'מטבעות', unitEn: 'coins', priceMajor: 109, metadata: { launchBonus: 150000 } },
      { key: '2m', nameHe: '2M מטבעות + 200K בונוס השקה', nameEn: '2M coins + 200K launch bonus', quantityValue: 2000000, unitHe: 'מטבעות', unitEn: 'coins', priceMajor: 143, metadata: { launchBonus: 200000 } },
      { key: '3m', nameHe: '3M מטבעות + 300K בונוס השקה', nameEn: '3M coins + 300K launch bonus', quantityValue: 3000000, unitHe: 'מטבעות', unitEn: 'coins', priceMajor: 209, metadata: { launchBonus: 300000 } },
      { key: '5m', nameHe: '5M מטבעות + 500K בונוס השקה', nameEn: '5M coins + 500K launch bonus', quantityValue: 5000000, unitHe: 'מטבעות', unitEn: 'coins', priceMajor: 335, metadata: { launchBonus: 500000 } },
    ],
  },
  {
    id: 'prod-fc-points',
    gameId: 'game-ea-fc',
    slug: 'ea-fc-points',
    type: ProductType.DigitalCode,
    nameHe: 'FC Points',
    nameEn: 'FC Points',
    shortHe: 'קודים דיגיטליים ל-FC Points',
    shortEn: 'Digital codes for FC Points',
    descHe: 'קוד דיגיטלי למימוש בחנות הפלטפורמה. הקוד מוצג בדף ההזמנה ונשלח למייל מיד לאחר התשלום.',
    descEn: 'A digital code redeemed in your platform store. The code appears on the order page and is emailed to you right after payment.',
    platformIds: ['plat-ps5', 'plat-xbox'],
    regionIds: ['reg-il', 'reg-eu'],
    fulfillmentMethod: FulfillmentMethod.DigitalCode,
    extraRequirements: [REGION_CONFIRMATION],
    tags: ['code', 'points'],
    featured: false,
    imageUrl: 'assets/products/points.svg',
    variants: [
      { key: '1050', nameHe: '1050 נקודות', nameEn: '1050 points', quantityValue: 1050, unitHe: 'נקודות', unitEn: 'points', priceMajor: 45 },
      { key: '2200', nameHe: '2200 נקודות', nameEn: '2200 points', quantityValue: 2200, unitHe: 'נקודות', unitEn: 'points', priceMajor: 89 },
      { key: '5900', nameHe: '5900 נקודות', nameEn: '5900 points', quantityValue: 5900, unitHe: 'נקודות', unitEn: 'points', priceMajor: 219 },
    ],
  },
  {
    id: 'prod-fc-sbc',
    gameId: 'game-ea-fc',
    slug: 'ea-fc-sbc-service',
    type: ProductType.PlayerService,
    nameHe: 'שירות השלמת SBC',
    nameEn: 'SBC completion service',
    shortHe: 'נציג משלים עבורכם אתגרי בניית קבוצה',
    shortEn: 'A team member completes Squad Building Challenges for you',
    descHe: 'נציג משלים עבורכם אתגרי SBC בתיאום מולכם. השירות אינו כרוך במסירת פרטי התחברות מכל סוג.',
    descEn: 'A team member completes Squad Building Challenges in coordination with you. The service never involves handing over login details of any kind.',
    platformIds: ['plat-ps5', 'plat-xbox', 'plat-pc'],
    regionIds: ['reg-global'],
    fulfillmentMethod: FulfillmentMethod.InGameService,
    extraRequirements: [GAME_PLAYER_ID, SERVICE_NOTE],
    tags: ['service', 'ultimate-team'],
    featured: false,
    imageUrl: 'assets/products/service.svg',
    termsHe: 'השירות מתבצע בתיאום מולכם ובנוכחותכם. לעולם לא נבקש סיסמה או קוד אימות.',
    termsEn: 'The service is performed in coordination with you. We will never ask for a password or a verification code.',
    variants: [
      { key: 'basic', nameHe: 'אתגר בודד', nameEn: 'Single challenge', priceMajor: 79 },
      { key: 'set', nameHe: 'סט אתגרים', nameEn: 'Challenge set', priceMajor: 199 },
    ],
  },
  {
    id: 'prod-ps-gift-card',
    gameId: 'game-playstation',
    slug: 'playstation-store-gift-card',
    type: ProductType.GiftCard,
    nameHe: 'גיפט קארד PlayStation Store',
    nameEn: 'PlayStation Store gift card',
    shortHe: 'קוד טעינה לארנק חנות PlayStation',
    shortEn: 'A top-up code for your PlayStation Store wallet',
    descHe: 'קוד דיגיטלי לטעינת הארנק בחנות PlayStation. שימו לב: הקוד תקף אך ורק לחשבון שאזור החנות שלו תואם לאזור המצוין במוצר.',
    descEn: 'A digital code that tops up your PlayStation Store wallet. Note: the code is valid only for an account whose store region matches the region shown on the product.',
    platformIds: ['plat-ps5', 'plat-ps4'],
    regionIds: ['reg-il', 'reg-us'],
    fulfillmentMethod: FulfillmentMethod.DigitalCode,
    extraRequirements: [REGION_CONFIRMATION],
    tags: ['gift-card', 'playstation', 'popular'],
    featured: true,
    imageUrl: 'assets/products/gift-card.svg',
    termsHe: 'קוד שנרכש לאזור חנות שגוי אינו ניתן למימוש ואינו ניתן להחזר.',
    termsEn: 'A code purchased for the wrong store region cannot be redeemed and cannot be refunded.',
    variants: [
      { key: '50', nameHe: '50 ₪', nameEn: '50 ILS', quantityValue: 50, unitHe: 'ש"ח לארנק', unitEn: 'ILS wallet value', priceMajor: 52 },
      { key: '100', nameHe: '100 ₪', nameEn: '100 ILS', quantityValue: 100, unitHe: 'ש"ח לארנק', unitEn: 'ILS wallet value', priceMajor: 103 },
      { key: '150', nameHe: '150 ₪', nameEn: '150 ILS', quantityValue: 150, unitHe: 'ש"ח לארנק', unitEn: 'ILS wallet value', priceMajor: 154 },
      { key: '250', nameHe: '250 ₪', nameEn: '250 ILS', quantityValue: 250, unitHe: 'ש"ח לארנק', unitEn: 'ILS wallet value', priceMajor: 256 },
    ],
  },
  {
    id: 'prod-ps-plus',
    gameId: 'game-playstation',
    slug: 'playstation-plus',
    type: ProductType.Subscription,
    nameHe: 'PlayStation Plus',
    nameEn: 'PlayStation Plus',
    shortHe: 'מנוי PlayStation Plus Essential',
    shortEn: 'PlayStation Plus Essential membership',
    descHe: 'קוד מנוי PlayStation Plus Essential. המנוי מופעל בחשבון שאזור החנות שלו תואם לאזור המוצר.',
    descEn: 'A PlayStation Plus Essential membership code. Activated on an account whose store region matches the product region.',
    platformIds: ['plat-ps5', 'plat-ps4'],
    regionIds: ['reg-il'],
    fulfillmentMethod: FulfillmentMethod.DigitalCode,
    extraRequirements: [REGION_CONFIRMATION],
    tags: ['subscription', 'playstation'],
    featured: true,
    imageUrl: 'assets/products/subscription.svg',
    variants: [
      { key: '1m', nameHe: 'חודש', nameEn: '1 month', quantityValue: 1, unitHe: 'חודשים', unitEn: 'months', priceMajor: 39 },
      { key: '3m', nameHe: '3 חודשים', nameEn: '3 months', quantityValue: 3, unitHe: 'חודשים', unitEn: 'months', priceMajor: 109 },
      { key: '12m', nameHe: '12 חודשים', nameEn: '12 months', quantityValue: 12, unitHe: 'חודשים', unitEn: 'months', priceMajor: 329, compareAtMajor: 399 },
    ],
  },
  {
    id: 'prod-fortnite-vbucks',
    gameId: 'game-fortnite',
    slug: 'fortnite-v-bucks',
    type: ProductType.GameCurrency,
    nameHe: 'V-Bucks',
    nameEn: 'V-Bucks',
    shortHe: 'קודי V-Bucks לכל הפלטפורמות',
    shortEn: 'V-Bucks codes for every platform',
    descHe: 'קוד דיגיטלי למימוש בחשבון Epic Games. תקף בכל הפלטפורמות.',
    descEn: 'A digital code redeemed on your Epic Games account. Valid on every platform.',
    platformIds: ['plat-any'],
    regionIds: ['reg-global'],
    fulfillmentMethod: FulfillmentMethod.DigitalCode,
    extraRequirements: [],
    tags: ['code', 'currency'],
    featured: true,
    imageUrl: 'assets/products/vbucks.svg',
    variants: [
      { key: '1000', nameHe: '1000 V-Bucks', nameEn: '1000 V-Bucks', quantityValue: 1000, unitHe: 'V-Bucks', unitEn: 'V-Bucks', priceMajor: 39 },
      { key: '2800', nameHe: '2800 V-Bucks', nameEn: '2800 V-Bucks', quantityValue: 2800, unitHe: 'V-Bucks', unitEn: 'V-Bucks', priceMajor: 99 },
      { key: '5000', nameHe: '5000 V-Bucks', nameEn: '5000 V-Bucks', quantityValue: 5000, unitHe: 'V-Bucks', unitEn: 'V-Bucks', priceMajor: 169 },
    ],
  },
  {
    id: 'prod-cod-points',
    gameId: 'game-cod',
    slug: 'call-of-duty-points',
    type: ProductType.DigitalCode,
    nameHe: 'COD Points',
    nameEn: 'COD Points',
    shortHe: 'קודים דיגיטליים ל-Call of Duty',
    shortEn: 'Digital codes for Call of Duty',
    descHe: 'קוד דיגיטלי למימוש בחשבון המשחק. הקוד נמסר לאחר אישור התשלום.',
    descEn: 'A digital code redeemed on your game account. The code is released once payment is approved.',
    platformIds: ['plat-any'],
    regionIds: ['reg-global'],
    fulfillmentMethod: FulfillmentMethod.DigitalCode,
    extraRequirements: [],
    tags: ['code', 'currency'],
    featured: false,
    imageUrl: 'assets/products/cod-points.svg',
    variants: [
      { key: '1100', nameHe: '1100 נקודות', nameEn: '1100 points', quantityValue: 1100, unitHe: 'נקודות', unitEn: 'points', priceMajor: 45 },
      { key: '2400', nameHe: '2400 נקודות', nameEn: '2400 points', quantityValue: 2400, unitHe: 'נקודות', unitEn: 'points', priceMajor: 89 },
    ],
  },
  {
    id: 'prod-nba2k-vc',
    gameId: 'game-nba2k',
    slug: 'nba-2k-vc',
    type: ProductType.GameCurrency,
    nameHe: 'חבילות VC',
    nameEn: 'VC bundles',
    shortHe: 'מטבע וירטואלי ל-NBA 2K',
    shortEn: 'Virtual currency for NBA 2K',
    descHe: 'קוד דיגיטלי לטעינת VC. שימו לב שהקוד תלוי בפלטפורמה שנבחרה.',
    descEn: 'A digital code that adds VC. Note that the code is tied to the platform you select.',
    platformIds: ['plat-ps5', 'plat-xbox', 'plat-pc'],
    regionIds: ['reg-global'],
    fulfillmentMethod: FulfillmentMethod.DigitalCode,
    extraRequirements: [],
    tags: ['code', 'currency'],
    featured: false,
    imageUrl: 'assets/products/vc.svg',
    variants: [
      { key: '15000', nameHe: '15,000 VC', nameEn: '15,000 VC', quantityValue: 15000, unitHe: 'VC', unitEn: 'VC', priceMajor: 79 },
      { key: '35000', nameHe: '35,000 VC', nameEn: '35,000 VC', quantityValue: 35000, unitHe: 'VC', unitEn: 'VC', priceMajor: 159 },
    ],
  },
];

function buildVariants(seed: ProductSeed): readonly ProductVariant[] {
  return seed.variants.map((variant, index) => ({
    id: `${seed.id}__${variant.key}`,
    productId: seed.id,
    name: localized(variant.nameHe, variant.nameEn),
    sku: `${seed.slug}-${variant.key}`.toUpperCase(),
    quantityValue: variant.quantityValue,
    quantityUnit: variant.unitHe === undefined ? undefined : localized(variant.unitHe, variant.unitEn),
    metadata: variant.metadata ?? {},
    sortOrder: index,
    active: true,
  }));
}

function buildOffers(seed: ProductSeed): readonly Offer[] {
  const offers: Offer[] = [];
  for (const variant of seed.variants) {
    for (const platformId of seed.platformIds) {
      for (const regionId of seed.regionIds) {
        offers.push({
          id: `offer__${seed.id}__${variant.key}__${platformId}__${regionId}`,
          productId: seed.id,
          variantId: `${seed.id}__${variant.key}`,
          platformId,
          regionId,
          price: {
            current: fromMajor(variant.priceMajor),
            compareAt: variant.compareAtMajor === undefined ? undefined : fromMajor(variant.compareAtMajor),
            discountPercent: variant.compareAtMajor === undefined
              ? undefined
              : Math.round((1 - variant.priceMajor / variant.compareAtMajor) * 100),
          },
          inventory: variant.inventory ?? IN_STOCK,
          fulfillmentMethod: seed.fulfillmentMethod,
          checkoutRequirements: seed.extraRequirements,
          terms: seed.termsHe === undefined ? undefined : localized(seed.termsHe, seed.termsEn),
          active: true,
        });
      }
    }
  }
  return offers;
}

function cheapestPrice(seed: ProductSeed): { current: ReturnType<typeof fromMajor> } {
  const cheapest = seed.variants.reduce((best, variant) => (variant.priceMajor < best.priceMajor ? variant : best));
  return { current: fromMajor(cheapest.priceMajor) };
}

export const PRODUCTS: readonly Product[] = PRODUCT_SEEDS.map((seed) => ({
  id: seed.id,
  gameId: seed.gameId,
  slug: seed.slug,
  type: seed.type,
  name: localized(seed.nameHe, seed.nameEn),
  shortDescription: localized(seed.shortHe, seed.shortEn),
  description: localized(seed.descHe, seed.descEn),
  platformIds: seed.platformIds,
  regionIds: seed.regionIds,
  images: [image(seed.imageUrl, seed.nameHe, 'card')],
  metadata: seed.metadata ?? {},
  variants: buildVariants(seed),
  fulfillmentMethods: [seed.fulfillmentMethod],
  tags: seed.tags,
  fromPrice: cheapestPrice(seed),
  active: true,
  featured: seed.featured,
  ratingAverage: seed.ratingAverage,
  ratingCount: seed.ratingCount,
}));

export const OFFERS: readonly Offer[] = PRODUCT_SEEDS.flatMap(buildOffers);
