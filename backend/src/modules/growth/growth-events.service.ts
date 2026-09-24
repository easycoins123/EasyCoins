import { Injectable } from '@nestjs/common';
import type { Order, Prisma } from '@prisma/client';

import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { CampaignsService } from './campaigns.service';
import { EasyClubService } from './easyclub.service';
import { EasyDropService } from './easydrop.service';
import { GrowthConfigService } from './growth-config.service';
import { isQualifying, ownerOf } from './growth-shared';
import { ReferralService } from './referral.service';
import { RewardsService } from './rewards.service';

/**
 * What a paid order sets in motion.
 *
 * Called by the payment state machine after its transaction has committed,
 * never inside it: a reward programme must not be able to roll back a
 * payment. Every step is idempotent (unique constraints and conditional
 * updates underneath), so a replayed event, a retried webhook or a second
 * call from the success page changes nothing the first call did not.
 *
 * Each step is isolated. A failure in one is logged and the next runs; the
 * customer is never denied their EasyDrop because the referral check threw.
 */
@Injectable()
export class GrowthEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GrowthConfigService,
    private readonly rewards: RewardsService,
    private readonly easyDrop: EasyDropService,
    private readonly club: EasyClubService,
    private readonly referral: ReferralService,
    private readonly campaigns: CampaignsService,
    private readonly logger: AppLogger,
  ) {}

  async onOrderPaid(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order || !isQualifying(order.status)) {
      return;
    }
    const owner = ownerOf(order);

    await this.step('multiplier', orderId, () => this.rewards.applyMultiplier(this.prisma, owner, orderId));
    await this.step('easydrop', orderId, () => this.easyDrop.ensureForOrder(this.prisma, order));
    if (order.customerId) {
      const customerId = order.customerId;
      await this.step('founders', orderId, () => this.club.assignFounderSeat(this.prisma, customerId, orderId));
      await this.step('streak', orderId, () => this.club.rewardStreak(this.prisma, order));
    }
    await this.step('referral', orderId, () => this.referral.qualifyOnPaid(this.prisma, order));
    await this.step('campaign', orderId, () => this.campaigns.applyOnPaid(this.prisma, order));
    await this.step('easyback', orderId, () => this.issueEasyBack(order));
  }

  /** Inside the transaction that closes an order unpaid: give back what it held. */
  async onOrderClosed(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    await this.rewards.releaseForOrder(tx, orderId);
  }

  /** The configurable comeback reward. Off by default; see growth-config. */
  private async issueEasyBack(order: Order): Promise<void> {
    const growth = await this.config.get();
    const { easyback } = growth;
    if (!easyback.enabled || order.totalMinor < easyback.minOrderMinor) {
      return;
    }
    if (easyback.eligibility === 'first-order') {
      const prior = await this.club.priorPaidOrderCount(ownerOf(order), order.id);
      if (prior > 0) {
        return;
      }
    }
    await this.rewards.issue(this.prisma, {
      owner: ownerOf(order),
      source: 'EASYBACK',
      sourceOrderId: order.id,
      template: easyback.reward,
      defaultExpiresInDays: easyback.reward.expiresInDays ?? 30,
    });
  }

  private async step(name: string, orderId: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.logger.error(`growth step failed: ${name}`, {
        orderId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}
