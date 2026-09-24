import { Inject, Injectable, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';

import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { AppLogger } from '../../common/logging/app-logger.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { CustomCoinsService } from '../growth/custom-coins.service';
import { RewardsService } from '../growth/rewards.service';
import { InventoryService } from '../orders/inventory.service';
import { PaymentStateService } from '../payments/payment-state.service';

/** A payment left untouched for this long is treated as abandoned. */
const PAYMENT_STALE_MINUTES = 30;

export interface SweepResult {
  readonly reservationsReleased: number;
  readonly paymentsExpired: number;
  readonly ordersCancelled: number;
  readonly checkoutsExpired: number;
  readonly idempotencyKeysPruned: number;
  readonly rateLimitBucketsPruned: number;
  readonly rewardsExpired: number;
  readonly rewardsRevoked: number;
  readonly rewardsReleased: number;
  readonly customOffersRetired: number;
}

/**
 * Housekeeping.
 *
 * Everything with a deadline is closed here rather than by a timer in a browser
 * tab. A customer who abandons a checkout closes the laptop; the stock they were
 * holding still has to go back on the shelf, and only the server can do that.
 *
 * Written to be safe when more than one instance runs it. Every step is a
 * conditional UPDATE that claims rows atomically, so two instances sweeping at
 * the same moment divide the work instead of applying it twice, and an instance
 * that dies mid-sweep leaves the rest for the next run. There is no lock to
 * acquire and no leader to elect, which is one less thing to get wrong on
 * Render.
 */
@Injectable()
export class HousekeepingService implements OnModuleInit, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentStateService,
    private readonly idempotency: IdempotencyService,
    private readonly rateLimit: RateLimitService,
    private readonly rewards: RewardsService,
    private readonly customCoins: CustomCoinsService,
    private readonly logger: AppLogger,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    const seconds = this.config.housekeepingIntervalSeconds;

    if (seconds <= 0) {
      this.logger.info('housekeeping is disabled by configuration');
      return;
    }

    this.timer = setInterval(() => {
      void this.runSafely();
    }, seconds * 1000);

    // Never hold the process open on this alone; a shutting-down instance should
    // exit rather than wait for the next tick.
    this.timer.unref?.();

    this.logger.info('housekeeping scheduled', { intervalSeconds: seconds });
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Runs a sweep, swallowing failures.
   *
   * A background job that throws must not take the process down with it. The
   * next tick tries again, and every step is safe to repeat.
   */
  private async runSafely(): Promise<void> {
    if (this.running) {
      // The previous sweep is still going. Overlapping runs are safe but
      // pointless, and skipping keeps a slow database from queueing work.
      return;
    }

    this.running = true;
    try {
      await this.sweep();
    } catch (error) {
      this.logger.error('housekeeping sweep failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
    } finally {
      this.running = false;
    }
  }

  /** One pass. Exposed so tests can run it directly rather than waiting. */
  async sweep(now = new Date()): Promise<SweepResult> {
    // Payments first: expiring one may cancel an order, which releases its
    // stock through the state machine and keeps that transition in one place.
    const expiry = await this.payments.expireStalePayments(
      new Date(now.getTime() - PAYMENT_STALE_MINUTES * 60 * 1000),
    );

    // Then any hold whose own deadline passed, including those belonging to
    // checkouts that never became an order at all.
    const reservationsReleased = await this.prisma.runInTransaction((tx) =>
      this.inventory.releaseExpired(tx, now),
    );

    const checkouts = await this.prisma.checkoutSession.updateMany({
      where: {
        status: { in: ['OPEN', 'READY_FOR_PAYMENT'] },
        expiresAt: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });

    const idempotencyKeysPruned = await this.idempotency.prune();
    const rateLimitBucketsPruned = await this.rateLimit.prune();

    // The reward ledger against the orders behind it: expiries, rewards from
    // orders that were refunded, holds on orders that never got paid. Then the
    // custom coin offers nobody used.
    const ledger = await this.rewards.reconcile(now);
    const customOffersRetired = await this.customCoins.pruneStale(now);

    const result: SweepResult = {
      reservationsReleased,
      paymentsExpired: expiry.intents,
      ordersCancelled: expiry.ordersCancelled,
      checkoutsExpired: checkouts.count,
      idempotencyKeysPruned,
      rateLimitBucketsPruned,
      rewardsExpired: ledger.expired,
      rewardsRevoked: ledger.revoked,
      rewardsReleased: ledger.released,
      customOffersRetired,
    };

    const touched =
      reservationsReleased + expiry.intents + checkouts.count + idempotencyKeysPruned
      + ledger.expired + ledger.revoked + ledger.released + customOffersRetired;
    if (touched > 0) {
      this.logger.info('housekeeping sweep', { ...result });
    }

    return result;
  }
}
