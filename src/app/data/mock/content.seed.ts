import {
  Coupon, FaqEntry, PaymentProviderDescriptor, PaymentProviderId, PaymentStatus, Promotion,
  PromotionKind, Review, SimulatedInstrument, SupportTopic, fromMajor, localized,
} from '../../domain';

/** Marketing, review and support seed data for the mock backend. */

export const PROMOTIONS: readonly Promotion[] = [
  {
    id: 'promo-launch',
    slug: 'launch-week',
    kind: PromotionKind.PercentOff,
    title: localized('שבוע השקה: 10% הנחה', 'Launch week: 10% off'),
    description: localized(
      'קוד LAUNCH10 מעניק 10% הנחה על כל הזמנה מעל 100 ₪.',
      'Code LAUNCH10 gives 10% off any order above 100 ILS.',
    ),
    percentOff: 10,
    startsAt: '2026-01-01T00:00:00.000Z',
    // Off while the launch bonus runs: one benefit per order, as in production.
    active: false,
  },
  {
    id: 'promo-qa-ten',
    slug: 'qa-ten',
    kind: PromotionKind.PercentOff,
    title: localized('קוד בדיקה (סביבת פיתוח בלבד)', 'Test code (development only)'),
    description: localized('QA10: 10% על מוצרים ללא בונוס, להזמנות מעל 100 ₪. קיים רק במוק.', 'QA10: 10% on products without a bonus, orders above 100 ILS. Mock only.'),
    percentOff: 10,
    startsAt: '2026-01-01T00:00:00.000Z',
    active: true,
  },
  {
    id: 'promo-ps-plus',
    slug: 'ps-plus-annual',
    kind: PromotionKind.AmountOff,
    title: localized('PlayStation Plus שנתי במחיר מיוחד', 'PlayStation Plus annual deal'),
    description: localized(
      'מנוי ל-12 חודשים ב-329 ₪ במקום 399 ₪.',
      'A 12-month membership for 329 ILS instead of 399 ILS.',
    ),
    amountOff: fromMajor(70),
    gameIds: ['game-playstation'],
    productIds: ['prod-ps-plus'],
    startsAt: '2026-01-01T00:00:00.000Z',
    active: true,
  },
];

export const COUPONS: readonly Coupon[] = [
  {
    id: 'coupon-launch10',
    code: 'LAUNCH10',
    promotionId: 'promo-launch',
    minSubtotal: fromMajor(100),
    active: false,
  },
  {
    id: 'coupon-qa10',
    code: 'QA10',
    promotionId: 'promo-qa-ten',
    minSubtotal: fromMajor(100),
    active: true,
  },
];

/**
 * Customer reviews.
 *
 * Deliberately empty. The seed used to carry written testimonials with names,
 * star ratings and "verified purchase" badges, and every surface that renders
 * them presents them as statements real buyers made. None of them were. An
 * invented review is a claim about a person, and the storefront has no
 * customers to quote yet.
 *
 * The rendering path is intact and every review surface already handles the
 * empty case by hiding itself, so real reviews will appear here the moment
 * there are any.
 */
export const REVIEWS: readonly Review[] = [];

export const FAQ_ENTRIES: readonly FaqEntry[] = [
  {
    id: 'faq-region',
    topic: SupportTopic.RegionProblem,
    question: localized('מה זה אזור המוצר ולמה זה חשוב?', 'What is the product region and why does it matter?'),
    answer: localized(
      'מוצרים דיגיטליים כמו גיפט קארד ומנויים נעולים לאזור חנות מסוים. קוד שנקנה לאזור שגוי לא ניתן למימוש ולא ניתן להחזר, ולכן אנחנו מציגים את האזור בכרטיס המוצר, בעגלה ובתשלום ומבקשים אישור מפורש לפני הרכישה.',
      'Digital products such as gift cards and subscriptions are locked to a store region. A code bought for the wrong region cannot be redeemed and cannot be refunded, so we show the region on the product card, in the cart and at checkout, and ask you to confirm it before you buy.',
    ),
  },
  {
    id: 'faq-password',
    topic: SupportTopic.General,
    question: localized('האם תבקשו את הסיסמה שלי?', 'Will you ask for my password?'),
    answer: localized(
      'לא. לעולם לא נבקש סיסמה, קוד אימות דו-שלבי או קודי גיבוי. לא באתר, לא במייל ולא בצ׳אט. אם מישהו מבקש מכם פרטים כאלה בשמנו, זו הונאה.',
      'No. We will never ask for a password, a two-factor code or backup codes. Not on the site, not by email and not in chat. If anyone asks for these in our name, it is a scam.',
    ),
  },
  {
    id: 'faq-delivery',
    topic: SupportTopic.DeliveryProblem,
    question: localized('כמה זמן לוקחת האספקה?', 'How long does delivery take?'),
    answer: localized(
      'תלוי בשיטת האספקה שמופיעה על המוצר. קוד דיגיטלי מגיע תוך דקות ספורות מאישור התשלום; שירות ידני מסופק בדרך כלל תוך 5 עד 30 דקות; שירות בתוך המשחק מתואם איתכם מראש. הזמן המשוער מוצג על כל מוצר לפני הרכישה.',
      'It depends on the delivery method shown on the product. A digital code arrives within minutes of payment approval; a manual service is typically delivered within 5 to 30 minutes; an in-game service is scheduled with you. The estimate is shown on every product before you buy.',
    ),
  },
  {
    id: 'faq-payment',
    topic: SupportTopic.PaymentProblem,
    question: localized('אילו אמצעי תשלום נתמכים?', 'Which payment methods are supported?'),
    answer: localized(
      'האתר נמצא כרגע בשלב פיתוח ומריץ סימולציית תשלום בלבד. לא מתבצע חיוב אמיתי ולא נאספים פרטי כרטיס אשראי. אמצעי תשלום אמיתיים יופעלו לאחר חיבור ספק סליקה.',
      'The site is currently in development and runs a payment simulation only. No real charge is made and no card details are collected. Real payment methods will be enabled once a payment provider is connected.',
    ),
  },
  {
    id: 'faq-refund',
    topic: SupportTopic.RefundRequest,
    question: localized('מה מדיניות ההחזרים?', 'What is the refund policy?'),
    answer: localized(
      'הזמנה שטרם סופקה ניתנת לביטול והחזר מלא. קוד דיגיטלי שכבר נחשף אינו ניתן להחזר, אלא אם התברר שהוא פגום או שאינו תואם לאזור שהוזמן. פרטים מלאים בעמוד מדיניות ההחזרים.',
      'An order that has not been delivered yet can be cancelled for a full refund. A digital code that has already been revealed cannot be refunded, unless it turns out to be faulty or to not match the region ordered. Full details are on the refund policy page.',
    ),
  },
  {
    id: 'faq-order-status',
    topic: SupportTopic.OrderStatus,
    question: localized('איך אני עוקב אחרי ההזמנה?', 'How do I track my order?'),
    answer: localized(
      'כל הזמנה מקבלת דף סטטוס משלה עם ציר זמן שמראה בדיוק היכן היא עומדת, מהתשלום ועד האספקה. הקישור נשלח למייל וזמין גם באזור האישי.',
      'Every order gets its own status page with a timeline showing exactly where it stands, from payment through delivery. The link is emailed to you and is also available in your account.',
    ),
  },
];

/**
 * Payment providers. Only the simulator is enabled: the others are declared so the
 * UI can be built against them, and each is explicitly disabled until a real
 * integration exists. Nothing here claims a live integration we do not have.
 */
export const PAYMENT_PROVIDERS: readonly PaymentProviderDescriptor[] = [
  {
    id: PaymentProviderId.Mock,
    name: localized('סימולציית תשלום (פיתוח)', 'Payment simulation (development)'),
    description: localized(
      'סימולציה בלבד. לא מתבצע חיוב ולא נאספים פרטי אשראי.',
      'Simulation only. No charge is made and no card details are collected.',
    ),
    icon: 'science',
    enabled: true,
    simulated: true,
  },
  {
    id: PaymentProviderId.IsraelCard,
    name: localized('כרטיס אשראי', 'Credit card'),
    description: localized('יופעל עם חיבור ספק הסליקה.', 'Enabled once a payment provider is connected.'),
    icon: 'credit_card',
    enabled: false,
    simulated: false,
  },
  {
    id: PaymentProviderId.Bit,
    name: localized('ביט', 'Bit'),
    description: localized('יופעל עם חיבור ספק הסליקה.', 'Enabled once a payment provider is connected.'),
    icon: 'smartphone',
    enabled: false,
    simulated: false,
  },
  {
    id: PaymentProviderId.PayPal,
    name: localized('פייפאל', 'PayPal'),
    description: localized('יופעל עם חיבור ספק הסליקה.', 'Enabled once a payment provider is connected.'),
    icon: 'account_balance_wallet',
    enabled: false,
    simulated: false,
  },
];

/**
 * The simulator's test instruments.
 *
 * Every real gateway ships a set like this, and exposing them is what makes the
 * decline, cancel and error branches testable without randomness. They are shown
 * in the UI only while the selected provider is flagged `simulated`.
 */
export const SIMULATED_INSTRUMENTS: readonly SimulatedInstrument[] = [
  {
    token: 'sim_success',
    label: localized('תשלום מאושר', 'Approved payment'),
    description: localized('הסימולציה מחזירה אישור והזמנה עוברת לאספקה.', 'The simulation approves and the order moves to fulfillment.'),
    expectedStatus: PaymentStatus.Succeeded,
  },
  {
    token: 'sim_declined',
    label: localized('תשלום נדחה', 'Declined payment'),
    description: localized('הסימולציה מחזירה סירוב מצד המנפיק.', 'The simulation returns an issuer decline.'),
    expectedStatus: PaymentStatus.Failed,
  },
  {
    token: 'sim_cancelled',
    label: localized('ביטול על ידי הלקוח', 'Cancelled by customer'),
    description: localized('הלקוח נוטש את דף הספק והתשלום מבוטל.', 'The customer abandons the provider page and the payment is cancelled.'),
    expectedStatus: PaymentStatus.Cancelled,
  },
  {
    token: 'sim_error',
    label: localized('שגיאת תקשורת', 'Gateway error'),
    description: localized('הספק מחזיר שגיאה, וניתן לנסות שוב.', 'The gateway errors out, and the payment can be retried.'),
    expectedStatus: PaymentStatus.Failed,
  },
  {
    token: 'sim_timeout',
    label: localized('פסק זמן (איטי)', 'Timeout (slow)'),
    description: localized('התשלום נתקע במצב עיבוד, לבדיקת המצב הממתין.', 'The payment hangs in processing, which exercises the pending state.'),
    expectedStatus: PaymentStatus.Processing,
  },
];
