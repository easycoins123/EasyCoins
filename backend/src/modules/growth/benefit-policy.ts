/**
 * The stacking engine: which benefits may share one order.
 *
 * Every benefit a customer can hold is one of four kinds, and the matrix
 * below is the whole rule. The storefront never decides this; it repeats the
 * server's answer, including the reason a benefit was set aside, so the
 * checkout can say "the launch bonus is on this order, the code is not" in
 * as many words.
 *
 *   LAUNCH_BONUS  extra coins the catalog attaches to a bundle. Inherent to
 *                 the line: it cannot be removed, only combined with or not.
 *   REWARD        one earned reward the customer chose to use: an EasyDrop
 *                 card, a referral bonus, a campaign reward, an EasyBack.
 *   LOYALTY       a tier benefit, when the owner configures one.
 *   COUPON        a code typed into the cart.
 *
 * The rule in one line: earned things combine with the launch bonus; a coupon
 * combines with nothing. One reward per order.
 */
export type BenefitKind = 'LAUNCH_BONUS' | 'REWARD' | 'LOYALTY' | 'COUPON';

export interface BenefitRequest {
  readonly kind: BenefitKind;
  /** What it is, for the explanation: a reward title, the coupon code. */
  readonly label: { readonly he: string; readonly en: string };
}

export interface RejectedBenefit extends BenefitRequest {
  readonly code: 'NOT_COMBINABLE' | 'ONE_PER_ORDER';
  readonly conflictsWith: BenefitKind;
  readonly reason: { readonly he: string; readonly en: string };
}

export interface BenefitResolution {
  readonly applied: readonly BenefitRequest[];
  readonly rejected: readonly RejectedBenefit[];
}

/** Which kinds may sit on the same order. Symmetric by construction. */
const COMBINES_WITH: Readonly<Record<BenefitKind, readonly BenefitKind[]>> = {
  LAUNCH_BONUS: ['REWARD', 'LOYALTY'],
  REWARD: ['LAUNCH_BONUS', 'LOYALTY'],
  LOYALTY: ['LAUNCH_BONUS', 'REWARD'],
  COUPON: [],
};

/**
 * Who wins when two cannot share. Earlier beats later: the bonus the catalog
 * promised on the shelf beats everything, an explicit reward choice beats a
 * status benefit, and a typed code yields to all of them.
 */
const PRECEDENCE: readonly BenefitKind[] = ['LAUNCH_BONUS', 'REWARD', 'LOYALTY', 'COUPON'];

const NAMES: Readonly<Record<BenefitKind, { he: string; en: string }>> = {
  LAUNCH_BONUS: { he: 'בונוס ההשקה', en: 'the launch bonus' },
  REWARD: { he: 'ההטבה שבחרתם', en: 'the reward you chose' },
  LOYALTY: { he: 'הטבת הדרגה', en: 'your tier benefit' },
  COUPON: { he: 'הקופון', en: 'the coupon' },
};

export function canCombine(a: BenefitKind, b: BenefitKind): boolean {
  return a !== b && COMBINES_WITH[a].includes(b);
}

/**
 * Resolves a set of requested benefits into the ones that apply.
 *
 * Deterministic: requests are ordered by precedence, each is kept if it
 * combines with everything already kept, and a second request of the same
 * kind is set aside as "one per order". The output is the same for the same
 * input whatever order the caller listed it in.
 */
export function resolveBenefits(requests: readonly BenefitRequest[]): BenefitResolution {
  const ordered = [...requests].sort((a, b) => PRECEDENCE.indexOf(a.kind) - PRECEDENCE.indexOf(b.kind));
  const applied: BenefitRequest[] = [];
  const rejected: RejectedBenefit[] = [];

  for (const request of ordered) {
    const sameKind = applied.find((entry) => entry.kind === request.kind);
    if (sameKind) {
      rejected.push({
        ...request,
        code: 'ONE_PER_ORDER',
        conflictsWith: request.kind,
        reason: {
          he: `אפשר להשתמש ב${NAMES[request.kind].he.replace(/^ה/, '')} אחת בלבד בכל הזמנה.`,
          en: `Only one ${NAMES[request.kind].en.replace(/^the /, '')} can be used per order.`,
        },
      });
      continue;
    }
    const blocker = applied.find((entry) => !canCombine(entry.kind, request.kind));
    if (blocker) {
      rejected.push({
        ...request,
        code: 'NOT_COMBINABLE',
        conflictsWith: blocker.kind,
        reason: {
          he: `${capitalize(NAMES[blocker.kind].he)} כבר בהזמנה הזו, ו${NAMES[request.kind].he} לא מצטרף אליו. הטבה אחת מהסוג הזה להזמנה.`,
          en: `${capitalize(NAMES[blocker.kind].en)} is already on this order and ${NAMES[request.kind].en} does not combine with it. One benefit of this kind per order.`,
        },
      });
      continue;
    }
    applied.push(request);
  }

  return { applied, rejected };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
