import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { badRequestError, conflictError } from '../../common/errors/api-error';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { ActivationCheck, checkActivation, evaluateLadder, LadderEvaluation } from './ladder-economics';
import { COIN_PLATFORMS, compact, restoreFc26, retireFc26, retireFc27, variantName, writeLadder } from './ladder-writer';
import { FC26_PRODUCT_ID, LadderConfig } from './pricing-config';
import { PricingConfigService } from './pricing-config.service';

export { compact, variantName };

export type Edition = 'fc26' | 'fc27';

export interface StorefrontState {
  readonly activeEdition: Edition;
  readonly editions: readonly {
    readonly id: Edition;
    readonly label: string;
    readonly productSlug: string;
    readonly productId: string;
    readonly status: 'active' | 'retired' | 'draft';
  }[];
  readonly ladderStatus: LadderConfig['status'];
}

export interface ActivationResult {
  readonly check: ActivationCheck;
  readonly offersWritten: number;
  readonly offersRetired: number;
}

/**
 * The FC27 ladder's path from a draft in configuration to real offer rows.
 *
 * The rows are written by `ladder-writer.ts`, which the seed shares, so a
 * deployment applies the same decision this service records. Activation
 * upserts the FC27 product, one variant per package and one offer per
 * package and platform, retires the FC26 offers, and marks the ladder
 * active, all in one transaction, so the storefront never sees half a
 * ladder. A later edit to an active ladder rewrites the same rows.
 */
@Injectable()
export class LadderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PricingConfigService,
    private readonly logger: AppLogger,
  ) {}

  async evaluation(platformId?: string): Promise<LadderEvaluation & { check: ActivationCheck; checkAcknowledged: ActivationCheck }> {
    const { ladder, economics } = await this.config.get();
    return {
      ...evaluateLadder(ladder, economics, platformId),
      check: checkActivation(ladder, economics, false),
      checkAcknowledged: checkActivation(ladder, economics, true),
    };
  }

  /** Which edition the storefront sells right now, read from the offers. */
  async storefront(): Promise<StorefrontState> {
    const { ladder } = await this.config.get();
    const [fc27Live, fc26Live, fc27Exists] = await Promise.all([
      this.prisma.offer.count({ where: { productId: ladder.productId, active: true, product: { active: true } } }),
      this.prisma.offer.count({ where: { productId: FC26_PRODUCT_ID, active: true, product: { active: true } } }),
      this.prisma.product.count({ where: { id: ladder.productId } }),
    ]);
    const activeEdition: Edition = fc27Live > 0 ? 'fc27' : 'fc26';
    return {
      activeEdition,
      editions: [
        {
          id: 'fc26',
          label: 'FC 26',
          productSlug: 'ea-fc-ultimate-team-coins',
          productId: FC26_PRODUCT_ID,
          status: fc26Live > 0 ? 'active' : 'retired',
        },
        {
          id: 'fc27',
          label: 'FC 27',
          productSlug: ladder.productSlug,
          productId: ladder.productId,
          status: fc27Live > 0 ? 'active' : fc27Exists ? 'retired' : 'draft',
        },
      ],
      ladderStatus: ladder.status,
    };
  }

  /** What activation would write, without writing it. */
  async preview(): Promise<{ product: string; variants: number; offers: number; retire: number; check: ActivationCheck }> {
    const { ladder, economics } = await this.config.get();
    const active = ladder.packages.filter((pack) => pack.active);
    const retire = await this.prisma.offer.count({ where: { productId: FC26_PRODUCT_ID, active: true } });
    return {
      product: ladder.productSlug,
      variants: ladder.packages.length,
      offers: active.length * COIN_PLATFORMS.length,
      retire,
      check: checkActivation(ladder, economics, false),
    };
  }

  /**
   * Activates the ladder. Refused unless the economics gate allows it; the
   * acknowledgement, when it was needed, is written to the audit log with the
   * operator's name.
   */
  async activate(operator: string, acknowledgeUnknownCost: boolean): Promise<ActivationResult> {
    const config = await this.config.get();
    const check = checkActivation(config.ladder, config.economics, acknowledgeUnknownCost);
    if (!check.allowed) {
      throw conflictError(`the ladder cannot be activated: ${check.blockers.join('; ')}`, 'LADDER_ACTIVATION_BLOCKED');
    }
    const written = await this.prisma.$transaction(async (tx) => {
      const offersWritten = await writeLadder(tx, config);
      const offersRetired = await retireFc26(tx);
      return { offersWritten, offersRetired };
    });
    await this.config.set('ladder', { ...config.ladder, status: 'active' }, operator);
    await this.prisma.auditLog.create({
      data: {
        eventType: 'pricing.ladder.activated',
        entityType: 'ladder',
        entityId: config.ladder.edition,
        actorType: 'OPERATOR',
        actorId: operator,
        afterState: { acknowledgeUnknownCost, warnings: check.warnings, packages: config.ladder.packages } as unknown as Prisma.InputJsonValue,
      },
    });
    this.logger.info('FC27 ladder activated', { operator, ...written, warnings: check.warnings.join('; ') });
    return { check, ...written };
  }

  /** Puts FC26 back on sale and takes the FC27 offers off. A rollback, not a delete. */
  async deactivate(operator: string): Promise<{ offersRetired: number; offersRestored: number }> {
    const config = await this.config.get();
    const result = await this.prisma.$transaction(async (tx) => {
      const offersRetired = await retireFc27(tx, config);
      const offersRestored = await restoreFc26(tx);
      return { offersRetired, offersRestored };
    });
    await this.config.set('ladder', { ...config.ladder, status: 'draft' }, operator);
    await this.prisma.auditLog.create({
      data: {
        eventType: 'pricing.ladder.deactivated',
        entityType: 'ladder',
        entityId: config.ladder.edition,
        actorType: 'OPERATOR',
        actorId: operator,
        afterState: result as unknown as Prisma.InputJsonValue,
      },
    });
    return result;
  }

  /** Re-writes the rows of an already active ladder after an edit. */
  async republish(operator: string): Promise<ActivationResult> {
    const config = await this.config.get();
    if (config.ladder.status !== 'active') {
      throw badRequestError('the ladder is not active; activate it instead', 'LADDER_NOT_ACTIVE');
    }
    const check = checkActivation(config.ladder, config.economics, true);
    if (!check.allowed) {
      throw conflictError(`the ladder cannot be republished: ${check.blockers.join('; ')}`, 'LADDER_ACTIVATION_BLOCKED');
    }
    const offersWritten = await this.prisma.$transaction((tx) => writeLadder(tx, config));
    await this.prisma.auditLog.create({
      data: {
        eventType: 'pricing.ladder.republished',
        entityType: 'ladder',
        entityId: config.ladder.edition,
        actorType: 'OPERATOR',
        actorId: operator,
        afterState: { packages: config.ladder.packages } as unknown as Prisma.InputJsonValue,
      },
    });
    return { check, offersWritten, offersRetired: 0 };
  }
}
