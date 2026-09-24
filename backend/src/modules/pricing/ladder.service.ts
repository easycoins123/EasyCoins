import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { badRequestError, conflictError } from '../../common/errors/api-error';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { ActivationCheck, adjustedPrice, checkActivation, evaluateLadder, LadderEvaluation } from './ladder-economics';
import { FC26_PRODUCT_ID, LadderConfig, LadderPackage, PricingConfig } from './pricing-config';
import { PricingConfigService } from './pricing-config.service';

/** The platforms a coin package is sold for, in catalog order. */
const COIN_PLATFORMS = ['plat-ps5', 'plat-ps4', 'plat-xbox', 'plat-pc'] as const;
const COIN_REGION = 'reg-global';
const GAME_ID = 'game-ea-fc';

/** Every checkout field a coin order needs. Mirrors the FC26 seed. */
const COIN_REQUIREMENTS = [
  {
    key: 'PLATFORM_ACCOUNT_HANDLE',
    control: 'text',
    label: { he: 'שם המשתמש שלכם בפלטפורמה', en: 'Your platform username' },
    hint: { he: 'שם המשתמש הפומבי בלבד. לעולם לא נבקש סיסמה.', en: 'Public username only. We will never ask for a password.' },
    placeholder: { he: 'לדוגמה: TopGamer_IL', en: 'e.g. TopGamer_IL' },
    required: true,
    maxLength: 64,
  },
  {
    key: 'SERVICE_NOTE',
    control: 'textarea',
    label: { he: 'הערות לשירות (אופציונלי)', en: 'Service notes (optional)' },
    placeholder: { he: 'חלון זמן מועדף, העדפות נוספות...', en: 'Preferred time window, other preferences...' },
    required: false,
    maxLength: 500,
  },
];

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
 * Prices live in `offers.price_amount_minor` and nowhere else at runtime;
 * this service is the only writer besides the seed. Activation upserts the
 * FC27 product, one variant per package and one offer per package and
 * platform, retires the FC26 offers, and marks the ladder active, all in one
 * transaction, so the storefront never sees half a ladder. A later edit to an
 * active ladder rewrites the same rows.
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
      const offersWritten = await this.writeLadder(tx, config);
      const retired = await tx.offer.updateMany({ where: { productId: FC26_PRODUCT_ID, active: true }, data: { active: false } });
      await tx.product.update({
        where: { id: FC26_PRODUCT_ID },
        data: { metadata: { edition: 'fc26', retiredAt: new Date().toISOString() } as Prisma.InputJsonValue, featured: false },
      }).catch(() => undefined);
      return { offersWritten, offersRetired: retired.count };
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
      const retired = await tx.offer.updateMany({ where: { productId: config.ladder.productId, active: true }, data: { active: false } });
      const restored = await tx.offer.updateMany({ where: { productId: FC26_PRODUCT_ID, active: false, variant: { active: true } }, data: { active: true } });
      await tx.product.update({ where: { id: FC26_PRODUCT_ID }, data: { metadata: { edition: 'fc26' } as Prisma.InputJsonValue, featured: true } }).catch(() => undefined);
      return { offersRetired: retired.count, offersRestored: restored.count };
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
    const offersWritten = await this.prisma.$transaction((tx) => this.writeLadder(tx, config));
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

  private async writeLadder(tx: Prisma.TransactionClient, config: PricingConfig): Promise<number> {
    const { ladder } = config;
    const productRow = {
      id: ladder.productId,
      gameId: GAME_ID,
      slug: ladder.productSlug,
      type: 'GAME_CURRENCY' as const,
      name: { he: 'קוינס FC 27 · Ultimate Team', en: 'FC 27 Ultimate Team Coins' },
      shortDescription: { he: 'קוינס ל-EA SPORTS FC 27 Ultimate Team', en: 'Coins for EA SPORTS FC 27 Ultimate Team' },
      description: {
        he: 'חבילות קוינס ל-FC 27 Ultimate Team. האספקה מתבצעת ידנית על ידי נציג, בתיאום איתכם, ללא צורך בפרטי התחברות כלשהם.',
        en: 'Coin bundles for FC 27 Ultimate Team. Delivery is performed manually by a team member in coordination with you, and never requires any login details.',
      },
      images: [{ url: 'assets/products/coins.svg', alt: 'קוינס FC 27', role: 'card' }],
      metadata: { edition: 'fc27' },
      tags: ['coins', 'ultimate-team', 'fc27'] as string[],
      active: true,
      featured: true,
    };
    await tx.product.upsert({ where: { id: ladder.productId }, create: productRow, update: productRow });

    let offers = 0;
    const sorted = [...ladder.packages].sort((a, b) => a.coins - b.coins);
    for (const [index, pack] of sorted.entries()) {
      const variantId = `${ladder.productId}__${pack.key}`;
      const variantRow = {
        id: variantId,
        productId: ladder.productId,
        name: variantName(pack),
        sku: `${ladder.productSlug}-${pack.key}`.toUpperCase(),
        quantityValue: pack.coins,
        quantityUnit: { he: 'קוינס', en: 'coins' },
        metadata: {
          edition: 'fc27',
          tier: pack.tier,
          ...(pack.recommended ? { recommended: true } : {}),
          ...(pack.bonusCoins > 0 ? { launchBonus: pack.bonusCoins } : {}),
        },
        sortOrder: index,
        active: pack.active,
      };
      await tx.productVariant.upsert({ where: { id: variantId }, create: variantRow, update: variantRow });

      for (const platformId of COIN_PLATFORMS) {
        const offerId = `offer__${ladder.productId}__${pack.key}__${platformId}__${COIN_REGION}`;
        const priceMinor = adjustedPrice(pack.priceMinor, ladder.platformAdjustmentBps[platformId] ?? 0);
        const offerRow = {
          id: offerId,
          productId: ladder.productId,
          variantId,
          platformId,
          regionId: COIN_REGION,
          priceAmountMinor: priceMinor,
          priceCurrency: 'ILS',
          compareAtMinor: null,
          fulfillmentMethod: 'MANUAL_DELIVERY' as const,
          checkoutRequirements: COIN_REQUIREMENTS as unknown as Prisma.InputJsonValue,
          terms: { he: 'האספקה מתבצעת בתיאום מולכם. לעולם לא נבקש סיסמה, קוד אימות או קודי גיבוי.', en: 'Delivery is coordinated with you. We will never ask for a password, a verification code or backup codes.' },
          maxPerOrder: ladder.maxPerOrder,
          active: pack.active,
        };
        await tx.offer.upsert({ where: { id: offerId }, create: offerRow, update: offerRow });
        await tx.inventory.upsert({
          where: { offerId },
          create: { offerId, status: 'IN_STOCK', quantityAvailable: null, quantityReserved: 0, quantitySold: 0 },
          update: { status: 'IN_STOCK' },
        });
        offers += 1;
      }
    }
    return offers;
  }
}

/** "1M קוינס" or "500K קוינס + 50K בונוס", in both locales. */
export function variantName(pack: LadderPackage): { he: string; en: string } {
  const amount = compact(pack.coins);
  if (pack.bonusCoins > 0) {
    return { he: `${amount} קוינס + ${compact(pack.bonusCoins)} בונוס`, en: `${amount} coins + ${compact(pack.bonusCoins)} bonus` };
  }
  return { he: `${amount} קוינס`, en: `${amount} coins` };
}

export function compact(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}K`;
  }
  return String(value);
}
