import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { NotificationService } from '../../core/error';
import { ReferralAttachResult, localized } from '../../domain';
import { GrowthFacade } from '../../state/growth.facade';

/**
 * `/r/:code`: a friend's link.
 *
 * Records the attribution on the server (which opens an anonymous session
 * to hang it on), says in one line what the visitor gets and when, and
 * sends them to the home page. Nothing is rewarded here: the reward is
 * written only when this visitor's first order is paid.
 */
@Component({
  selector: 'tt-referral-landing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="tt-container tt-section tt-page-center"><p class="tt-muted" aria-live="polite">רגע, מקשרים אתכם…</p></div>`,
})
export class ReferralLandingPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly growth = inject(GrowthFacade);
  private readonly notifications = inject(NotificationService);

  ngOnInit(): void {
    const code = (this.route.snapshot.paramMap.get('code') ?? '').trim();
    const leave = () => void this.router.navigateByUrl('/', { replaceUrl: true });
    if (!/^[A-Za-z0-9-]{4,20}$/.test(code)) {
      leave();
      return;
    }
    this.growth.attachReferral(code).subscribe({
      next: (result) => {
        const message = this.messageFor(result);
        if (message) {
          this.notifications.info(message);
        }
        leave();
      },
      error: () => leave(),
    });
  }

  private messageFor(result: ReferralAttachResult) {
    switch (result.outcome) {
      case 'ATTACHED':
        return localized(
          `הגעתם דרך חבר. אחרי ההזמנה הראשונה שלכם ששולמה תקבלו ${result.friendReward?.he ?? 'הטבה'}.`,
          `You came through a friend. After your first paid order you get ${result.friendReward?.en ?? 'a reward'}.`,
        );
      case 'ALREADY_ATTACHED':
        return localized('הקישור כבר נרשם. ההטבה מחכה להזמנה הראשונה.', 'The link is already recorded. The reward waits for your first order.');
      case 'SELF':
        return localized('זה הקישור שלכם. שלחו אותו לחבר.', 'This is your own link. Send it to a friend.');
      case 'EXISTING_CUSTOMER':
        return localized('חבר מביא חבר מיועד ללקוחות חדשים. ה־EASYDROP שלכם ממשיך כרגיל.', 'Referral is for new customers. Your EASYDROP continues as usual.');
      case 'UNKNOWN_CODE':
        return localized('הקוד בקישור לא נמצא.', 'The code in that link was not found.');
      default:
        return null;
    }
  }
}
