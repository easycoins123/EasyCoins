import { Drop, FoundersStatus, GrowthProgrammes } from '../../domain';

/**
 * The offers ecosystem, described once.
 *
 * A campaign is a piece of merchandising with a truthful state. Its state is
 * never typed in: it is resolved from what is real at the moment of asking.
 *
 *   catalog    active while the catalog carries the launch bonus on its bundles
 *   coupon     active while the server lists the promotion as active
 *   programme  active while the server says the programme is on
 *   drop       the Drop Zone: a live or dated drop from the server, else "cooking"
 *
 * No countdown is shown unless a drop has a real `endsAt`. No winner,
 * participant count or stock figure exists here; the only numbers are the
 * server's, such as the founders' seats actually taken.
 */
export type CampaignKind =
  | 'launch-bonus'
  | 'launch-code'
  | 'easydrop'
  | 'easyclub'
  | 'first-buyers'
  | 'weekend-drop'
  | 'referral'
  | 'custom-coins';

export type CampaignStatus = 'active' | 'upcoming' | 'ended' | 'planned';

export type CampaignSource = 'catalog' | 'coupon' | 'programme' | 'drop';

export type CampaignIcon = 'coins' | 'tag' | 'crown' | 'bolt' | 'package' | 'market' | 'star' | 'gift' | 'edit';

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
  readonly icon: CampaignIcon;
}

export interface CampaignContext {
  readonly now: Date;
  readonly launchBonusActive: boolean;
  /** Slugs of promotions the server currently lists as active. */
  readonly activePromotionSlugs: ReadonlySet<string>;
  /** Which programmes are on, from the server. Null while unknown or unreachable. */
  readonly programmes: GrowthProgrammes | null;
  /** Live and dated upcoming drops, from the server. */
  readonly drops: readonly Drop[];
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

/** The two campaigns whose copy is fixed; their state still comes from the server. */
const FIXED: readonly Campaign[] = [
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
];

function view(campaign: Campaign, status: CampaignStatus): CampaignView {
  return { ...campaign, status, statusLabel: STATUS_LABELS[status] };
}

function foundersLede(founders: FoundersStatus): string {
  if (founders.remaining <= 0) {
    return `כל ${founders.cap} המקומות ב־${founders.name.he} נתפסו. תודה למי שהיו ראשונים.`;
  }
  return `${founders.cap} הלקוחות הראשונים עם הזמנה ששולמה נכנסים ל־${founders.name.he}: סימון קבוע בחשבון והטבה שהוגדרה לתוכנית. עד עכשיו נתפסו ${founders.taken} מקומות.`;
}

/** The drop zone as one campaign: a real drop, or the honest "next one is cooking". */
function dropCampaign(drops: readonly Drop[], now: Date): CampaignView {
  const live = drops.find((drop) => drop.status === 'active');
  const scheduled = drops.find((drop) => drop.status === 'scheduled' && drop.startsAt);
  const drop = live ?? scheduled;
  if (drop) {
    const status: CampaignStatus = drop.status === 'active' ? 'active' : 'upcoming';
    return view({
      id: `drop-${drop.id}`,
      kind: 'weekend-drop',
      source: 'drop',
      eyebrow: 'DROP ZONE',
      title: drop.title.he,
      lede: drop.lede.he,
      points: [
        ...drop.points.map((point) => point.he),
        ...(drop.reward ? [drop.reward.title.he] : []),
        ...(drop.remaining !== undefined ? [`נותרו ${drop.remaining} מימושים`] : []),
      ],
      startsAt: drop.startsAt,
      endsAt: drop.endsAt,
      cta: drop.cta ? { label: drop.cta.label.he, link: drop.cta.link } : { label: 'לדף המבצעים', link: '/deals' },
      icon: 'bolt',
    }, status);
  }
  void now;
  return view({
    id: 'drop-cooking',
    kind: 'weekend-drop',
    source: 'drop',
    eyebrow: 'DROP ZONE',
    title: 'הדרופ הבא מתבשל',
    lede: 'דרופים הם בונוסים בקוינס לזמן קצוב, עם שעון אמיתי בלבד. כשייקבע מועד הוא יופיע כאן ובדף המבצעים.',
    points: ['שעון רק כשיש מועד אמיתי', 'בונוסים בקוינס, לא הנחות מזויפות', 'הדרופ נכנס ל־EASYCLUB אחרי התשלום'],
    cta: { label: 'לדף המבצעים', link: '/deals' },
    icon: 'bolt',
  }, 'planned');
}

export function resolveCampaigns(context: CampaignContext): readonly CampaignView[] {
  const { programmes, drops } = context;
  const result: CampaignView[] = [];

  for (const campaign of FIXED) {
    if (campaign.source === 'catalog') {
      result.push(view(campaign, context.launchBonusActive ? 'active' : 'ended'));
    } else if (campaign.source === 'coupon') {
      result.push(view(campaign, campaign.promotionSlug && context.activePromotionSlugs.has(campaign.promotionSlug) ? 'active' : 'ended'));
    }
  }

  const easyDropOn = programmes?.easydrop.enabled === true;
  result.push(view({
    id: 'easydrop',
    kind: 'easydrop',
    source: 'programme',
    eyebrow: 'EASYDROP',
    title: 'הטבה מובטחת אחרי כל הזמנה ששולמה',
    lede: 'אחרי התשלום פותחים קלף אחד מתוך שלושה. מאחורי כל קלף יש הטבה אמיתית: קוינס להזמנה הבאה, זיכוי, נקודות או קפיצת דרגה. אין קלף ריק.',
    points: [
      ...(programmes ? programmes.easydrop.tiers.map((tier) => `${tier.name.he} להזמנה מ־${Math.round(tier.minTotal.amountMinor / 100)} ₪`) : []),
      'הקלף נבחר פעם אחת ונשמר בשרת. רענון לא מגריל מחדש.',
    ],
    cta: { label: 'לחבילות', link: '/store' },
    icon: 'gift',
  }, easyDropOn ? 'active' : 'planned'));

  result.push(view({
    id: 'easyclub',
    kind: 'easyclub',
    source: 'programme',
    eyebrow: 'EASYCLUB',
    title: 'נקודות על כל שקל, דרגות שנפתחות, היסטוריית הטבות',
    lede: 'כל הזמנה ששולמה צוברת EasyPoints. הנקודות מזיזות אתכם בין הדרגות; מה שכל דרגה נותנת כתוב בחשבון, ומה שלא מוגדר לא מובטח.',
    points: [
      ...(programmes ? [programmes.easyclub.tiers.map((tier) => tier.name.he).join(' · ')] : []),
      ...(programmes?.streak.enabled ? [`רצף: הזמנה שנייה ושלישית בתוך ${programmes.streak.windowDays} יום מקבלות תוספת`] : []),
      'הנקודות מחושבות מההזמנות ששולמו, לא מקוד',
    ],
    cta: { label: 'ל־EASYCLUB', link: '/account/club' },
    icon: 'crown',
  }, programmes ? 'active' : 'planned'));

  if (programmes?.founders.enabled) {
    result.push(view({
      id: 'first-buyers',
      kind: 'first-buyers',
      source: 'programme',
      eyebrow: programmes.founders.name.he,
      title: `${programmes.founders.cap} הראשונים`,
      lede: foundersLede(programmes.founders),
      points: [
        `${programmes.founders.taken} מתוך ${programmes.founders.cap} מקומות נתפסו`,
        ...(programmes.founders.reward ? [programmes.founders.reward.he] : []),
        'נדרש חשבון: המקום נרשם על הלקוח, לא על הדפדפן',
      ],
      cta: { label: 'לחשבון', link: '/account' },
      icon: 'star',
    }, programmes.founders.remaining > 0 ? 'active' : 'ended'));
  }

  result.push(dropCampaign(drops, context.now));

  result.push(view({
    id: 'referral',
    kind: 'referral',
    source: 'programme',
    eyebrow: 'חבר מביא חבר',
    title: 'חבר מקבל, אתם מקבלים',
    lede: programmes?.referral.enabled
      ? `חבר שמגיע דרך הקישור שלכם מקבל ${programmes.referral.friendReward.he}. אתם מקבלים ${programmes.referral.referrerReward.he}, אחרי שההזמנה הראשונה שלו שולמה.`
      : 'חבר שמגיע דרככם מקבל הטבה על ההזמנה הראשונה; אתם מקבלים תגמול אחרי שההזמנה שלו שולמה ואושרה.',
    points: ['תגמול רק אחרי תשלום שאושר', 'קישור אישי מהחשבון', 'לא על עצמכם, לא פעמיים על אותו חבר'],
    cta: { label: 'לקישור שלכם', link: '/account/club' },
    icon: 'market',
  }, programmes?.referral.enabled ? 'active' : 'planned'));

  if (programmes?.customCoins.enabled) {
    result.push(view({
      id: 'custom-coins',
      kind: 'custom-coins',
      source: 'programme',
      eyebrow: 'כמות מותאמת',
      title: 'כמה קוינס אני רוצה? יש לי תקציב של…',
      lede: 'מזינים כמות מדויקת או תקציב, והשרת מתמחר לפי הסולם: בין שתי חבילות משלמים את המחיר לקוין של החבילה שמתחת. אף פעם לא יותר יקר מלקנות את החבילה הבאה.',
      points: [
        `מ־${Math.round(programmes.customCoins.minCoins / 1000)}K עד ${Math.round(programmes.customCoins.maxCoins / 1_000_000)}M, בקפיצות של ${Math.round(programmes.customCoins.stepCoins / 1000)}K`,
        'בונוס ההשקה מחושב על הכמות המותאמת',
      ],
      cta: { label: 'לכמות מותאמת', link: '/store#custom' },
      icon: 'edit',
    }, 'active'));
  }

  return result;
}
