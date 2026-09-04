/**
 * Development seed.
 *
 * =========================================================================
 *  DEVELOPMENT DATA. Every row this writes is demonstration data.
 *
 *  - No code in `inventory` corresponds to a real purchasable voucher.
 *  - No supplier has been contracted for any product here.
 *  - The reviews are written examples, not real customer feedback.
 *  - Prices are illustrative and carry no commercial commitment.
 * =========================================================================
 *
 * The catalog mirrors `src/app/data/mock/catalog.seed.ts` so that switching the
 * frontend between mock and http shows the same store. Where the two differ, it
 * is deliberate and noted below.
 *
 * Deterministic and safe to rerun: every write is an upsert keyed on a stable
 * id, so running it twice produces the same database as running it once.
 */
import {
  FulfillmentMethod,
  InventoryStatus,
  PlatformFamily,
  PlatformKind,
  PrismaClient,
  ProductType,
  PromotionKind,
  RegionCode,
  SupportTopic,
} from '@prisma/client';

const prisma = new PrismaClient();

type Localized = { he: string; en?: string };
const t = (he: string, en?: string): Localized => (en === undefined ? { he } : { he, en });

// ---------------------------------------------------------------------------
// Platforms and regions
// ---------------------------------------------------------------------------

const PLATFORMS = [
  { id: 'plat-ps5', kind: PlatformKind.PLAYSTATION_5, family: PlatformFamily.PLAYSTATION, name: t('פלייסטיישן 5', 'PlayStation 5'), shortName: t('PS5', 'PS5'), sortOrder: 1 },
  { id: 'plat-ps4', kind: PlatformKind.PLAYSTATION_4, family: PlatformFamily.PLAYSTATION, name: t('פלייסטיישן 4', 'PlayStation 4'), shortName: t('PS4', 'PS4'), sortOrder: 2 },
  { id: 'plat-xbox', kind: PlatformKind.XBOX, family: PlatformFamily.XBOX, name: t('אקסבוקס', 'Xbox'), shortName: t('Xbox', 'Xbox'), sortOrder: 3 },
  { id: 'plat-pc', kind: PlatformKind.PC, family: PlatformFamily.PC, name: t('מחשב', 'PC'), shortName: t('PC', 'PC'), sortOrder: 4 },
  { id: 'plat-mobile', kind: PlatformKind.MOBILE, family: PlatformFamily.MOBILE, name: t('מובייל', 'Mobile'), shortName: t('Mobile', 'Mobile'), sortOrder: 5 },
  { id: 'plat-any', kind: PlatformKind.MULTI_PLATFORM, family: PlatformFamily.ANY, name: t('כל הפלטפורמות', 'All platforms'), shortName: t('הכול', 'All'), sortOrder: 6 },
];

const REGIONS = [
  {
    id: 'reg-il', code: RegionCode.IL, name: t('ישראל', 'Israel'), market: 'IL',
    currency: 'ILS', flagEmoji: '🇮🇱', isRegionFree: false,
    restrictionNotice: t(
      'ניתן למימוש רק בחשבון שאזור החנות שלו הוא ישראל.',
      'Redeemable only on an account whose store region is Israel.',
    ),
  },
  {
    id: 'reg-us', code: RegionCode.US, name: t('ארצות הברית', 'United States'), market: 'US',
    currency: 'ILS', flagEmoji: '🇺🇸', isRegionFree: false,
    restrictionNotice: t(
      'ניתן למימוש רק בחשבון שאזור החנות שלו הוא ארצות הברית.',
      'Redeemable only on an account whose store region is the United States.',
    ),
  },
  {
    id: 'reg-eu', code: RegionCode.EU, name: t('אירופה', 'Europe'), market: 'DE',
    currency: 'ILS', flagEmoji: '🇪🇺', isRegionFree: false,
    restrictionNotice: t('ניתן למימוש רק בחשבון אירופאי.', 'Redeemable only on a European account.'),
  },
  {
    id: 'reg-global', code: RegionCode.GLOBAL, name: t('גלובלי', 'Global'), market: null,
    currency: 'ILS', flagEmoji: '🌍', isRegionFree: true, restrictionNotice: null,
  },
];

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

const GAMES = [
  { id: 'game-ea-fc', slug: 'ea-sports-fc', name: t('EA SPORTS FC', 'EA SPORTS FC'), publisher: 'Electronic Arts', shortDescription: t('מטבעות, נקודות FC ושירותי Ultimate Team.', 'Coins, FC Points and Ultimate Team services.'), accentColor: '#00e5a0', featured: true, sortOrder: 1 },
  { id: 'game-playstation', slug: 'playstation', name: t('פלייסטיישן', 'PlayStation'), publisher: 'Sony Interactive Entertainment', shortDescription: t('גיפט קארד לחנות, מנויי PlayStation Plus ותוכן דיגיטלי.', 'Store gift cards, PlayStation Plus subscriptions and digital content.'), accentColor: '#4f8cff', featured: true, sortOrder: 2 },
  { id: 'game-fortnite', slug: 'fortnite', name: t('פורטנייט', 'Fortnite'), publisher: 'Epic Games', shortDescription: t('V-Bucks לכל הפלטפורמות.', 'V-Bucks for every platform.'), accentColor: '#a05cff', featured: true, sortOrder: 3 },
  { id: 'game-cod', slug: 'call-of-duty', name: t('קול אוף דיוטי', 'Call of Duty'), publisher: 'Activision', shortDescription: t('COD Points לכל הפלטפורמות.', 'COD Points for every platform.'), accentColor: '#ff8a3d', featured: false, sortOrder: 4 },
  { id: 'game-nba2k', slug: 'nba-2k', name: t('NBA 2K', 'NBA 2K'), publisher: '2K Games', shortDescription: t('חבילות VC לקריירה ול-MyTEAM.', 'VC bundles for MyCAREER and MyTEAM.'), accentColor: '#ff4d6d', featured: false, sortOrder: 5 },
];

// ---------------------------------------------------------------------------
// Checkout requirements attached to offers
//
// These come from the closed vocabulary in the frontend domain. Nothing here
// can express a password, a verification code or a recovery code, and nothing
// ever may.
// ---------------------------------------------------------------------------

const REGION_CONFIRMATION = {
  key: 'REGION_CONFIRMATION', control: 'checkbox',
  label: t('אני מאשר/ת שאזור החשבון שלי תואם לאזור המוצר', 'I confirm my account region matches the product region'),
  hint: t('קוד שנרכש לאזור שגוי לא ניתן למימוש ולא ניתן להחזר.', 'A code bought for the wrong region cannot be redeemed and cannot be refunded.'),
  required: true,
};

const PLATFORM_ACCOUNT_HANDLE = {
  key: 'PLATFORM_ACCOUNT_HANDLE', control: 'text',
  label: t('שם המשתמש שלכם בפלטפורמה', 'Your platform username'),
  hint: t('שם המשתמש הפומבי בלבד. לעולם לא נבקש סיסמה.', 'Public username only. We will never ask for your password.'),
  placeholder: t('לדוגמה: TopGamer_IL', 'e.g. TopGamer_IL'),
  required: true, maxLength: 64,
};

const GAME_PLAYER_ID = {
  key: 'GAME_PLAYER_ID', control: 'text',
  label: t('מזהה השחקן במשחק', 'In-game player ID'),
  hint: t('המזהה הפומבי שמופיע בפרופיל שלכם במשחק.', 'The public identifier shown on your in-game profile.'),
  required: true, maxLength: 64,
};

const SERVICE_NOTE = {
  key: 'SERVICE_NOTE', control: 'textarea',
  label: t('הערות לשירות (אופציונלי)', 'Notes for the service (optional)'),
  placeholder: t('חלון זמן מועדף, העדפות נוספות…', 'Preferred time window, other preferences…'),
  required: false, maxLength: 500,
};

// ---------------------------------------------------------------------------
// Products, variants and offers
// ---------------------------------------------------------------------------

interface VariantSeed {
  key: string;
  name: Localized;
  quantityValue?: number;
  quantityUnit?: Localized;
  priceMajor: number;
  compareAtMajor?: number;
  /**
   * Extra coins delivered with this bundle while the launch campaign runs.
   * Stored in the variant's metadata and spelled out in its name, so every
   * order line carries the promise the customer saw. Adjust here, re-seed.
   */
  bonusQuantity?: number;
  /** Absent means the default in-stock pool. */
  inventory?: { status: InventoryStatus; available: number | null; maxPerOrder?: number };
}

interface ProductSeed {
  id: string;
  gameId: string;
  slug: string;
  type: ProductType;
  name: Localized;
  shortDescription: Localized;
  description: Localized;
  platformIds: string[];
  regionIds: string[];
  fulfillmentMethod: FulfillmentMethod;
  requirements: unknown[];
  tags: string[];
  featured: boolean;
  imageUrl: string;
  terms?: Localized;
  variants: VariantSeed[];
}

const PRODUCTS: ProductSeed[] = [
  {
    id: 'prod-fc-coins', gameId: 'game-ea-fc', slug: 'ea-fc-ultimate-team-coins',
    type: ProductType.GAME_CURRENCY,
    name: t('מטבעות Ultimate Team', 'Ultimate Team Coins'),
    shortDescription: t('מטבעות ל-EA SPORTS FC Ultimate Team', 'Coins for EA SPORTS FC Ultimate Team'),
    description: t(
      'חבילות מטבעות ל-Ultimate Team. האספקה מתבצעת ידנית על ידי נציג, בתיאום איתכם, ללא צורך בפרטי התחברות כלשהם.',
      'Coin bundles for Ultimate Team. Delivery is performed manually by a team member in coordination with you, and never requires any login details.',
    ),
    platformIds: ['plat-ps5', 'plat-ps4', 'plat-xbox', 'plat-pc'],
    regionIds: ['reg-global'],
    fulfillmentMethod: FulfillmentMethod.MANUAL_DELIVERY,
    requirements: [PLATFORM_ACCOUNT_HANDLE, SERVICE_NOTE],
    tags: ['coins', 'ultimate-team', 'popular'], featured: true,
    imageUrl: 'assets/products/coins.svg',
    terms: t(
      'האספקה מתבצעת בתיאום מולכם. לעולם לא נבקש סיסמה, קוד אימות או קודי גיבוי.',
      'Delivery is coordinated with you. We will never ask for a password, a verification code or backup codes.',
    ),
    variants: [
      // The launch ladder: eleven sizes from 100K to 5M, each with a launch
      // bonus in coins (not a struck-through price). Larger bundles cost less
      // per coin at every step; the bonus grows with the bundle. No artificial
      // scarcity: every size is in the default in-stock pool.
      { key: '100k', name: t('100K מטבעות + 10K בונוס השקה', '100K coins + 10K launch bonus'), quantityValue: 100000, quantityUnit: t('מטבעות', 'coins'), priceMajor: 15, bonusQuantity: 10000 },
      { key: '200k', name: t('200K מטבעות + 20K בונוס השקה', '200K coins + 20K launch bonus'), quantityValue: 200000, quantityUnit: t('מטבעות', 'coins'), priceMajor: 27, bonusQuantity: 20000 },
      { key: '250k', name: t('250K מטבעות + 25K בונוס השקה', '250K coins + 25K launch bonus'), quantityValue: 250000, quantityUnit: t('מטבעות', 'coins'), priceMajor: 31, bonusQuantity: 25000 },
      { key: '300k', name: t('300K מטבעות + 30K בונוס השקה', '300K coins + 30K launch bonus'), quantityValue: 300000, quantityUnit: t('מטבעות', 'coins'), priceMajor: 35, bonusQuantity: 30000 },
      { key: '500k', name: t('500K מטבעות + 50K בונוס השקה', '500K coins + 50K launch bonus'), quantityValue: 500000, quantityUnit: t('מטבעות', 'coins'), priceMajor: 39, bonusQuantity: 50000 },
      { key: '750k', name: t('750K מטבעות + 75K בונוס השקה', '750K coins + 75K launch bonus'), quantityValue: 750000, quantityUnit: t('מטבעות', 'coins'), priceMajor: 58, bonusQuantity: 75000 },
      { key: '1m', name: t('1M מטבעות + 100K בונוס השקה', '1M coins + 100K launch bonus'), quantityValue: 1000000, quantityUnit: t('מטבעות', 'coins'), priceMajor: 75, bonusQuantity: 100000 },
      { key: '1500k', name: t('1.5M מטבעות + 150K בונוס השקה', '1.5M coins + 150K launch bonus'), quantityValue: 1500000, quantityUnit: t('מטבעות', 'coins'), priceMajor: 109, bonusQuantity: 150000 },
      { key: '2m', name: t('2M מטבעות + 200K בונוס השקה', '2M coins + 200K launch bonus'), quantityValue: 2000000, quantityUnit: t('מטבעות', 'coins'), priceMajor: 143, bonusQuantity: 200000 },
      { key: '3m', name: t('3M מטבעות + 300K בונוס השקה', '3M coins + 300K launch bonus'), quantityValue: 3000000, quantityUnit: t('מטבעות', 'coins'), priceMajor: 209, bonusQuantity: 300000 },
      { key: '5m', name: t('5M מטבעות + 500K בונוס השקה', '5M coins + 500K launch bonus'), quantityValue: 5000000, quantityUnit: t('מטבעות', 'coins'), priceMajor: 335, bonusQuantity: 500000 },
    ],
  },
  {
    id: 'prod-fc-points', gameId: 'game-ea-fc', slug: 'ea-fc-points',
    type: ProductType.DIGITAL_CODE,
    name: t('FC Points', 'FC Points'),
    shortDescription: t('קודים דיגיטליים ל-FC Points', 'Digital codes for FC Points'),
    description: t(
      'קוד דיגיטלי למימוש בחנות הפלטפורמה. הקוד מוצג בדף ההזמנה ונשלח למייל מיד לאחר התשלום.',
      'A digital code redeemed in your platform store. The code appears on the order page and is emailed to you right after payment.',
    ),
    platformIds: ['plat-ps5', 'plat-xbox'], regionIds: ['reg-il', 'reg-eu'],
    fulfillmentMethod: FulfillmentMethod.DIGITAL_CODE,
    requirements: [REGION_CONFIRMATION],
    tags: ['code', 'points'], featured: false,
    imageUrl: 'assets/products/points.svg',
    variants: [
      { key: '1050', name: t('1050 נקודות', '1050 points'), quantityValue: 1050, quantityUnit: t('נקודות', 'points'), priceMajor: 45 },
      { key: '2200', name: t('2200 נקודות', '2200 points'), quantityValue: 2200, quantityUnit: t('נקודות', 'points'), priceMajor: 89 },
      { key: '5900', name: t('5900 נקודות', '5900 points'), quantityValue: 5900, quantityUnit: t('נקודות', 'points'), priceMajor: 219 },
    ],
  },
  {
    id: 'prod-fc-sbc', gameId: 'game-ea-fc', slug: 'ea-fc-sbc-service',
    type: ProductType.PLAYER_SERVICE,
    name: t('שירות השלמת SBC', 'SBC completion service'),
    shortDescription: t('נציג משלים עבורכם אתגרי בניית קבוצה', 'A team member completes Squad Building Challenges for you'),
    description: t(
      'נציג משלים עבורכם אתגרי SBC בתיאום מולכם. השירות אינו כרוך במסירת פרטי התחברות מכל סוג.',
      'A team member completes Squad Building Challenges in coordination with you. The service never involves handing over login details of any kind.',
    ),
    platformIds: ['plat-ps5', 'plat-xbox', 'plat-pc'], regionIds: ['reg-global'],
    fulfillmentMethod: FulfillmentMethod.IN_GAME_SERVICE,
    requirements: [GAME_PLAYER_ID, SERVICE_NOTE],
    tags: ['service', 'ultimate-team'], featured: false,
    imageUrl: 'assets/products/service.svg',
    terms: t(
      'השירות מתבצע בתיאום מולכם ובנוכחותכם. לעולם לא נבקש סיסמה או קוד אימות.',
      'The service is performed in coordination with you. We will never ask for a password or a verification code.',
    ),
    variants: [
      { key: 'basic', name: t('אתגר בודד', 'Single challenge'), priceMajor: 79 },
      { key: 'set', name: t('סט אתגרים', 'Challenge set'), priceMajor: 199 },
    ],
  },
  {
    id: 'prod-ps-gift-card', gameId: 'game-playstation', slug: 'playstation-store-gift-card',
    type: ProductType.GIFT_CARD,
    name: t('גיפט קארד PlayStation Store', 'PlayStation Store gift card'),
    shortDescription: t('קוד טעינה לארנק חנות PlayStation', 'A top-up code for your PlayStation Store wallet'),
    description: t(
      'קוד דיגיטלי לטעינת הארנק בחנות PlayStation. שימו לב: הקוד תקף אך ורק לחשבון שאזור החנות שלו תואם לאזור המצוין במוצר.',
      'A digital code that tops up your PlayStation Store wallet. Note: the code is valid only for an account whose store region matches the region shown on the product.',
    ),
    platformIds: ['plat-ps5', 'plat-ps4'], regionIds: ['reg-il', 'reg-us'],
    fulfillmentMethod: FulfillmentMethod.DIGITAL_CODE,
    requirements: [REGION_CONFIRMATION],
    tags: ['gift-card', 'playstation', 'popular'], featured: true,
    imageUrl: 'assets/products/gift-card.svg',
    terms: t(
      'קוד שנרכש לאזור חנות שגוי אינו ניתן למימוש ואינו ניתן להחזר.',
      'A code purchased for the wrong store region cannot be redeemed and cannot be refunded.',
    ),
    variants: [
      { key: '50', name: t('50 ₪', '50 ILS'), quantityValue: 50, quantityUnit: t('ש"ח לארנק', 'ILS wallet value'), priceMajor: 52 },
      { key: '100', name: t('100 ₪', '100 ILS'), quantityValue: 100, quantityUnit: t('ש"ח לארנק', 'ILS wallet value'), priceMajor: 103 },
      { key: '150', name: t('150 ₪', '150 ILS'), quantityValue: 150, quantityUnit: t('ש"ח לארנק', 'ILS wallet value'), priceMajor: 154 },
      // Deliberately out of stock, so the storefront's unavailable path has
      // something real to render.
      { key: '250', name: t('250 ₪', '250 ILS'), quantityValue: 250, quantityUnit: t('ש"ח לארנק', 'ILS wallet value'), priceMajor: 256, inventory: { status: InventoryStatus.OUT_OF_STOCK, available: 0 } },
    ],
  },
  {
    id: 'prod-ps-plus', gameId: 'game-playstation', slug: 'playstation-plus',
    type: ProductType.SUBSCRIPTION,
    name: t('PlayStation Plus', 'PlayStation Plus'),
    shortDescription: t('מנוי PlayStation Plus Essential', 'PlayStation Plus Essential membership'),
    description: t(
      'קוד מנוי PlayStation Plus Essential. המנוי מופעל בחשבון שאזור החנות שלו תואם לאזור המוצר.',
      'A PlayStation Plus Essential membership code. Activated on an account whose store region matches the product region.',
    ),
    platformIds: ['plat-ps5', 'plat-ps4'], regionIds: ['reg-il'],
    fulfillmentMethod: FulfillmentMethod.DIGITAL_CODE,
    requirements: [REGION_CONFIRMATION],
    tags: ['subscription', 'playstation'], featured: true,
    imageUrl: 'assets/products/subscription.svg',
    variants: [
      { key: '1m', name: t('חודש', '1 month'), quantityValue: 1, quantityUnit: t('חודשים', 'months'), priceMajor: 39 },
      { key: '3m', name: t('3 חודשים', '3 months'), quantityValue: 3, quantityUnit: t('חודשים', 'months'), priceMajor: 109 },
      { key: '12m', name: t('12 חודשים', '12 months'), quantityValue: 12, quantityUnit: t('חודשים', 'months'), priceMajor: 329, compareAtMajor: 399 },
    ],
  },
  {
    id: 'prod-fortnite-vbucks', gameId: 'game-fortnite', slug: 'fortnite-v-bucks',
    type: ProductType.GAME_CURRENCY,
    name: t('V-Bucks', 'V-Bucks'),
    shortDescription: t('קודי V-Bucks לכל הפלטפורמות', 'V-Bucks codes for every platform'),
    description: t(
      'קוד דיגיטלי למימוש בחשבון Epic Games. תקף בכל הפלטפורמות.',
      'A digital code redeemed on your Epic Games account. Valid on every platform.',
    ),
    platformIds: ['plat-any'], regionIds: ['reg-global'],
    fulfillmentMethod: FulfillmentMethod.DIGITAL_CODE,
    requirements: [],
    tags: ['code', 'currency'], featured: true,
    imageUrl: 'assets/products/vbucks.svg',
    variants: [
      { key: '1000', name: t('1000 V-Bucks', '1000 V-Bucks'), quantityValue: 1000, quantityUnit: t('V-Bucks', 'V-Bucks'), priceMajor: 39 },
      { key: '2800', name: t('2800 V-Bucks', '2800 V-Bucks'), quantityValue: 2800, quantityUnit: t('V-Bucks', 'V-Bucks'), priceMajor: 99 },
      { key: '5000', name: t('5000 V-Bucks', '5000 V-Bucks'), quantityValue: 5000, quantityUnit: t('V-Bucks', 'V-Bucks'), priceMajor: 169 },
    ],
  },
  {
    id: 'prod-cod-points', gameId: 'game-cod', slug: 'call-of-duty-points',
    type: ProductType.DIGITAL_CODE,
    name: t('COD Points', 'COD Points'),
    shortDescription: t('קודים דיגיטליים ל-Call of Duty', 'Digital codes for Call of Duty'),
    description: t(
      'קוד דיגיטלי למימוש בחשבון המשחק. הקוד נמסר לאחר אישור התשלום.',
      'A digital code redeemed on your game account. The code is released once payment is approved.',
    ),
    platformIds: ['plat-any'], regionIds: ['reg-global'],
    fulfillmentMethod: FulfillmentMethod.DIGITAL_CODE,
    requirements: [],
    tags: ['code', 'currency'], featured: false,
    imageUrl: 'assets/products/cod-points.svg',
    variants: [
      { key: '1100', name: t('1100 נקודות', '1100 points'), quantityValue: 1100, quantityUnit: t('נקודות', 'points'), priceMajor: 45 },
      { key: '2400', name: t('2400 נקודות', '2400 points'), quantityValue: 2400, quantityUnit: t('נקודות', 'points'), priceMajor: 89 },
    ],
  },
  {
    id: 'prod-nba2k-vc', gameId: 'game-nba2k', slug: 'nba-2k-vc',
    type: ProductType.GAME_CURRENCY,
    name: t('חבילות VC', 'VC bundles'),
    shortDescription: t('מטבע וירטואלי ל-NBA 2K', 'Virtual currency for NBA 2K'),
    description: t(
      'קוד דיגיטלי לטעינת VC. שימו לב שהקוד תלוי בפלטפורמה שנבחרה.',
      'A digital code that adds VC. Note that the code is tied to the platform you select.',
    ),
    platformIds: ['plat-ps5', 'plat-xbox', 'plat-pc'], regionIds: ['reg-global'],
    fulfillmentMethod: FulfillmentMethod.DIGITAL_CODE,
    requirements: [],
    tags: ['code', 'currency'], featured: false,
    imageUrl: 'assets/products/vc.svg',
    variants: [
      { key: '15000', name: t('15,000 VC', '15,000 VC'), quantityValue: 15000, quantityUnit: t('VC', 'VC'), priceMajor: 79 },
      { key: '35000', name: t('35,000 VC', '35,000 VC'), quantityValue: 35000, quantityUnit: t('VC', 'VC'), priceMajor: 159 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/**
 * Demonstration reviews.
 *
 * The mock frontend seed claimed rating counts of 412, 356, 201, 128 and 97
 * against five written reviews. Those numbers were invented. Here the rating a
 * product shows is computed from the rows below and nothing else, so the count
 * on screen is the number of reviews that actually exist.
 */
const REVIEWS = [
  { id: 'rev-1', productId: 'prod-fc-coins', authorDisplayName: 'עומר ל.', rating: 5, title: 'הגיע מהר', body: 'הזמנתי 250K וקיבלתי תוך פחות מרבע שעה. התכתבו איתי כל הדרך.', createdAt: '2026-07-02T10:12:00.000Z' },
  { id: 'rev-2', productId: 'prod-ps-gift-card', authorDisplayName: 'Noa B.', rating: 5, title: 'בדיוק כמו שצריך', body: 'הקוד עבד מיד בחשבון הישראלי. אהבתי שכתוב במפורש שזה אזור ישראל.', createdAt: '2026-07-19T18:41:00.000Z' },
  { id: 'rev-3', productId: 'prod-ps-plus', authorDisplayName: 'דניאל ק.', rating: 4, title: null, body: 'המנוי הופעל בלי בעיה. הייתי שמח לקבל מייל אישור מהר יותר.', createdAt: '2026-08-01T09:05:00.000Z' },
  { id: 'rev-4', productId: 'prod-fortnite-vbucks', authorDisplayName: 'Roi S.', rating: 5, title: null, body: 'קוד הגיע מיד אחרי התשלום. פשוט ונוח.', createdAt: '2026-08-11T20:30:00.000Z' },
  { id: 'rev-5', productId: 'prod-fc-coins', authorDisplayName: 'מאור ז.', rating: 4, title: null, body: 'שירות טוב. לקח קצת יותר מהצפי אבל עדכנו אותי בדף ההזמנה.', createdAt: '2026-08-16T14:22:00.000Z' },
];

const FAQ = [
  { id: 'faq-region', topic: SupportTopic.REGION_PROBLEM, sortOrder: 1, question: t('מה זה אזור המוצר ולמה זה חשוב?', 'What is the product region and why does it matter?'), answer: t('מוצרים דיגיטליים כמו גיפט קארד ומנויים נעולים לאזור חנות מסוים. קוד שנקנה לאזור שגוי לא ניתן למימוש ולא ניתן להחזר, ולכן אנחנו מציגים את האזור בכרטיס המוצר, בעגלה ובתשלום ומבקשים אישור מפורש לפני הרכישה.', 'Digital products such as gift cards and subscriptions are locked to a store region. A code bought for the wrong region cannot be redeemed and cannot be refunded, so we show the region on the product card, in the cart and at checkout, and ask you to confirm it before you buy.') },
  { id: 'faq-password', topic: SupportTopic.GENERAL, sortOrder: 2, question: t('האם תבקשו את הסיסמה שלי?', 'Will you ask for my password?'), answer: t('לא. לעולם לא נבקש סיסמה, קוד אימות דו-שלבי או קודי גיבוי, לא באתר, לא במייל ולא בצ׳אט. אם מישהו מבקש מכם פרטים כאלה בשמנו, זו הונאה.', 'No. We will never ask for a password, a two-factor code or backup codes, not on the site, not by email and not in chat. If anyone asks for these in our name, it is a scam.') },
  { id: 'faq-delivery', topic: SupportTopic.DELIVERY_PROBLEM, sortOrder: 3, question: t('כמה זמן לוקחת האספקה?', 'How long does delivery take?'), answer: t('תלוי בשיטת האספקה שמופיעה על המוצר. קוד דיגיטלי מגיע תוך דקות ספורות מאישור התשלום, שירות ידני מסופק בדרך כלל תוך 5 עד 30 דקות, ושירות בתוך המשחק מתואם איתכם מראש. הזמן המשוער מוצג על כל מוצר לפני הרכישה.', 'It depends on the delivery method shown on the product. A digital code arrives within minutes of payment approval, a manual service is typically delivered within 5 to 30 minutes, and an in-game service is scheduled with you. The estimate is shown on every product before you buy.') },
  { id: 'faq-payment', topic: SupportTopic.PAYMENT_PROBLEM, sortOrder: 4, question: t('אילו אמצעי תשלום נתמכים?', 'Which payment methods are supported?'), answer: t('האתר נמצא כרגע בשלב פיתוח ומריץ סימולציית תשלום בלבד. לא מתבצע חיוב אמיתי ולא נאספים פרטי כרטיס אשראי. אמצעי תשלום אמיתיים יופעלו לאחר חיבור ספק סליקה.', 'The site is currently in development and runs a payment simulation only. No real charge is made and no card details are collected. Real payment methods will be enabled once a payment provider is connected.') },
  { id: 'faq-refund', topic: SupportTopic.REFUND_REQUEST, sortOrder: 5, question: t('מה מדיניות ההחזרים?', 'What is the refund policy?'), answer: t('הזמנה שטרם סופקה ניתנת לביטול והחזר מלא. קוד דיגיטלי שכבר נחשף אינו ניתן להחזר, אלא אם התברר שהוא פגום או שאינו תואם לאזור שהוזמן. פרטים מלאים בעמוד מדיניות ההחזרים.', 'An order that has not been delivered yet can be cancelled for a full refund. A digital code that has already been revealed cannot be refunded, unless it turns out to be faulty or to not match the region ordered. Full details are on the refund policy page.') },
  { id: 'faq-order-status', topic: SupportTopic.ORDER_STATUS, sortOrder: 6, question: t('איך אני עוקב אחרי ההזמנה?', 'How do I track my order?'), answer: t('כל הזמנה מקבלת דף סטטוס משלה עם ציר זמן שמראה בדיוק היכן היא עומדת, מהתשלום ועד האספקה. הקישור נשלח למייל וזמין גם באזור האישי.', 'Every order gets its own status page with a timeline showing exactly where it stands, from payment through delivery. The link is emailed to you and is also available in your account.') },
];

const PROMOTIONS = [
  // Off while the launch bonus runs: one benefit per order. Flip `active` to
  // reopen the code once the bonus ends.
  { id: 'promo-launch', slug: 'launch-week', kind: PromotionKind.PERCENT_OFF, title: t('שבוע השקה, 10% הנחה', 'Launch week, 10% off'), description: t('קוד LAUNCH10 מעניק 10% הנחה על כל הזמנה מעל 100 ₪.', 'Code LAUNCH10 gives 10% off any order above 100 ILS.'), percentOff: 10, amountOffMinor: null, currency: 'ILS', productIds: [] as string[], startsAt: '2026-01-01T00:00:00.000Z', active: false },
  { id: 'promo-ps-plus', slug: 'ps-plus-annual', kind: PromotionKind.AMOUNT_OFF, title: t('PlayStation Plus שנתי במחיר מיוחד', 'PlayStation Plus annual deal'), description: t('מנוי ל-12 חודשים ב-329 ₪ במקום 399 ₪.', 'A 12-month membership for 329 ILS instead of 399 ILS.'), percentOff: null, amountOffMinor: 7000, currency: 'ILS', productIds: ['prod-ps-plus'], startsAt: '2026-01-01T00:00:00.000Z' },
];

// ---------------------------------------------------------------------------

const minor = (major: number): number => Math.round(major * 100);

async function main(): Promise<void> {
  const startedAt = Date.now();

  for (const platform of PLATFORMS) {
    await prisma.platform.upsert({ where: { id: platform.id }, create: platform, update: platform });
  }

  for (const region of REGIONS) {
    await prisma.region.upsert({ where: { id: region.id }, create: region, update: region });
  }

  for (const game of GAMES) {
    const row = { ...game, active: true };
    await prisma.game.upsert({ where: { id: row.id }, create: row, update: row });
  }

  let offerCount = 0;

  for (const product of PRODUCTS) {
    const productRow = {
      id: product.id,
      gameId: product.gameId,
      slug: product.slug,
      type: product.type,
      name: product.name,
      shortDescription: product.shortDescription,
      description: product.description,
      images: [{ url: product.imageUrl, alt: product.name.he, role: 'card' }],
      metadata: {},
      tags: product.tags,
      active: true,
      featured: product.featured,
    };
    await prisma.product.upsert({
      where: { id: product.id },
      create: productRow,
      update: productRow,
    });

    for (const [index, variant] of product.variants.entries()) {
      const variantId = `${product.id}__${variant.key}`;
      const variantRow = {
        id: variantId,
        productId: product.id,
        name: variant.name,
        sku: `${product.slug}-${variant.key}`.toUpperCase(),
        quantityValue: variant.quantityValue ?? null,
        quantityUnit: variant.quantityUnit ?? null,
        metadata: variant.bonusQuantity ? { launchBonus: variant.bonusQuantity } : {},
        sortOrder: index,
        active: true,
      };
      await prisma.productVariant.upsert({
        where: { id: variantId },
        create: variantRow,
        update: variantRow,
      });

      // One offer per (variant x platform x region). This is the unit of
      // commerce: a US gift card and an IL gift card are different rows with
      // different ids, prices and stock, which is what makes a region mix-up
      // structurally impossible rather than merely guarded against.
      for (const platformId of product.platformIds) {
        for (const regionId of product.regionIds) {
          const offerId = `offer__${product.id}__${variant.key}__${platformId}__${regionId}`;
          const stock = variant.inventory ?? { status: InventoryStatus.IN_STOCK, available: null, maxPerOrder: 10 };

          const offerRow = {
            id: offerId,
            productId: product.id,
            variantId,
            platformId,
            regionId,
            priceAmountMinor: minor(variant.priceMajor),
            priceCurrency: 'ILS',
            compareAtMinor: variant.compareAtMajor ? minor(variant.compareAtMajor) : null,
            fulfillmentMethod: product.fulfillmentMethod,
            checkoutRequirements: product.requirements as object[],
            terms: product.terms ?? null,
            maxPerOrder: stock.maxPerOrder ?? 10,
            active: true,
          };
          await prisma.offer.upsert({
            where: { id: offerId },
            create: offerRow,
            update: offerRow,
          });

          const inventoryRow = {
            offerId,
            status: stock.status,
            quantityAvailable: stock.available,
            // Reserved and sold are NOT reset on a rerun: they are live
            // commercial state, and clobbering them would release stock that a
            // real checkout is holding.
          };
          await prisma.inventory.upsert({
            where: { offerId },
            create: { ...inventoryRow, quantityReserved: 0, quantitySold: 0 },
            update: inventoryRow,
          });

          offerCount += 1;
        }
      }
    }
  }

  for (const review of REVIEWS) {
    const row = {
      ...review,
      createdAt: new Date(review.createdAt),
      verifiedPurchase: false, // No order backs these; claiming otherwise would be a lie.
      published: true,
      customerId: null,
    };
    await prisma.review.upsert({ where: { id: review.id }, create: row, update: row });
  }

  for (const entry of FAQ) {
    await prisma.faqEntry.upsert({ where: { id: entry.id }, create: entry, update: entry });
  }

  for (const promotion of PROMOTIONS) {
    const row = {
      ...promotion,
      startsAt: new Date(promotion.startsAt),
      endsAt: null,
      gameIds: [],
      regionIds: [],
      bannerImageUrl: null,
      active: promotion.active ?? true,
    };
    await prisma.promotion.upsert({ where: { id: row.id }, create: row, update: row });
  }

  const coupon = {
    id: 'coupon-launch10',
    code: 'LAUNCH10',
    promotionId: 'promo-launch',
    minSubtotalMinor: 10000,
    maxRedemptions: null,
    maxPerCustomer: 1,
    expiresAt: null,
    active: false, // reopens with promo-launch
  };
  await prisma.coupon.upsert({
    where: { id: coupon.id },
    create: coupon,
    // redemptionCount is live state and is deliberately not reset.
    update: { ...coupon, redemptionCount: undefined },
  });

  process.stdout.write(
    `Seed complete in ${Date.now() - startedAt}ms: ` +
      `${PLATFORMS.length} platforms, ${REGIONS.length} regions, ${GAMES.length} games, ` +
      `${PRODUCTS.length} products, ${offerCount} offers, ${REVIEWS.length} reviews, ` +
      `${FAQ.length} FAQ entries, ${PROMOTIONS.length} promotions.\n`,
  );
  process.stdout.write('All rows are DEVELOPMENT DATA. No real inventory, supplier or customer.\n');
}

main()
  .catch((error) => {
    process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
