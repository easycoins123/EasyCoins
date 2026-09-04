import { BenefitKind, LocalizedText } from '../../domain';

/**
 * The stacking matrix, as the in-memory backend applies it.
 *
 * A mirror of `backend/src/modules/growth/benefit-policy.ts`: earned things
 * combine with the launch bonus, a coupon combines with nothing, one reward
 * per order. The mock is the server in mock mode, which is the only reason
 * this rule exists on the client at all; no component reads it.
 */
export interface BenefitRequest {
  readonly kind: BenefitKind;
  readonly label: LocalizedText;
}

export interface BenefitRejection extends BenefitRequest {
  readonly code: 'NOT_COMBINABLE' | 'ONE_PER_ORDER';
  readonly conflictsWith: BenefitKind;
  readonly reason: LocalizedText;
}

const COMBINES_WITH: Readonly<Record<BenefitKind, readonly BenefitKind[]>> = {
  LAUNCH_BONUS: ['REWARD', 'LOYALTY'],
  REWARD: ['LAUNCH_BONUS', 'LOYALTY'],
  LOYALTY: ['LAUNCH_BONUS', 'REWARD'],
  COUPON: [],
};

const PRECEDENCE: readonly BenefitKind[] = ['LAUNCH_BONUS', 'REWARD', 'LOYALTY', 'COUPON'];

const NAMES: Readonly<Record<BenefitKind, LocalizedText>> = {
  LAUNCH_BONUS: { he: 'בונוס ההשקה', en: 'the launch bonus' },
  REWARD: { he: 'ההטבה שבחרתם', en: 'the reward you chose' },
  LOYALTY: { he: 'הטבת הדרגה', en: 'your tier benefit' },
  COUPON: { he: 'הקופון', en: 'the coupon' },
};

export function resolveMockBenefits(requests: readonly BenefitRequest[]): { applied: BenefitRequest[]; rejected: BenefitRejection[] } {
  const ordered = [...requests].sort((a, b) => PRECEDENCE.indexOf(a.kind) - PRECEDENCE.indexOf(b.kind));
  const applied: BenefitRequest[] = [];
  const rejected: BenefitRejection[] = [];
  for (const request of ordered) {
    if (applied.some((entry) => entry.kind === request.kind)) {
      rejected.push({ ...request, code: 'ONE_PER_ORDER', conflictsWith: request.kind, reason: { he: 'הטבה אחת מהסוג הזה להזמנה.', en: 'One benefit of this kind per order.' } });
      continue;
    }
    const blocker = applied.find((entry) => !COMBINES_WITH[entry.kind].includes(request.kind));
    if (blocker) {
      rejected.push({
        ...request,
        code: 'NOT_COMBINABLE',
        conflictsWith: blocker.kind,
        reason: {
          he: `${NAMES[blocker.kind].he} כבר בהזמנה הזו, ו${NAMES[request.kind].he} לא מצטרף אליו. הטבה אחת מהסוג הזה להזמנה.`,
          en: `${NAMES[blocker.kind].en} is already on this order and ${NAMES[request.kind].en} does not combine with it. One benefit of this kind per order.`,
        },
      });
      continue;
    }
    applied.push(request);
  }
  return { applied, rejected };
}
