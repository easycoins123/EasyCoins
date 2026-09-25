import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { Prisma, PrismaClient } from '@prisma/client';

import { PRICING_DEFAULTS, PRICING_SETTING_PREFIX } from '../../src/modules/pricing/pricing-config';

/**
 * The seed runs on every API build. It applies the owner's decision, never
 * a previous one.
 *
 * This exists because of a real defect: the seed upserted the FC26 product,
 * variants and offers with `active: true`, so the first deploy after the
 * FC27 ladder went live would have put FC26 back on sale beside it. The seed
 * now reconciles the catalog with the pricing configuration (code defaults
 * under admin overrides), so a deploy confirms the edition on sale and
 * cannot revert it. These run the seed the way the build does, as a child
 * process against the same database.
 */
const prisma = new PrismaClient();
const BACKEND_ROOT = join(__dirname, '..', '..');

const FC27_PRODUCT_ID = PRICING_DEFAULTS.ladder.productId;
const FC27_1M_PS5 = `offer__${FC27_PRODUCT_ID}__1m__plat-ps5__reg-global`;
const FC26_PRODUCT_ID = 'prod-fc-coins';
const LADDER_KEY = `${PRICING_SETTING_PREFIX}ladder`;
const ONE_MILLION_MINOR = PRICING_DEFAULTS.ladder.packages.find((pack) => pack.key === '1m')!.priceMinor;

function runSeed(): string {
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
  return result.stdout;
}

async function live(productId: string): Promise<number> {
  return prisma.offer.count({ where: { productId, active: true, product: { active: true } } });
}

describe('seed rerun (what a redeploy does)', () => {
  beforeAll(async () => {
    // Whatever an earlier spec left behind, a deploy starts from the seed.
    await prisma.growthSetting.deleteMany({ where: { key: { startsWith: PRICING_SETTING_PREFIX } } });
    runSeed();
  });

  afterAll(async () => {
    await prisma.growthSetting.deleteMany({ where: { key: { startsWith: PRICING_SETTING_PREFIX } } });
    runSeed();
    await prisma.$disconnect();
  });

  it('sells FC27 at the configured prices after a deploy, with FC26 retired', async () => {
    expect(await live(FC27_PRODUCT_ID)).toBe(PRICING_DEFAULTS.ladder.packages.filter((pack) => pack.active).length * 4);
    expect(await live(FC26_PRODUCT_ID)).toBe(0);
    const million = await prisma.offer.findUniqueOrThrow({ where: { id: FC27_1M_PS5 } });
    expect(million.priceAmountMinor).toBe(ONE_MILLION_MINOR);
    expect(million.active).toBe(true);
    const fc26 = await prisma.product.findUniqueOrThrow({ where: { id: FC26_PRODUCT_ID } });
    expect(fc26.featured).toBe(false);
    expect((fc26.metadata as { edition?: string }).edition).toBe('fc26');
  }, 200_000);

  it('is idempotent: a second run adds nothing and moves nothing', async () => {
    const before = {
      products: await prisma.product.count(),
      variants: await prisma.productVariant.count(),
      offers: await prisma.offer.count(),
      inventory: await prisma.inventory.count(),
      fc27: await live(FC27_PRODUCT_ID),
      fc26: await live(FC26_PRODUCT_ID),
    };
    const output = runSeed();
    expect(output).toContain('Ladder active');
    expect(output).not.toContain('edition switched');
    expect(await prisma.product.count()).toBe(before.products);
    expect(await prisma.productVariant.count()).toBe(before.variants);
    expect(await prisma.offer.count()).toBe(before.offers);
    expect(await prisma.inventory.count()).toBe(before.inventory);
    expect(await live(FC27_PRODUCT_ID)).toBe(before.fc27);
    expect(await live(FC26_PRODUCT_ID)).toBe(before.fc26);
  }, 200_000);

  it('restores a tampered or missing FC27 price on the next deploy', async () => {
    await prisma.offer.update({ where: { id: FC27_1M_PS5 }, data: { priceAmountMinor: 100, active: false } });
    runSeed();
    const million = await prisma.offer.findUniqueOrThrow({ where: { id: FC27_1M_PS5 } });
    expect(million.priceAmountMinor).toBe(ONE_MILLION_MINOR);
    expect(million.active).toBe(true);

    // A row that nothing references yet (no order, no hold), so it can go.
    const TEN_MILLION_PC = `offer__${FC27_PRODUCT_ID}__10m__plat-pc__reg-global`;
    const tenMillionMinor = PRICING_DEFAULTS.ladder.packages.find((pack) => pack.key === '10m')!.priceMinor;
    await prisma.inventoryReservation.deleteMany({ where: { offerId: TEN_MILLION_PC } });
    await prisma.inventory.deleteMany({ where: { offerId: TEN_MILLION_PC } });
    await prisma.offer.delete({ where: { id: TEN_MILLION_PC } });
    runSeed();
    const recreated = await prisma.offer.findUniqueOrThrow({ where: { id: TEN_MILLION_PC } });
    expect(recreated.priceAmountMinor).toBe(tenMillionMinor);
    expect(recreated.active).toBe(true);
    expect(await prisma.inventory.count({ where: { offerId: TEN_MILLION_PC } })).toBe(1);
  }, 400_000);

  it('respects the owner\'s deactivation: with a draft override a deploy keeps FC26 on sale, and removing it brings FC27 back', async () => {
    const draft = JSON.parse(JSON.stringify({ ...PRICING_DEFAULTS.ladder, status: 'draft' })) as Prisma.InputJsonObject;
    await prisma.growthSetting.upsert({
      where: { key: LADDER_KEY },
      create: { key: LADDER_KEY, value: draft, updatedBy: 'spec' },
      update: { value: draft, updatedBy: 'spec' },
    });

    const first = runSeed();
    expect(first).toContain('Ladder draft');
    expect(first).toContain('edition switched');
    expect(await live(FC27_PRODUCT_ID)).toBe(0);
    expect(await live(FC26_PRODUCT_ID)).toBeGreaterThan(0);
    // The owner's override survives the deploy untouched.
    const stored = await prisma.growthSetting.findUniqueOrThrow({ where: { key: LADDER_KEY } });
    expect((stored.value as { status: string }).status).toBe('draft');
    expect(stored.updatedBy).toBe('spec');

    const again = runSeed();
    expect(again).not.toContain('edition switched');
    expect(await live(FC27_PRODUCT_ID)).toBe(0);

    await prisma.growthSetting.delete({ where: { key: LADDER_KEY } });
    const back = runSeed();
    expect(back).toContain('Ladder active');
    expect(back).toContain('edition switched');
    expect(await live(FC27_PRODUCT_ID)).toBeGreaterThan(0);
    expect(await live(FC26_PRODUCT_ID)).toBe(0);

    const audits = await prisma.auditLog.findMany({ where: { entityType: 'ladder', actorType: 'SYSTEM' }, orderBy: { createdAt: 'desc' }, take: 2 });
    expect(audits.map((row) => row.eventType).sort()).toEqual(['pricing.ladder.activated', 'pricing.ladder.deactivated']);
  }, 600_000);
});
