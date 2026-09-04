import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

/**
 * Moves what a guest session earned to the customer who just signed in.
 *
 * The sibling of `OrderAccessService.claimSessionOrders`, run beside it at
 * every sign-in: the reward a guest revealed after paying must be in their
 * account when they open one, or the promise on the success page was empty.
 * Only rows owned by that exact session move, so signing in cannot claim
 * anyone else's.
 *
 * Provided directly by `CustomersModule` rather than imported from the growth
 * module (which imports customers for its sessions): it needs Prisma alone.
 */
@Injectable()
export class GrowthClaimService {
  constructor(private readonly prisma: PrismaService) {}

  async claimSession(sessionId: string, customerId: string): Promise<{ rewards: number; drops: number; referrals: number }> {
    const [rewards, drops] = await Promise.all([
      this.prisma.customerReward.updateMany({ where: { sessionId, customerId: null }, data: { customerId } }),
      this.prisma.easyDrop.updateMany({ where: { sessionId, customerId: null }, data: { customerId } }),
    ]);
    await this.prisma.campaignClaim.updateMany({ where: { sessionId, customerId: null }, data: { customerId } });

    // A customer has one attribution. If the account already carries one, the
    // session's pending one is closed as a duplicate rather than attached.
    let referrals = 0;
    const pending = await this.prisma.referralAttribution.findMany({
      where: { referredSessionId: sessionId, referredCustomerId: null, status: 'PENDING' },
    });
    for (const attribution of pending) {
      const held = await this.prisma.referralAttribution.findUnique({ where: { referredCustomerId: customerId } });
      if (held) {
        await this.prisma.referralAttribution.update({ where: { id: attribution.id }, data: { status: 'REJECTED', reason: 'DUPLICATE_CUSTOMER' } });
        continue;
      }
      if (attribution.referrerCustomerId === customerId) {
        await this.prisma.referralAttribution.update({ where: { id: attribution.id }, data: { status: 'REJECTED', reason: 'SELF_REFERRAL' } });
        continue;
      }
      await this.prisma.referralAttribution.update({ where: { id: attribution.id }, data: { referredCustomerId: customerId } });
      referrals += 1;
    }

    return { rewards: rewards.count, drops: drops.count, referrals };
  }
}
