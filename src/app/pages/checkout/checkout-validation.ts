import { CheckoutFieldKey, CheckoutFieldValues, CheckoutRequirement, CheckoutValidationIssue, localized } from '../../domain';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Checks the details form before it leaves the browser.
 *
 * The server validates again and stays authoritative; this pass exists so a
 * customer who left a field empty hears about it at once, next to the field,
 * in plain words, instead of after a round trip. The rules mirror the
 * server's: required, maximum length, a checkbox that must be ticked, and an
 * email that looks like one.
 */
export function validateLocally(
  requirements: readonly CheckoutRequirement[],
  values: CheckoutFieldValues,
): readonly CheckoutValidationIssue[] {
  const issues: CheckoutValidationIssue[] = [];
  for (const requirement of requirements) {
    const value = values[requirement.key];
    if (requirement.control === 'checkbox') {
      if (requirement.required && value !== true) {
        issues.push({ field: requirement.key, message: missingMessage(requirement) });
      }
      continue;
    }
    const text = typeof value === 'string' ? value.trim() : '';
    if (requirement.required && text.length === 0) {
      issues.push({ field: requirement.key, message: missingMessage(requirement) });
      continue;
    }
    if (requirement.maxLength !== undefined && text.length > requirement.maxLength) {
      issues.push({ field: requirement.key, message: localized(`עד ${requirement.maxLength} תווים.`, `Up to ${requirement.maxLength} characters.`) });
      continue;
    }
    if (requirement.key === CheckoutFieldKey.Email && text.length > 0 && !EMAIL_PATTERN.test(text)) {
      issues.push({ field: requirement.key, message: localized('כתובת האימייל לא נראית תקינה. בדקו שיש @ ונקודה.', 'That email address does not look right.') });
    }
  }
  return issues;
}

function missingMessage(requirement: CheckoutRequirement): CheckoutValidationIssue['message'] {
  switch (requirement.key) {
    case CheckoutFieldKey.TermsAcceptance:
      return localized('כדי להמשיך צריך לאשר את התנאים.', 'Please accept the terms to continue.');
    case CheckoutFieldKey.RegionConfirmation:
      return localized('כדי להמשיך צריך לאשר את אזור החנות.', 'Please confirm the store region to continue.');
    case CheckoutFieldKey.Email:
      return localized('צריך אימייל, לשם נשלח את אישור ההזמנה.', 'We need an email to send the confirmation to.');
    case CheckoutFieldKey.FullName:
      return localized('צריך שם, כדי שנדע למי ההזמנה.', 'We need a name for the order.');
    case CheckoutFieldKey.PlatformAccountHandle:
      return localized('צריך את שם המשתמש במשחק, כדי שנדע לאן לספק.', 'We need the in-game username to deliver to.');
    default:
      return localized('השדה הזה חובה.', 'This field is required.');
  }
}

/**
 * Plain-language help for the fields a parent may not recognise, shown on
 * request under the field. Keyed by requirement, not by product, so every
 * order that asks the question explains it the same way.
 */
export const FIELD_HELP: Readonly<Partial<Record<CheckoutFieldKey, { readonly question: string; readonly answer: string }>>> = {
  [CheckoutFieldKey.PlatformAccountHandle]: {
    question: 'מה זה שם המשתמש?',
    answer: 'השם שמופיע בחשבון המשחק: ה־ID ב־PlayStation, ה־Gamertag ב־Xbox או ה־EA ID במחשב. רואים אותו במסך הפרופיל בקונסולה או במשחק. זה לא סיסמה, ולעולם לא נבקש סיסמה.',
  },
  [CheckoutFieldKey.GamePlayerId]: {
    question: 'איפה מוצאים את זה?',
    answer: 'השם שאיתו מוצאים אתכם במשחק, כפי שמופיע בפרופיל. בלי סיסמה ובלי קוד אימות.',
  },
  [CheckoutFieldKey.ServiceNote]: {
    question: 'מה כותבים כאן?',
    answer: 'לא חובה. למשל מתי נוח לכם שניצור קשר לתיאום האספקה, או כל פרט שיעזור לנציג.',
  },
  [CheckoutFieldKey.RegionConfirmation]: {
    question: 'איך בודקים את אזור החנות?',
    answer: 'קוד דיגיטלי עובד רק בחשבון שאזור החנות שלו תואם. בודקים בהגדרות החשבון בקונסולה: "מדינה/אזור" של החנות.',
  },
  [CheckoutFieldKey.Phone]: {
    question: 'למה טלפון?',
    answer: 'לא חובה. אם משהו באספקה דורש תיאום מהיר, נעדיף להתקשר מאשר לחכות למייל.',
  },
};
