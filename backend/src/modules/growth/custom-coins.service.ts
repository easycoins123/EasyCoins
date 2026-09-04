import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { badRequestError, notFoundError, validationError } from '../../common/errors/api-error';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { isCustomVariant } from '../catalog/dto/catalog.mapper';
import { CustomCoinsError, CustomCoinsQuote, LadderRung, quoteByAmount, quoteByBudget } from './custom-coins';
import { GrowthConfigService } from './growth-config.service';
import { COIN_PRODUCT_SLUG } from './growth-shared';

/** A custom offer nobody has used in this long is retired from the catalog. */
const STALE_CUSTOM_OFFER_DAYS = 7;

export interface CustomQuoteRequest {
  readonly mode: 'amount' | 'budget';
  readonly amount?: number;
  readonly budgetMinor?: number;
  readonly platformId: string;
  readonly regionId?: string;
}

export interface CustomQuoteView extends CustomCoinsQuote {
  readonly offerId: string;
  readonly productSlug: string;
  readonly variantId: string;
  readonly platformId: string;
  readonly regionId: string;
  readonly currency: string;
  readonly mode: 'amount' | 'budget';
  readonly rules: { readonly minCoins: number; readonly maxCoins: number; readonly stepCoins: number };
}

export interface CustomRulesView {
  readonly enabled: boolean;
  readonly minCoins: number;
  readonly maxCoins: number;
  readonly stepCoins: number;
  readonly platformIds: readonly string[];
}

/**
 * Custom amounts as real offers.
 *
 * A quote creates (or refreshes) a variant and an offer for that exact
 * amount, priced by the rule in `custom-coins.ts`, so the rest of the shop
 * needs to know nothing about custom coins: the cart prices the offer, the
 * checkout freezes it, the order snapshots it and fulfillment reads the
 * variant's quantity. There is no second path to a price anywhere.
 *
 * The rows are marked `custom` in their metadata and hidden from the catalog
 * listing, and a custom offer nobody used within a week is retired.
 */
@Injectable()
export class CustomCoinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GrowthConfigService,
    private readonly logger: AppLogger,
  ) {}

  async rules(): Promise<CustomRulesView> {
    const growth = await this.config.get();
    const platforms = await this.prisma.offer.findMany({
      where: { product: { slug: COIN_PRODUCT_SLUG }, active: true },
      select: { platformId: true },
      distinct: ['platformId'],
    });
    return {
      enabled: growth.customCoins.enabled,
      minCoins: growth.customCoins.minCoins,
      maxCoins: growth.customCoins.maxCoins,
      stepCoins: growth.customCoins.stepCoins,
      platformIds: platforms.map((row) => row.platformId).sort(),
    };
  }

  /** Prices a request and returns the offer that carries the quote. */
  async quote(request: CustomQuoteRequest): Promise<CustomQuoteView> {
    const growth = await this.config.get();
    if (!growth.customCoins.enabled) {
      throw notFoundError('custom coins are not offered', 'CUSTOM_COINS_DISABLED');
    }

    const ladder = await this.ladderFor(request.platformId, request.regionId);
    if (ladder.rungs.length === 0) {
      throw notFoundError(`no coin offers for platform ${request.platformId}`, 'CUSTOM_COINS_NO_LADDER');
    }

    let quote: CustomCoinsQuote;
    try {
      quote = request.mode === 'budget'
        ? quoteByBudget(ladder.rungs, growth.customCoins, request.budgetMinor ?? 0)
        : quoteByAmount(ladder.rungs, growth.customCoins, request.amount ?? 0);
    } catch (error) {
      if (error instanceof CustomCoinsError) {
        throw validationError(error.message, [{ field: request.mode === 'budget' ? 'budgetMinor' : 'amount', message: messageFor(error, growth.customCoins) }], error.code);
      }
      throw error;
    }

    const offer = await this.ensureOffer(ladder, quote);
    return {
      ...quote,
      offerId: offer.id,
      productSlug: COIN_PRODUCT_SLUG,
      variantId: offer.variantId,
      platformId: ladder.platformId,
      regionId: ladder.regionId,
      currency: ladder.currency,
      mode: request.mode,
      rules: { minCoins: growth.customCoins.minCoins, maxCoins: growth.customCoins.maxCoins, stepCoins: growth.customCoins.stepCoins },
    };
  }

  /**
   * Retires custom offers nobody used. A row still referenced by a checkout
   * or an order is left alone; a new quote for the same amount reactivates
   * the offer at the current price.
   */
  async pruneStale(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_CUSTOM_OFFER_DAYS * 24 * 60 * 60 * 1000);
    const result = await this.prisma.offer.updateMany({
      where: {
        active: true,
        updatedAt: { lt: cutoff },
        variant: { metadata: { path: ['custom'], equals: true } },
        orderItems: { none: {} },
        checkoutItems: { none: {} },
      },
      data: { active: false },
    });
    return result.count;
  }

  private async ladderFor(platformId: string, regionId?: string) {
    const offers = await this.prisma.offer.findMany({
      where: {
        product: { slug: COIN_PRODUCT_SLUG, active: true },
        platformId,
        active: true,
        ...(regionId ? { regionId } : {}),
      },
      include: { variant: true, product: { select: { id: true } } },
      orderBy: [{ regionId: 'asc' }, { priceAmountMinor: 'asc' }],
    });
    const standard = offers.filter((offer) => !isCustomVariant(offer.variant.metadata) && (offer.variant.quantityValue ?? 0) > 0 && offer.variant.active);
    const region = standard[0]?.regionId ?? regionId ?? '';
    const inRegion = standard.filter((offer) => offer.regionId === region);
    const rungs: LadderRung[] = inRegion.map((offer) => ({
      amount: offer.variant.quantityValue ?? 0,
      priceMinor: offer.priceAmountMinor,
      bonus: launchBonusOf(offer.variant.metadata),
    }));
    return {
      platformId,
      regionId: region,
      productId: inRegion[0]?.product.id ?? '',
      currency: inRegion[0]?.priceCurrency ?? 'ILS',
      offers: inRegion,
      rungs,
    };
  }

  /** Writes the variant and offer that carry a quote, or refreshes them. */
  private async ensureOffer(
    ladder: Awaited<ReturnType<CustomCoinsService['ladderFor']>>,
    quote: CustomCoinsQuote,
  ): Promise<{ id: string; variantId: string }> {
    const rungOffer = ladder.offers.find((offer) => offer.variant.quantityValue === quote.rungAmount) ?? ladder.offers[0];
    if (!rungOffer) {
      throw badRequestError('no bundle to derive a custom offer from', 'CUSTOM_COINS_NO_LADDER');
    }
    const variantId = `${ladder.productId}__custom-${quote.amount}`;
    const offerId = `offer__${ladder.productId}__custom-${quote.amount}__${ladder.platformId}__${ladder.regionId}`;
    const label = formatCoins(quote.amount);
    const bonusLabel = quote.bonus > 0 ? formatCoins(quote.bonus) : null;
    const name = {
      he: bonusLabel ? `${label} מטבעות (כמות מותאמת) + ${bonusLabel} בונוס השקה` : `${label} מטבעות (כמות מותאמת)`,
      en: bonusLabel ? `${label} coins (custom amount) + ${bonusLabel} launch bonus` : `${label} coins (custom amount)`,
    };
    const metadata: Prisma.InputJsonValue = quote.bonus > 0 ? { custom: true, launchBonus: quote.bonus } : { custom: true };

    await this.prisma.$transaction(async (tx) => {
      await tx.productVariant.upsert({
        where: { id: variantId },
        create: {
          id: variantId,
          productId: ladder.productId,
          name,
          sku: `${COIN_PRODUCT_SLUG}-custom-${quote.amount}`.toUpperCase(),
          quantityValue: quote.amount,
          quantityUnit: rungOffer.variant.quantityUnit ?? undefined,
          metadata,
          sortOrder: 1_000,
          active: true,
        },
        update: { name, metadata, active: true },
      });
      await tx.offer.upsert({
        where: { id: offerId },
        create: {
          id: offerId,
          productId: ladder.productId,
          variantId,
          platformId: ladder.platformId,
          regionId: ladder.regionId,
          priceAmountMinor: quote.priceMinor,
          priceCurrency: ladder.currency,
          compareAtMinor: null,
          fulfillmentMethod: rungOffer.fulfillmentMethod,
          checkoutRequirements: rungOffer.checkoutRequirements as Prisma.InputJsonValue,
          terms: rungOffer.terms === null ? undefined : (rungOffer.terms as Prisma.InputJsonValue),
          maxPerOrder: 1,
          active: true,
        },
        update: {
          priceAmountMinor: quote.priceMinor,
          fulfillmentMethod: rungOffer.fulfillmentMethod,
          checkoutRequirements: rungOffer.checkoutRequirements as Prisma.InputJsonValue,
          active: true,
        },
      });
      await tx.inventory.upsert({
        where: { offerId },
        create: { offerId, status: 'IN_STOCK', quantityAvailable: null, quantityReserved: 0, quantitySold: 0 },
        update: { status: 'IN_STOCK' },
      });
    });

    this.logger.info('custom coin offer quoted', { offerId, amount: quote.amount, priceMinor: quote.priceMinor });
    return { id: offerId, variantId };
  }
}

function launchBonusOf(metadata: unknown): number {
  const value = typeof metadata === 'object' && metadata !== null ? (metadata as Record<string, unknown>)['launchBonus'] : undefined;
  return typeof value === 'number' && value > 0 ? Math.round(value) : 0;
}

/** 1,370,000 -> "1.37M", 250,000 -> "250K". Mirrors the storefront's formatter. */
export function formatCoins(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(2).replace(/0$/, '')}M`;
  }
  if (value >= 1_000) {
    const thousands = value / 1_000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(2).replace(/0$/, '')}K`;
  }
  return String(value);
}

function messageFor(error: CustomCoinsError, rules: { minCoins: number; maxCoins: number }): { he: string; en: string } {
  switch (error.code) {
    case 'AMOUNT_TOO_SMALL':
      return { he: `הכמות המינימלית היא ${formatCoins(rules.minCoins)} קוינס.`, en: `The minimum is ${formatCoins(rules.minCoins)} coins.` };
    case 'AMOUNT_TOO_LARGE':
      return { he: `הכמות המקסימלית להזמנה אחת היא ${formatCoins(rules.maxCoins)} קוינס.`, en: `The maximum per order is ${formatCoins(rules.maxCoins)} coins.` };
    case 'BUDGET_TOO_SMALL':
      return { he: `התקציב נמוך מהמחיר של ${formatCoins(rules.minCoins)} קוינס.`, en: `That budget is below the price of ${formatCoins(rules.minCoins)} coins.` };
    default:
      return { he: 'לא ניתן לתמחר את הכמות הזו כרגע.', en: 'That amount cannot be priced right now.' };
  }
}
