import { CheckoutFieldKey, CheckoutRequirement, localized } from '../../domain';
import { FIELD_HELP, validateLocally } from './checkout-validation';

const REQUIREMENTS: CheckoutRequirement[] = [
  { key: CheckoutFieldKey.FullName, control: 'text', label: localized('שם מלא'), required: true, maxLength: 80 },
  { key: CheckoutFieldKey.Email, control: 'email', label: localized('אימייל'), required: true, maxLength: 120 },
  { key: CheckoutFieldKey.Phone, control: 'tel', label: localized('טלפון'), required: false, maxLength: 20 },
  { key: CheckoutFieldKey.PlatformAccountHandle, control: 'text', label: localized('שם משתמש'), required: true, maxLength: 64 },
  { key: CheckoutFieldKey.TermsAcceptance, control: 'checkbox', label: localized('תנאים'), required: true },
];

describe('checkout local validation', () => {
  it('names every required field that is empty, in plain words', () => {
    const issues = validateLocally(REQUIREMENTS, {});
    expect(issues.map((issue) => issue.field)).toEqual([
      CheckoutFieldKey.FullName, CheckoutFieldKey.Email, CheckoutFieldKey.PlatformAccountHandle, CheckoutFieldKey.TermsAcceptance,
    ]);
    expect(issues.find((issue) => issue.field === CheckoutFieldKey.TermsAcceptance)?.message.he).toContain('לאשר');
  });

  it('does not complain about an empty optional field', () => {
    const issues = validateLocally(REQUIREMENTS, {
      FULL_NAME: 'דנה', EMAIL: 'dana@example.com', PLATFORM_ACCOUNT_HANDLE: 'dana_il', TERMS_ACCEPTANCE: true,
    });
    expect(issues).toEqual([]);
  });

  it('rejects an email without a domain and keeps the other answers untouched', () => {
    const values = { FULL_NAME: 'דנה', EMAIL: 'dana@', PLATFORM_ACCOUNT_HANDLE: 'dana_il', TERMS_ACCEPTANCE: true };
    const issues = validateLocally(REQUIREMENTS, values);
    expect(issues.length).toBe(1);
    expect(issues[0].field).toBe(CheckoutFieldKey.Email);
    expect(values.FULL_NAME).toBe('דנה');
  });

  it('enforces the maximum length', () => {
    const issues = validateLocally(REQUIREMENTS, {
      FULL_NAME: 'א'.repeat(81), EMAIL: 'dana@example.com', PLATFORM_ACCOUNT_HANDLE: 'x', TERMS_ACCEPTANCE: true,
    });
    expect(issues.map((issue) => issue.field)).toEqual([CheckoutFieldKey.FullName]);
  });

  it('explains the username field without ever mentioning a password as something to enter', () => {
    const help = FIELD_HELP[CheckoutFieldKey.PlatformAccountHandle];
    expect(help?.answer).toContain('לא סיסמה');
  });
});
