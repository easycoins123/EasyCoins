import { TestBed } from '@angular/core/testing';

import { CartBenefits } from '../../../domain';
import { BenefitsNoteComponent } from './benefits-note.component';

/**
 * A benefit with a money effect has to render.
 *
 * This exists because of a real defect: the note built a `MoneyPipe` with
 * `new`, and the pipe injects the locale service, which only works inside an
 * injection context. Every benefit with only coins rendered fine; the first
 * customer to apply a credit reward saw the cart's benefits line throw
 * NG0203 on every re-pricing. The browser harness caught it; nothing here did.
 */
describe('BenefitsNoteComponent', () => {
  function render(benefits: CartBenefits): HTMLElement {
    TestBed.configureTestingModule({ imports: [BenefitsNoteComponent] });
    const fixture = TestBed.createComponent(BenefitsNoteComponent);
    fixture.componentRef.setInput('benefits', benefits);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders a credit reward with its amount in shekels', () => {
    const host = render({
      applied: [{
        kind: 'REWARD',
        rewardId: 'rw_1',
        label: { he: 'זיכוי EASYDROP', en: 'EasyDrop credit' },
        effect: { coins: 0, discount: { amountMinor: 500, currency: 'ILS' } },
      }],
      rejected: [],
      rewardCoins: 0,
      campaignCoins: 0,
    });

    const text = host.textContent ?? '';
    expect(text).toContain('זיכוי EASYDROP');
    expect(text).toContain('5');
    expect(text).toContain('מהסכום');
  });

  it('renders a coin benefit and a set-aside benefit with the server reason', () => {
    const host = render({
      applied: [{
        kind: 'FIRST_ORDER',
        label: { he: 'FIRST KICK', en: 'FIRST KICK' },
        effect: { coins: 50_000, discount: { amountMinor: 0, currency: 'ILS' } },
      }],
      rejected: [{
        kind: 'COUPON',
        code: 'QA10',
        couponCode: 'QA10',
        label: { he: 'קופון QA10', en: 'Coupon QA10' },
        reason: { he: 'לא מצטרף להטבת הזמנה ראשונה', en: 'Does not combine with the first-order benefit' },
      }],
      rewardCoins: 0,
      campaignCoins: 50_000,
    });

    const text = host.textContent ?? '';
    expect(text).toContain('+50K קוינס');
    expect(text).toContain('לא מצטרף להטבת הזמנה ראשונה');
  });
});
