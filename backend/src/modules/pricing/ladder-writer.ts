import type { Prisma, PrismaClient } from '@prisma/client';

import { adjustedPrice } from './ladder-economics';
import { FC26_PRODUCT_ID, LadderPackage, PricingConfig } from './pricing-config';

/**
 * The FC27 ladder as catalog rows, and the switch between editions.
 *
 * Two callers: the admin's `LadderService` (activate, republish, deactivate)
 * and the seed, which runs on every API build. Both apply the same
 * configuration through the same functions, so what the owner decided in
 * the config (`ladder.status`) is what the database ends up selling, and a
 * redeploy can only ever confirm the current decision, never reverse it.
 *
 * Prices live in `offers.price_amount_minor` and nowhere else at runtime.
 */
type Db = Prisma.TransactionClient | PrismaClient;

/** The platforms a coin package is sold for, in catalog order. */
export const COIN_PLATFORMS = ['plat-ps5', 'plat-ps4', 'plat-xbox', 'plat-pc'] as const;
export const COIN_REGION = 'reg-global';
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

/** Upserts the FC27 product, one variant per package and one offer per package and platform. Returns the offers written. */
export async function writeLadder(tx: Db, config: PricingConfig): Promise<number> {
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

/** Takes the FC26 offers off sale and marks the product as the previous edition. Returns the offers retired. */
export async function retireFc26(tx: Db): Promise<number> {
  const retired = await tx.offer.updateMany({ where: { productId: FC26_PRODUCT_ID, active: true }, data: { active: false } });
  await tx.product.update({
    where: { id: FC26_PRODUCT_ID },
    data: { metadata: { edition: 'fc26', retiredAt: new Date().toISOString() } as Prisma.InputJsonValue, featured: false },
  }).catch(() => undefined);
  return retired.count;
}

/** Puts the FC26 offers back on sale. Returns the offers restored. */
export async function restoreFc26(tx: Db): Promise<number> {
  const restored = await tx.offer.updateMany({ where: { productId: FC26_PRODUCT_ID, active: false, variant: { active: true } }, data: { active: true } });
  await tx.product.update({ where: { id: FC26_PRODUCT_ID }, data: { metadata: { edition: 'fc26' } as Prisma.InputJsonValue, featured: true } }).catch(() => undefined);
  return restored.count;
}

/** Takes the FC27 offers off sale without deleting anything. Returns the offers retired. */
export async function retireFc27(tx: Db, config: PricingConfig): Promise<number> {
  const retired = await tx.offer.updateMany({ where: { productId: config.ladder.productId, active: true }, data: { active: false } });
  return retired.count;
}

export interface ReconcileResult {
  readonly status: PricingConfig['ladder']['status'];
  /** True when the rows changed edition, not merely got refreshed. */
  readonly switched: boolean;
  readonly offersWritten: number;
  readonly offersRetired: number;
  readonly offersRestored: number;
}

/**
 * Makes the catalog sell what the configuration says.
 *
 * `active`: the FC27 rows are (re)written at the configured prices and the
 * FC26 offers are retired. `draft`: the FC27 offers are off and FC26 is on
 * sale. Idempotent: a second run changes nothing. Run by the seed on every
 * build, so a deployment applies the owner's current decision and cannot
 * drift back to a previous edition. A switch, as opposed to a refresh, is
 * written to the audit log as a system action.
 */
export async function reconcileLadder(prisma: PrismaClient, config: PricingConfig, actor = 'seed'): Promise<ReconcileResult> {
  const { ladder } = config;
  const fc27LiveBefore = await prisma.offer.count({ where: { productId: ladder.productId, active: true } });
  const fc26LiveBefore = await prisma.offer.count({ where: { productId: FC26_PRODUCT_ID, active: true } });

  const result = await prisma.$transaction(async (tx) => {
    if (ladder.status === 'active') {
      const offersWritten = await writeLadder(tx, config);
      const offersRetired = await retireFc26(tx);
      return { status: ladder.status, switched: fc27LiveBefore === 0 || fc26LiveBefore > 0, offersWritten, offersRetired, offersRestored: 0 };
    }
    const offersRetired = await retireFc27(tx, config);
    const offersRestored = await restoreFc26(tx);
    return { status: ladder.status, switched: offersRetired > 0 || offersRestored > 0, offersWritten: 0, offersRetired, offersRestored };
  });

  if (result.switched) {
    await prisma.auditLog.create({
      data: {
        eventType: result.status === 'active' ? 'pricing.ladder.activated' : 'pricing.ladder.deactivated',
        entityType: 'ladder',
        entityId: ladder.edition,
        actorType: 'SYSTEM',
        actorId: actor,
        afterState: { source: 'reconcile', status: result.status, packages: ladder.packages } as unknown as Prisma.InputJsonValue,
      },
    });
  }
  return result;
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
