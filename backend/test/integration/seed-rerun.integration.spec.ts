import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';

/**
 * The seed runs on every API build. It must be a refresh, never a switch.
 *
 * This exists because of a real defect: the seed upserted the FC26 product,
 * variants and offers with `active: true`, so the first deploy after the
 * owner activated the FC27 ladder (which retires the FC26 offers) would have
 * put FC26 back on sale beside it. Nothing here ran the seed twice.
 *
 * The seed is a script with `main()` at module level, so it is run the way
 * the build runs it, as a child process against the same database.
 */
const prisma = new PrismaClient();
const BACKEND_ROOT = join(__dirname, '..', '..');

const OFFER_ID = 'offer__prod-fc-coins__100k__plat-ps5__reg-global';
const VARIANT_ID = 'prod-fc-coins__100k';
const PRODUCT_ID = 'prod-fc-coins';
const SETTING_KEY = 'pricing.ladder';

function runSeed(): void {
  const result = spawnSync('npm', ['run', 'seed'], {
    cwd: BACKEND_ROOT,
    env: process.env,
    shell: true,
    encoding: 'utf8',
    timeout: 180_000,
  });
  if (result.status !== 0) {
    throw new Error(`seed exited with ${result.status}: ${result.stderr.slice(-800)}`);
  }
}

describe('seed rerun (what a redeploy does)', () => {
  let priorSetting: { key: string; value: unknown; updatedBy: string | null } | null = null;

  beforeAll(async () => {
    priorSetting = await prisma.growthSetting.findUnique({ where: { key: SETTING_KEY } });
  });

  afterAll(async () => {
    // Put the catalog back the way every other spec expects it.
    await prisma.offer.update({ where: { id: OFFER_ID }, data: { active: true } });
    await prisma.productVariant.update({ where: { id: VARIANT_ID }, data: { active: true } });
    await prisma.product.update({ where: { id: PRODUCT_ID }, data: { active: true } });
    if (priorSetting) {
      await prisma.growthSetting.upsert({
        where: { key: SETTING_KEY },
        create: { key: SETTING_KEY, value: priorSetting.value as object, updatedBy: priorSetting.updatedBy },
        update: { value: priorSetting.value as object, updatedBy: priorSetting.updatedBy },
      });
    } else {
      await prisma.growthSetting.deleteMany({ where: { key: SETTING_KEY } });
    }
    await prisma.$disconnect();
  });

  it('leaves retired rows retired, keeps the owner\'s pricing settings, and adds nothing on a second run', async () => {
    // The owner has activated FC27: the FC26 rows are retired, the ladder
    // override is stored.
    await prisma.offer.update({ where: { id: OFFER_ID }, data: { active: false } });
    await prisma.productVariant.update({ where: { id: VARIANT_ID }, data: { active: false } });
    await prisma.product.update({ where: { id: PRODUCT_ID }, data: { active: false } });
    const marker = { edition: 'fc27', status: 'active', marker: 'seed-rerun-spec' };
    await prisma.growthSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: marker, updatedBy: 'spec' },
      update: { value: marker, updatedBy: 'spec' },
    });

    const before = {
      products: await prisma.product.count(),
      variants: await prisma.productVariant.count(),
      offers: await prisma.offer.count(),
      inventory: await prisma.inventory.count(),
      price: (await prisma.offer.findUniqueOrThrow({ where: { id: OFFER_ID } })).priceAmountMinor,
    };

    // A redeploy.
    runSeed();

    const offer = await prisma.offer.findUniqueOrThrow({ where: { id: OFFER_ID } });
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: VARIANT_ID } });
    const product = await prisma.product.findUniqueOrThrow({ where: { id: PRODUCT_ID } });
    const setting = await prisma.growthSetting.findUniqueOrThrow({ where: { key: SETTING_KEY } });

    expect(offer.active).toBe(false);
    expect(variant.active).toBe(false);
    expect(product.active).toBe(false);
    expect(setting.value).toEqual(marker);
    expect(setting.updatedBy).toBe('spec');

    // Idempotent: the same rows, the same prices, nothing added.
    expect(await prisma.product.count()).toBe(before.products);
    expect(await prisma.productVariant.count()).toBe(before.variants);
    expect(await prisma.offer.count()).toBe(before.offers);
    expect(await prisma.inventory.count()).toBe(before.inventory);
    expect(offer.priceAmountMinor).toBe(before.price);

    // And a second rerun changes nothing either.
    runSeed();
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: OFFER_ID } })).active).toBe(false);
    expect(await prisma.offer.count()).toBe(before.offers);
  }, 400_000);

  it('still creates a missing row as active (a fresh database sells the catalog)', async () => {
    await prisma.inventory.deleteMany({ where: { offerId: OFFER_ID } });
    await prisma.offer.delete({ where: { id: OFFER_ID } });

    runSeed();

    const offer = await prisma.offer.findUniqueOrThrow({ where: { id: OFFER_ID } });
    expect(offer.active).toBe(true);
    expect(await prisma.inventory.count({ where: { offerId: OFFER_ID } })).toBe(1);
  }, 200_000);
});
