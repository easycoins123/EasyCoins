/**
 * The offers ecosystem, described once.
 *
 * A campaign is a piece of merchandising with a truthful state. Its state is
 * never typed in: it is resolved from what is real at the moment of asking.
 *
 *   catalog   active while the catalog carries the launch bonus on its bundles
 *   coupon    active while the server lists the promotion as active
 *   dates     active between `startsAt` and `endsAt`, upcoming before, ended after
 *   planned   designed and visible as "in preparation"; never shown as live
 *
 * No countdown is shown unless a campaign has a real `endsAt`. No winner,
 * participant count or stock figure exists here, because none is real.
 */
export type CampaignKind =
  | 'launch-bonus'
  | 'launch-code'
  | 'first-buyers'
  | 'weekend-drop'
  | 'special-package'
  | 'returning'
  | 'referral';

export type CampaignStatus = 'active' | 'upcoming' | 'ended' | 'planned';

export type CampaignSource = 'catalog' | 'coupon' | 'dates' | 'planned';

export interface Campaign {
  readonly id: string;
  readonly kind: CampaignKind;
  readonly source: CampaignSource;
  /** The coupon promotion slug, for `coupon` campaigns. */
  readonly promotionSlug?: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  /** One line per fact, in the customer's words. */
  readonly points: readonly string[];
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly cta?: { readonly label: string; readonly link: string };
  readonly icon: 'coins' | 'tag' | 'crown' | 'bolt' | 'package' | 'market' | 'star';
}

export interface CampaignContext {
  readonly now: Date;
  readonly launchBonusActive: boolean;
  /** Slugs of promotions the server currently lists as active. */
  readonly activePromotionSlugs: ReadonlySet<string>;
}

export const CAMPAIGNS: readonly Campaign[] = [
  {
    id: 'launch-bonus',
    kind: 'launch-bonus',
    source: 'catalog',
    eyebrow: 'בונוס השקה',
    title: 'קונים עכשיו, מקבלים יותר קוינס',
    lede: 'על כל חבילה בתקופת ההשקה מתווספים קוינס, לא הנחה על נייר. הבונוס מופיע בהזמנה ומגיע יחד עם הקוינס.',
    points: ['הבונוס גדל עם החבילה', 'מופיע בעגלה, בתשלום ובדף ההזמנה', 'ללא קוד, ללא תנאים נסתרים'],
    cta: { label: 'לכל החבילות', link: '/store' },
    icon: 'coins',
  },
  {
    id: 'launch-code',
    kind: 'launch-code',
    source: 'coupon',
    promotionSlug: 'launch-week',
    eyebrow: 'קוד השקה',
    title: 'LAUNCH10: עוד 10% על הזמנה מעל 100 ₪',
    lede: 'מזינים את הקוד בעגלה. ההנחה מחושבת בשרת ומופיעה בסיכום לפני התשלום.',
    points: ['הטבה אחת להזמנה: לא מצטרף לבונוס ההשקה', 'תקף להזמנות מעל 100 ₪'],
    cta: { label: 'לעגלה', link: '/cart' },
    icon: 'tag',
  },
  {
    id: 'first-buyers',
    kind: 'first-buyers',
    source: 'catalog',
    eyebrow: 'מועדון הראשונים',
    title: 'ההרכב הפותח של EasyCoins',
    lede: 'מי שמזמין בתקופת ההשקה נכנס להרכב הפותח: הבונוס הגדול ביותר שנציע אי פעם, ודף הזמנה עם מעקב מלא.',
    points: ['בונוס השקה על כל הזמנה', 'סטטוס אישי לכל הזמנה', 'תמיכה בעברית, במייל'],
    icon: 'crown',
  },
  {
    id: 'weekend-drop',
    kind: 'weekend-drop',
    source: 'planned',
    eyebrow: 'דרופ סוף שבוע',
    title: 'הדרופ הראשון בהכנה',
    lede: 'חבילה מיוחדת או בונוס קוינס, לזמן קצוב, עם שעון אמיתי. התאריך יפורסם כאן כשייקבע.',
    points: ['שעון רק כשיש מועד אמיתי', 'בונוסים בקוינס, לא בהנחות מזויפות'],
    cta: { label: 'לדף המבצעים', link: '/deals' },
    icon: 'bolt',
  },
  {
    id: 'special-package',
    kind: 'special-package',
    source: 'planned',
    eyebrow: 'חבילה מיוחדת',
    title: 'חבילות מהדורה',
    lede: 'כמויות שלא בסולם הקבוע, סביב אירועי המשחק. נפתח לפי לוח האירועים של העונה.',
    points: ['לפי אירועי FC', 'כמות ומחיר סופיים לפני התשלום'],
    icon: 'package',
  },
  {
    id: 'returning',
    kind: 'returning',
    source: 'planned',
    eyebrow: 'לקוחות חוזרים',
    title: 'הטבה לחוזרים',
    lede: 'מי שכבר הזמין יקבל הצעה משלו בהזמנה הבאה. נבנה על היסטוריית ההזמנות בחשבון, לא על קודים שמסתובבים.',
    points: ['דרך החשבון האישי', 'אחרי הזמנה ששולמה'],
    cta: { label: 'לחשבון', link: '/account' },
    icon: 'market',
  },
  {
    id: 'referral',
    kind: 'referral',
    source: 'planned',
    eyebrow: 'חבר מביא חבר',
    title: 'חבר מקבל, אתם מקבלים',
    lede: 'חבר שמגיע דרככם מקבל הטבה על ההזמנה הראשונה; אתם מקבלים תגמול אחרי שההזמנה שלו שולמה ואושרה.',
    points: ['תגמול רק אחרי תשלום שאושר', 'קישור אישי מהחשבון', 'נפתח בקרוב'],
    cta: { label: 'לחשבון', link: '/account' },
    icon: 'star',
  },
];

export function campaignStatus(campaign: Campaign, context: CampaignContext): CampaignStatus {
  switch (campaign.source) {
    case 'catalog':
      return context.launchBonusActive ? 'active' : 'ended';
    case 'coupon':
      return campaign.promotionSlug && context.activePromotionSlugs.has(campaign.promotionSlug) ? 'active' : 'ended';
    case 'dates': {
      const starts = campaign.startsAt ? new Date(campaign.startsAt) : undefined;
      const ends = campaign.endsAt ? new Date(campaign.endsAt) : undefined;
      if (starts && context.now < starts) {
        return 'upcoming';
      }
      if (ends && context.now > ends) {
        return 'ended';
      }
      return 'active';
    }
    default:
      return 'planned';
  }
}

export const STATUS_LABELS: Readonly<Record<CampaignStatus, string>> = {
  active: 'פעיל עכשיו',
  upcoming: 'בקרוב',
  ended: 'הסתיים',
  planned: 'בהכנה',
};

export interface CampaignView extends Campaign {
  readonly status: CampaignStatus;
  readonly statusLabel: string;
}

export function resolveCampaigns(context: CampaignContext): readonly CampaignView[] {
  return CAMPAIGNS.map((campaign) => {
    const status = campaignStatus(campaign, context);
    return { ...campaign, status, statusLabel: STATUS_LABELS[status] };
  });
}
