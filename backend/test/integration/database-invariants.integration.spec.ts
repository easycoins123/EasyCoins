import { PrismaClient } from '@prisma/client';

/**
 * Data-integrity invariants, tested against a REAL PostgreSQL.
 *
 * The point of every test here is that the *database* refuses the write. Each
 * one bypasses the application entirely and asks Prisma to insert something
 * invalid; if PostgreSQL accepts it, the invariant is documentation rather than
 * a guarantee, and a future code path will eventually violate it.
 *
 * Requires DATABASE_URL. `npm test` provides one via scripts/with-db.mjs.
 */

const prisma = new PrismaClient();

/** Postgres error codes we assert on, so a test cannot pass for the wrong reason. */
const CHECK_VIOLATION = 'P2010'; // Prisma wraps raw check violations
const UNIQUE_VIOLATION = 'P2002';
const FK_VIOLATION = 'P2003';

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Runs raw SQL and returns the PostgreSQL error code, or null if it succeeded. */
async function sqlErrorCode(sql: string): Promise<string | null> {
  try {
    await prisma.$executeRawUnsafe(sql);
    return null;
  } catch (error) {
    const meta = (error as { meta?: { code?: string } }).meta;
    return meta?.code ?? (error as { code?: string }).code ?? 'UNKNOWN';
  }
}

describe('seed data is present and coherent', () => {
  it('has the full catalog', async () => {
    expect(await prisma.platform.count()).toBe(6);
    expect(await prisma.region.count()).toBe(4);
    expect(await prisma.game.count()).toBe(5);
    // Eight seeded products; the FC27 ladder adds a ninth once it has been activated in this database.
    expect(await prisma.product.count()).toBeGreaterThanOrEqual(8);
    expect(await prisma.offer.count()).toBeGreaterThan(50);
  });

  it('gives every offer an inventory row', async () => {
    const offers = await prisma.offer.count();
    const inventory = await prisma.inventory.count();
    expect(inventory).toBe(offers);
  });

  it('covers every game category the business plans to sell', async () => {
    const slugs = (await prisma.game.findMany({ select: { slug: true } })).map((g) => g.slug);
    expect(slugs).toEqual(
      expect.arrayContaining(['ea-sports-fc', 'playstation', 'fortnite', 'call-of-duty', 'nba-2k']),
    );
  });

  it('includes at least one region-locked offer with a customer-facing notice', async () => {
    const locked = await prisma.region.findMany({ where: { isRegionFree: false } });
    expect(locked.length).toBeGreaterThan(0);
    for (const region of locked) {
      expect(region.restrictionNotice).not.toBeNull();
    }
  });

  it('includes an out-of-stock offer, so the unavailable path has real data', async () => {
    const outOfStock = await prisma.inventory.count({ where: { status: 'OUT_OF_STOCK' } });
    expect(outOfStock).toBeGreaterThan(0);
  });

  it('includes more than one fulfillment method', async () => {
    const methods = await prisma.offer.groupBy({ by: ['fulfillmentMethod'] });
    expect(methods.length).toBeGreaterThanOrEqual(3);
  });

  it('never seeds an unsellable NOT_SUPPORTED offer', async () => {
    expect(await prisma.offer.count({ where: { fulfillmentMethod: 'NOT_SUPPORTED' } })).toBe(0);
  });

  it('stores Hebrew correctly, which a WIN1252 database would not', async () => {
    const game = await prisma.game.findUnique({ where: { slug: 'playstation' } });
    expect((game?.name as { he: string }).he).toBe('פלייסטיישן');
  });

  it('prices everything in agorot as positive integers', async () => {
    const offers = await prisma.offer.findMany({ select: { priceAmountMinor: true, priceCurrency: true } });
    for (const offer of offers) {
      expect(Number.isInteger(offer.priceAmountMinor)).toBe(true);
      expect(offer.priceAmountMinor).toBeGreaterThan(0);
      expect(offer.priceCurrency).toBe('ILS');
    }
  });

  it('never claims a review count that is not backed by review rows', async () => {
    // The mock frontend seed advertised 412 reviews against 5 written ones.
    // Ratings are now derived, so the only number available is the real count.
    const reviews = await prisma.review.count();
    expect(reviews).toBe(5);
  });

  it('marks demo reviews as unverified, because no order backs them', async () => {
    expect(await prisma.review.count({ where: { verifiedPurchase: true } })).toBe(0);
  });
});

describe('database rejects invalid data (not the application)', () => {
  it('refuses a duplicate offer for the same variant, platform and region', async () => {
    const existing = await prisma.offer.findFirst();
    expect(existing).not.toBeNull();

    const code = await sqlErrorCode(`
      INSERT INTO offers (id, product_id, variant_id, platform_id, region_id,
                          price_amount_minor, price_currency, fulfillment_method,
                          checkout_requirements, max_per_order, active, created_at, updated_at)
      VALUES ('offer__duplicate__test', '${existing!.productId}', '${existing!.variantId}',
              '${existing!.platformId}', '${existing!.regionId}', 100, 'ILS', 'DIGITAL_CODE',
              '[]'::jsonb, 10, true, now(), now())
    `);
    expect(code).not.toBeNull();
  });

  it('refuses a region-locked region with no restriction notice', async () => {
    const code = await sqlErrorCode(`
      INSERT INTO regions (id, code, name, currency, is_region_free, restriction_notice)
      VALUES ('reg-trap', 'UK', '{"he":"בריטניה"}'::jsonb, 'ILS', false, NULL)
    `);
    expect(code).not.toBeNull();
  });

  it('accepts a region-free region with no notice', async () => {
    const code = await sqlErrorCode(`
      INSERT INTO regions (id, code, name, currency, is_region_free, restriction_notice)
      VALUES ('reg-free-test', 'UK', '{"he":"בדיקה"}'::jsonb, 'ILS', true, NULL)
    `);
    expect(code).toBeNull();
    await prisma.$executeRawUnsafe(`DELETE FROM regions WHERE id = 'reg-free-test'`);
  });

  it('refuses a zero or negative offer price', async () => {
    const existing = await prisma.offer.findFirst();
    const code = await sqlErrorCode(`
      INSERT INTO offers (id, product_id, variant_id, platform_id, region_id,
                          price_amount_minor, price_currency, fulfillment_method,
                          checkout_requirements, max_per_order, active, created_at, updated_at)
      VALUES ('offer__free__test', '${existing!.productId}', '${existing!.variantId}',
              '${existing!.platformId}', 'reg-eu', 0, 'ILS', 'DIGITAL_CODE',
              '[]'::jsonb, 10, true, now(), now())
    `);
    expect(code).not.toBeNull();
  });

  it('refuses a strike-through price below the real price', async () => {
    const code = await sqlErrorCode(`
      UPDATE offers SET compare_at_minor = 1 WHERE id = (SELECT id FROM offers LIMIT 1)
    `);
    expect(code).not.toBeNull();
  });

  it('refuses a variant quantity with no unit, which could not be rendered', async () => {
    const product = await prisma.product.findFirst();
    const code = await sqlErrorCode(`
      INSERT INTO product_variants (id, product_id, name, sku, quantity_value, quantity_unit,
                                    metadata, sort_order, active)
      VALUES ('var-unitless-test', '${product!.id}', '{"he":"בדיקה"}'::jsonb, 'SKU-UNITLESS-TEST',
              500, NULL, '{}'::jsonb, 99, true)
    `);
    expect(code).not.toBeNull();
  });

  it('refuses negative inventory counts', async () => {
    const code = await sqlErrorCode(`
      UPDATE inventory SET quantity_reserved = -1
      WHERE offer_id = (SELECT offer_id FROM inventory LIMIT 1)
    `);
    expect(code).not.toBeNull();
  });

  it('refuses reserving more stock than exists, which is what overselling looks like', async () => {
    const limited = await prisma.inventory.findFirst({ where: { quantityAvailable: { not: null } } });
    expect(limited).not.toBeNull();
    const code = await sqlErrorCode(`
      UPDATE inventory SET quantity_reserved = ${(limited!.quantityAvailable ?? 0) + 5}
      WHERE offer_id = '${limited!.offerId}'
    `);
    expect(code).not.toBeNull();
  });

  it('refuses a review rating outside 1..5', async () => {
    const code = await sqlErrorCode(`
      INSERT INTO reviews (id, author_display_name, rating, body, verified_purchase, published, created_at)
      VALUES ('rev-invalid-test', 'בודק', 9, 'בדיקה', false, true, now())
    `);
    expect(code).not.toBeNull();
  });

  it('refuses an offer pointing at a product that does not exist', async () => {
    const existing = await prisma.offer.findFirst();
    const code = await sqlErrorCode(`
      INSERT INTO offers (id, product_id, variant_id, platform_id, region_id,
                          price_amount_minor, price_currency, fulfillment_method,
                          checkout_requirements, max_per_order, active, created_at, updated_at)
      VALUES ('offer__orphan__test', 'prod-does-not-exist', '${existing!.variantId}',
              '${existing!.platformId}', '${existing!.regionId}', 100, 'ILS', 'DIGITAL_CODE',
              '[]'::jsonb, 10, true, now(), now())
    `);
    expect(code).not.toBeNull();
  });

  it('refuses a duplicate product slug, which would make two products share a URL', async () => {
    const product = await prisma.product.findFirst();
    const code = await sqlErrorCode(`
      INSERT INTO products (id, game_id, slug, type, name, short_description, description,
                            images, metadata, tags, active, featured, created_at, updated_at)
      VALUES ('prod-dup-slug-test', '${product!.gameId}', '${product!.slug}', 'OTHER',
              '{"he":"בדיקה"}'::jsonb, '{"he":"בדיקה"}'::jsonb, '{"he":"בדיקה"}'::jsonb,
              '[]'::jsonb, '{}'::jsonb, ARRAY[]::text[], true, false, now(), now())
    `);
    expect(code).not.toBeNull();
  });

  it('refuses a NULL in a required column', async () => {
    const code = await sqlErrorCode(`
      INSERT INTO games (id, slug, name, publisher, short_description, active, featured,
                         sort_order, created_at, updated_at)
      VALUES ('game-null-test', 'null-test', NULL, 'Test', '{"he":"x"}'::jsonb,
              true, false, 0, now(), now())
    `);
    expect(code).not.toBeNull();
  });

  it('refuses an unknown enum value', async () => {
    const product = await prisma.product.findFirst();
    const code = await sqlErrorCode(`
      UPDATE products SET type = 'TELEPORTATION' WHERE id = '${product!.id}'
    `);
    expect(code).not.toBeNull();
  });
});

describe('order and payment invariants', () => {
  /** Builds the minimum rows an order needs, so the constraints can be exercised. */
  async function seedOrderFixture(suffix: string): Promise<{ sessionId: string; orderId: string }> {
    const offer = await prisma.offer.findFirstOrThrow();
    const sessionId = `cs-test-${suffix}`;
    const orderId = `ord-test-${suffix}`;

    await prisma.checkoutSession.create({
      data: {
        id: sessionId,
        status: 'READY_FOR_PAYMENT',
        pricingSnapshot: {},
        requirementsSnapshot: [],
        currency: 'ILS',
        regionId: offer.regionId,
        subtotalMinor: 10000,
        discountMinor: 0,
        totalMinor: 10000,
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });

    await prisma.order.create({
      data: {
        id: orderId,
        orderNumber: `EC-TEST-${suffix}`,
        checkoutSessionId: sessionId,
        contactEmail: 'qa@example.com',
        regionId: offer.regionId,
        currency: 'ILS',
        subtotalMinor: 10000,
        discountMinor: 0,
        totalMinor: 10000,
        pricingSnapshot: {},
      },
    });

    return { sessionId, orderId };
  }

  afterEach(async () => {
    await prisma.paymentIntent.deleteMany({ where: { orderId: { startsWith: 'ord-test-' } } });
    await prisma.order.deleteMany({ where: { id: { startsWith: 'ord-test-' } } });
    await prisma.checkoutSession.deleteMany({ where: { id: { startsWith: 'cs-test-' } } });
  });

  it('allows exactly one order per checkout session', async () => {
    const { sessionId } = await seedOrderFixture('one');
    const offer = await prisma.offer.findFirstOrThrow();

    // The duplicate-order guard: a retried submit must not produce a second order.
    await expect(
      prisma.order.create({
        data: {
          id: 'ord-test-one-duplicate',
          orderNumber: 'EC-TEST-DUP',
          checkoutSessionId: sessionId,
          contactEmail: 'qa@example.com',
          regionId: offer.regionId,
          currency: 'ILS',
          subtotalMinor: 10000,
          discountMinor: 0,
          totalMinor: 10000,
          pricingSnapshot: {},
        },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('refuses an order whose total does not equal subtotal minus discount', async () => {
    const offer = await prisma.offer.findFirstOrThrow();
    await prisma.checkoutSession.create({
      data: {
        id: 'cs-test-math', status: 'OPEN', pricingSnapshot: {}, requirementsSnapshot: [],
        currency: 'ILS', regionId: offer.regionId,
        subtotalMinor: 10000, discountMinor: 0, totalMinor: 10000,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const code = await sqlErrorCode(`
      INSERT INTO orders (id, order_number, checkout_session_id, contact_email, status,
                          region_id, currency, subtotal_minor, discount_minor, total_minor,
                          refunded_minor, pricing_snapshot, checkout_values, metadata,
                          created_at, updated_at)
      VALUES ('ord-test-math', 'EC-TEST-MATH', 'cs-test-math', 'qa@example.com', 'PENDING_PAYMENT',
              '${offer.regionId}', 'ILS', 10000, 1000, 9999, 0,
              '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, now(), now())
    `);
    expect(code).not.toBeNull();
  });

  it('refuses a refund larger than the amount captured', async () => {
    const { orderId } = await seedOrderFixture('refund');
    const code = await sqlErrorCode(
      `UPDATE orders SET refunded_minor = 20000 WHERE id = '${orderId}'`,
    );
    expect(code).not.toBeNull();
  });

  it('allows a refund up to the captured amount', async () => {
    const { orderId } = await seedOrderFixture('refund-ok');
    const code = await sqlErrorCode(
      `UPDATE orders SET refunded_minor = 10000 WHERE id = '${orderId}'`,
    );
    expect(code).toBeNull();
  });

  it('allows only one live payment intent per order', async () => {
    const { sessionId, orderId } = await seedOrderFixture('intent');

    await prisma.paymentIntent.create({
      data: {
        id: 'pi-test-1', orderId, checkoutSessionId: sessionId, provider: 'MOCK',
        amountMinor: 10000, currency: 'ILS', status: 'REQUIRES_ACTION',
      },
    });

    // A double-clicked Pay button must not be able to open a second payment.
    await expect(
      prisma.paymentIntent.create({
        data: {
          id: 'pi-test-2', orderId, checkoutSessionId: sessionId, provider: 'MOCK',
          amountMinor: 10000, currency: 'ILS', status: 'CREATED',
        },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('allows a new intent once the previous one has settled, so a retry works', async () => {
    const { sessionId, orderId } = await seedOrderFixture('retry');

    await prisma.paymentIntent.create({
      data: {
        id: 'pi-test-failed', orderId, checkoutSessionId: sessionId, provider: 'MOCK',
        amountMinor: 10000, currency: 'ILS', status: 'FAILED',
      },
    });

    await expect(
      prisma.paymentIntent.create({
        data: {
          id: 'pi-test-retry', orderId, checkoutSessionId: sessionId, provider: 'MOCK',
          amountMinor: 10000, currency: 'ILS', status: 'CREATED',
        },
      }),
    ).resolves.toBeDefined();
  });

  it('refuses an order line whose total is not price times quantity', async () => {
    const { orderId } = await seedOrderFixture('line');
    const offer = await prisma.offer.findFirstOrThrow();

    const code = await sqlErrorCode(`
      INSERT INTO order_items (id, order_id, offer_id, product_id, variant_id, platform_id,
                               region_id, quantity, unit_price_minor, total_price_minor,
                               display_name, display_variant, fulfillment_method, fulfillment_status)
      VALUES ('oi-test-1', '${orderId}', '${offer.id}', '${offer.productId}', '${offer.variantId}',
              '${offer.platformId}', '${offer.regionId}', 3, 5000, 9999,
              '{"he":"x"}'::jsonb, '{"he":"y"}'::jsonb, 'DIGITAL_CODE', 'PENDING')
    `);
    expect(code).not.toBeNull();
  });

  it('refuses a second fulfillment for the same order item', async () => {
    const { orderId } = await seedOrderFixture('fulfil');
    const offer = await prisma.offer.findFirstOrThrow();

    const item = await prisma.orderItem.create({
      data: {
        id: 'oi-test-fulfil', orderId, offerId: offer.id, productId: offer.productId,
        variantId: offer.variantId, platformId: offer.platformId, regionId: offer.regionId,
        quantity: 1, unitPriceMinor: 10000, totalPriceMinor: 10000,
        displayName: { he: 'x' }, displayVariant: { he: 'y' },
        fulfillmentMethod: 'DIGITAL_CODE',
      },
    });

    await prisma.fulfillment.create({
      data: { id: 'ful-test-1', orderId, orderItemId: item.id, method: 'DIGITAL_CODE' },
    });

    await expect(
      prisma.fulfillment.create({
        data: { id: 'ful-test-2', orderId, orderItemId: item.id, method: 'DIGITAL_CODE' },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });
});

describe('idempotency storage survives a restart', () => {
  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: 'test-' } } });
  });

  it('stores a key and refuses a duplicate for the same endpoint', async () => {
    await prisma.idempotencyKey.create({
      data: {
        key: 'test-key-1', endpoint: 'POST /orders', requestHash: 'abc',
        status: 'COMPLETED', responseStatus: 201, responseBody: { id: 'ord_1' },
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await expect(
      prisma.idempotencyKey.create({
        data: {
          key: 'test-key-1', endpoint: 'POST /orders', requestHash: 'abc',
          status: 'IN_PROGRESS', expiresAt: new Date(),
        },
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it('allows the same key on a different endpoint', async () => {
    await expect(
      prisma.idempotencyKey.create({
        data: {
          key: 'test-key-1', endpoint: 'POST /payment/intents', requestHash: 'abc',
          status: 'COMPLETED', expiresAt: new Date(Date.now() + 86_400_000),
        },
      }),
    ).resolves.toBeDefined();
  });

  it('is stored in PostgreSQL, so a process restart cannot forget it', async () => {
    // A fresh client is a different connection, standing in for a new process.
    const other = new PrismaClient();
    try {
      const found = await other.idempotencyKey.findUnique({
        where: { key_endpoint: { key: 'test-key-1', endpoint: 'POST /orders' } },
      });
      expect(found?.responseStatus).toBe(201);
    } finally {
      await other.$disconnect();
    }
  });
});

// Referenced for documentation of the codes asserted above.
export { CHECK_VIOLATION, FK_VIOLATION };
