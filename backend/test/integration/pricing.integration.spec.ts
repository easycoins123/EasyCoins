import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';
import { PRICING_DEFAULTS } from '../../src/modules/pricing/pricing-config';
import { PricingConfigService } from '../../src/modules/pricing/pricing-config.service';

/**
 * FC27 pricing against real PostgreSQL.
 *
 * What these prove:
 *
 * 1. The storefront sells FC26 until an operator activates the FC27 ladder;
 *    activation refuses to run on an unknown cost without an explicit
 *    acknowledgement, and with a known cost refuses a ladder under the floor.
 * 2. Activation writes one offer per package and platform at the configured
 *    prices, retires FC26, and the storefront endpoint flips; deactivation
 *    puts it back. An FC26 order placed before the switch still reads as
 *    FC26 afterwards.
 * 3. FIRST KICK adds bonus coins on a first order only, decided by the
 *    server, re-checked by email at order creation, and never as money off.
 * 4. A creator code is a coupon row: it discounts, it is capped by the
 *    ladder's maximum discount, it does not combine with FIRST KICK, and
 *    every redemption is counted.
 * 5. Nothing the admin can store makes a negative price, a giveaway or an
 *    inverted ladder.
 */
describe('FC27 pricing', () => {
  let app: NestExpressApplication;
  let config: PricingConfigService;
  const prisma = new PrismaClient();
  const ADMIN_TOKEN = 'qa-operator-token-0123456789abcdefghijklmnopqrstuv';

  const uniqueEmail = () => `pricing-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const key = (label: string) => `order-create:${label}-${Math.random().toString(36).slice(2, 10)}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.OTP_DEV_ECHO = 'true';
    process.env.HOUSEKEEPING_INTERVAL_SECONDS = '0';
    process.env.ADMIN_TOKENS = `qa:${ADMIN_TOKEN}`;
    app = await createApp();
    await app.init();
    config = app.get(PricingConfigService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await resetToFc26();
    await prisma.growthSetting.deleteMany({ where: { key: { startsWith: 'pricing.' } } });
    await app?.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.rateLimitCounter.deleteMany({});
    await prisma.growthSetting.deleteMany({ where: { key: { startsWith: 'pricing.' } } });
    config.invalidate();
  });

  // --- helpers -------------------------------------------------------------

  const api = () => request(app.getHttpServer());
  const admin = (method: 'get' | 'put' | 'post' | 'delete' | 'patch', path: string, body?: object) => {
    const call = api()[method](`/api/v1/admin/pricing${path}`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    return body ? call.send(body) : call;
  };
  const cookieOf = (response: request.Response): string | undefined => response.headers['set-cookie']?.[0]?.split(';')[0];

  async function resetToFc26(): Promise<void> {
    await prisma.offer.updateMany({ where: { productId: PRICING_DEFAULTS.ladder.productId }, data: { active: false } });
    await prisma.offer.updateMany({ where: { productId: 'prod-fc-coins' }, data: { active: true } });
    config.invalidate();
  }

  async function activateAcknowledged(): Promise<void> {
    await admin('post', '/ladder/activate', { acknowledgeUnknownCost: true }).expect(200);
    config.invalidate();
  }

  async function fc27Offer(coins = 1_000_000, platformId = 'plat-ps5') {
    return prisma.offer.findFirstOrThrow({
      where: { productId: PRICING_DEFAULTS.ladder.productId, platformId, variant: { quantityValue: coins } },
    });
  }

  /** Opens a checkout for one offer, fills the form, creates and pays the order. */
  async function paidOrder(offerId: string, options: { cookie?: string; email?: string; couponCode?: string } = {}) {
    let open = api().post('/api/v1/checkout/sessions').send({ items: [{ offerId, quantity: 1 }], ...(options.couponCode ? { couponCode: options.couponCode } : {}) });
    if (options.cookie) open = open.set('Cookie', options.cookie);
    const created = await open.expect(201);
    const cookie = options.cookie ?? cookieOf(created)!;
    const email = options.email ?? uniqueEmail();
    const values: Record<string, string | boolean> = {};
    for (const requirement of created.body.requirements) {
      if (!requirement.required) continue;
      values[requirement.key] = requirement.control === 'checkbox' ? true : requirement.key === 'EMAIL' ? email : requirement.key === 'FULL_NAME' ? 'דנה כהן' : 'Player_IL';
    }
    await api().post(`/api/v1/checkout/sessions/${created.body.id}/validate`).set('Cookie', cookie).send({ values }).expect(200);
    const order = await api().post('/api/v1/orders').set('Cookie', cookie).set('Idempotency-Key', key('pricing')).send({ checkoutSessionId: created.body.id }).expect(201);
    const intent = (await api().post('/api/v1/payment/intents').set('Cookie', cookie).send({ checkoutSessionId: created.body.id }).expect(201)).body.intent;
    await api().post(`/api/v1/payment/intents/${intent.id}/confirm`).set('Cookie', cookie).send({ instrument: { token: 'sim_success' } }).expect(200);
    return { cookie, email, order: order.body, session: created.body };
  }

  // --- 1. the gate --------------------------------------------------------

  it('sells FC26 until the ladder is activated, and refuses activation without a cost or an acknowledgement', async () => {
    await resetToFc26();
    const before = await api().get('/api/v1/storefront').expect(200);
    expect(before.body.activeEdition).toBe('fc26');
    expect(before.body.editions.find((edition: { id: string }) => edition.id === 'fc27').status).not.toBe('active');

    const refused = await admin('post', '/ladder/activate', {}).expect(409);
    expect(refused.body.error?.code ?? refused.body.code).toBe('LADDER_ACTIVATION_BLOCKED');

    const evaluation = await admin('get', '/evaluation').expect(200);
    expect(evaluation.body.costKnown).toBe(false);
    expect(evaluation.body.check.allowed).toBe(false);
    expect(evaluation.body.checkAcknowledged.allowed).toBe(true);
  });

  it('refuses a costed ladder under the margin floor and names the package', async () => {
    await admin('put', '/settings/economics', { value: { ...PRICING_DEFAULTS.economics, supplierCostPer1MMinor: 60_000 } }).expect(200);
    const refused = await admin('post', '/ladder/activate', { acknowledgeUnknownCost: true }).expect(409);
    expect(refused.body.error?.message ?? refused.body.message).toContain('margin floor');
  });

  it('refuses to store a negative price, a giveaway or an inverted ladder', async () => {
    const withPackages = (packages: unknown[]) => ({ value: { ...PRICING_DEFAULTS.ladder, packages } });
    const base = PRICING_DEFAULTS.ladder.packages;
    await admin('put', '/settings/ladder', withPackages([{ ...base[0], priceMinor: -1 }])).expect(422);
    await admin('put', '/settings/ladder', { value: { ...PRICING_DEFAULTS.ladder, maxDiscountBps: 10_000 } }).expect(422);
    await admin('put', '/settings/ladder', withPackages([base[0], { ...base[1], priceMinor: 30_000 }])).expect(422);
    await admin('put', '/settings/launch', { value: { ...PRICING_DEFAULTS.launch, startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-11-01T00:00:00Z' } }).expect(422);
  });

  // --- 2. activation ------------------------------------------------------

  it('activates the ladder: one offer per package and platform at the configured price, FC26 retired, storefront flipped', async () => {
    await resetToFc26();
    const fc26Order = await paidOrder((await prisma.offer.findFirstOrThrow({ where: { productId: 'prod-fc-coins', platformId: 'plat-xbox', variant: { quantityValue: 100_000 } } })).id);

    await activateAcknowledged();
    const active = PRICING_DEFAULTS.ladder.packages.filter((pack) => pack.active);
    const offers = await prisma.offer.findMany({ where: { productId: PRICING_DEFAULTS.ladder.productId, active: true } });
    expect(offers.length).toBe(active.length * 4);
    const million = await fc27Offer(1_000_000, 'plat-xbox');
    expect(million.priceAmountMinor).toBe(active.find((pack) => pack.key === '1m')!.priceMinor);
    expect(await prisma.offer.count({ where: { productId: 'prod-fc-coins', active: true } })).toBe(0);

    const storefront = await api().get('/api/v1/storefront').expect(200);
    expect(storefront.body.activeEdition).toBe('fc27');

    const product = await api().get('/api/v1/products/fc27-coins').expect(200);
    expect(product.body.product.metadata.edition).toBe('fc27');
    expect(product.body.offers.length).toBe(active.length * 4);
    await api().get('/api/v1/products?gameIds=game-ea-fc&page=1&pageSize=24').expect(200).then((response) => {
      const slugs = response.body.items.map((item: { slug: string }) => item.slug);
      expect(slugs).toContain('fc27-coins');
      expect(slugs).not.toContain('ea-fc-ultimate-team-coins');
    });

    // History is untouched: the FC26 order still says FC26 and keeps its price.
    const historical = await api().get(`/api/v1/orders/${fc26Order.order.id}`).set('Cookie', fc26Order.cookie).expect(200);
    expect(historical.body.items[0].edition).toBe('fc26');
    expect(historical.body.totals.total.amountMinor).toBe(fc26Order.order.totals.total.amountMinor);

    const audit = await prisma.auditLog.findFirst({ where: { eventType: 'pricing.ladder.activated' }, orderBy: { createdAt: 'desc' } });
    expect(audit?.actorId).toBe('qa');
    expect((audit?.afterState as { acknowledgeUnknownCost: boolean }).acknowledgeUnknownCost).toBe(true);

    const rollback = await admin('post', '/ladder/deactivate').expect(200);
    expect(rollback.body.offersRetired).toBe(active.length * 4);
    expect((await api().get('/api/v1/storefront').expect(200)).body.activeEdition).toBe('fc26');
  });

  it('advertises in the sitemap only the edition with live offers, never a page with nothing to buy', async () => {
    const before = await api().get('/api/v1/sitemap.xml').expect(200);
    expect(before.headers['content-type']).toContain('application/xml');
    expect(before.text).toContain('<loc>http://localhost:4200/products/ea-fc-ultimate-team-coins</loc>');
    expect(before.text).not.toContain('fc27-coins');
    // Not advertised because there is nothing to buy: the page is missing
    // (production, before the first activation) or has no live offers.
    const draft = await api().get('/api/v1/products/fc27-coins');
    expect(draft.status === 404 || draft.body.offers.length === 0).toBe(true);

    await activateAcknowledged();
    const after = await api().get('/api/v1/sitemap.xml').expect(200);
    expect(after.text).toContain('<loc>http://localhost:4200/products/fc27-coins</loc>');
    expect(after.text).not.toContain('ea-fc-ultimate-team-coins');
    await api().get('/api/v1/products/fc27-coins').expect(200);

    await admin('post', '/ladder/deactivate').expect(200);
    config.invalidate();
    const restored = await api().get('/api/v1/sitemap.xml').expect(200);
    expect(restored.text).toContain('ea-fc-ultimate-team-coins');
    expect(restored.text).not.toContain('fc27-coins');
    await resetToFc26();
  });

  it('re-prices the whole cart from the new rows and the checkout total equals the offer price', async () => {
    await activateAcknowledged();
    const offer = await fc27Offer(500_000, 'plat-pc');
    const validated = await api().post('/api/v1/cart/validate').send({ items: [{ offerId: offer.id, quantity: 2 }] }).expect(200);
    expect(validated.body.cart.totals.subtotal.amountMinor).toBe(offer.priceAmountMinor * 2);
    const checkout = await api().post('/api/v1/checkout/sessions').send({ items: [{ offerId: offer.id, quantity: 2 }] }).expect(201);
    expect(checkout.body.cart.totals.total.amountMinor).toBe(offer.priceAmountMinor * 2);
    await resetToFc26();
  });

  // --- 3. FIRST KICK ------------------------------------------------------

  it('adds bonus coins on a first order only, in coins not money, re-checked by email', async () => {
    await activateAcknowledged();
    await admin('put', '/settings/launch', { value: { ...PRICING_DEFAULTS.launch, enabled: true, startsAt: null, endsAt: null } }).expect(200);
    const offer = await fc27Offer(1_000_000, 'plat-ps5');

    const fresh = await api().post('/api/v1/cart/validate').send({ items: [{ offerId: offer.id, quantity: 1 }] }).expect(200);
    const welcome = fresh.body.cart.benefits.applied.find((benefit: { kind: string }) => benefit.kind === 'FIRST_ORDER');
    expect(welcome).toBeDefined();
    expect(welcome.effect.coins).toBe(100_000); // 10% of 1M, at the cap
    expect(fresh.body.cart.benefits.campaignCoins).toBe(100_000);
    expect(fresh.body.cart.totals.discount.amountMinor).toBe(0);
    expect(fresh.body.cart.totals.total.amountMinor).toBe(offer.priceAmountMinor);

    // First paid order: the benefit is on the order record.
    const first = await paidOrder(offer.id);
    const order = await api().get(`/api/v1/orders/${first.order.id}`).set('Cookie', first.cookie).expect(200);
    expect(order.body.campaignCoins).toBe(100_000);
    expect(order.body.campaignId).toBe(PRICING_DEFAULTS.launch.id);

    // Same session again: not a first order any more, and the cart says so.
    const again = await api().post('/api/v1/cart/validate').set('Cookie', first.cookie).send({ items: [{ offerId: offer.id, quantity: 1 }] }).expect(200);
    expect(again.body.cart.benefits.applied.some((benefit: { kind: string }) => benefit.kind === 'FIRST_ORDER')).toBe(false);
    expect(again.body.cart.benefits.rejected.find((benefit: { kind: string }) => benefit.kind === 'FIRST_ORDER')?.code).toBe('FIRST_ORDER_ONLY');

    // A fresh browser but the same email: the cart is provisional, the order is not.
    const sameEmail = await paidOrder(offer.id, { email: first.email });
    const second = await api().get(`/api/v1/orders/${sameEmail.order.id}`).set('Cookie', sameEmail.cookie).expect(200);
    expect(second.body.campaignCoins).toBe(0);
    expect(second.body.benefits.rejected.find((benefit: { kind: string }) => benefit.kind === 'FIRST_ORDER')?.code).toBe('FIRST_ORDER_ONLY');
    await resetToFc26();
  });

  it('does not fire under the minimum order or outside the window', async () => {
    await activateAcknowledged();
    await admin('put', '/settings/launch', { value: { ...PRICING_DEFAULTS.launch, enabled: true, startsAt: null, endsAt: null, benefit: { ...PRICING_DEFAULTS.launch.benefit, minOrderMinor: 50_000 } } }).expect(200);
    const small = await fc27Offer(100_000, 'plat-ps5');
    const cart = await api().post('/api/v1/cart/validate').send({ items: [{ offerId: small.id, quantity: 1 }] }).expect(200);
    expect(cart.body.cart.benefits.campaignCoins).toBe(0);

    await admin('put', '/settings/launch', { value: { ...PRICING_DEFAULTS.launch, enabled: true, startsAt: '2030-01-01T00:00:00Z', endsAt: '2030-02-01T00:00:00Z' } }).expect(200);
    const big = await fc27Offer(1_000_000, 'plat-ps5');
    const later = await api().post('/api/v1/cart/validate').send({ items: [{ offerId: big.id, quantity: 1 }] }).expect(200);
    expect(later.body.cart.benefits.campaignCoins).toBe(0);
    expect((await api().get('/api/v1/storefront').expect(200)).body.launch.live).toBe(false);
    await resetToFc26();
  });

  // --- 4. creator codes ---------------------------------------------------

  it('creates a creator code, applies it as a capped percentage, counts the redemption and refuses it beside FIRST KICK', async () => {
    await activateAcknowledged();
    await admin('put', '/settings/launch', { value: { ...PRICING_DEFAULTS.launch, enabled: true, startsAt: null, endsAt: null } }).expect(200);
    const code = `QA${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const created = await admin('post', '/codes', { code, creator: 'Test Creator', percentBps: 2_500, maxRedemptions: 5 }).expect(201);
    expect(created.body.code).toBe(code);
    expect(created.body.percentBps).toBe(2_500);

    const offer = await fc27Offer(1_000_000, 'plat-ps5');

    // On a first order the welcome benefit wins and the code is set aside, in words.
    const first = await api().post('/api/v1/cart/validate').send({ items: [{ offerId: offer.id, quantity: 1 }], couponCode: code }).expect(200);
    expect(first.body.cart.benefits.applied.some((benefit: { kind: string }) => benefit.kind === 'FIRST_ORDER')).toBe(true);
    expect(first.body.cart.benefits.rejected.find((benefit: { kind: string }) => benefit.kind === 'COUPON')?.code).toBe('COUPON_NOT_COMBINABLE');
    expect(first.body.cart.totals.discount.amountMinor).toBe(0);

    // A returning customer gets the code, capped at the ladder's maximum discount (15% < 25%).
    const returning = await paidOrder(offer.id);
    const withCode = await api().post('/api/v1/cart/validate').set('Cookie', returning.cookie).send({ items: [{ offerId: offer.id, quantity: 1 }], couponCode: code }).expect(200);
    const cap = Math.floor((offer.priceAmountMinor * PRICING_DEFAULTS.ladder.maxDiscountBps) / 10_000);
    expect(withCode.body.cart.totals.discount.amountMinor).toBe(cap);
    expect(withCode.body.cart.totals.total.amountMinor).toBe(offer.priceAmountMinor - cap);

    const paidWithCode = await paidOrder(offer.id, { cookie: returning.cookie, email: returning.email, couponCode: code });
    expect(paidWithCode.order.couponCode).toBe(code);
    const redemption = await prisma.couponRedemption.findFirst({ where: { orderId: paidWithCode.order.id } });
    expect(redemption?.amountMinor).toBe(cap);
    const listed = await admin('get', '/codes').expect(200);
    expect(listed.body.find((entry: { code: string }) => entry.code === code).redemptionCount).toBe(1);
    const attribution = await admin('get', `/codes/${code}/attribution`).expect(200);
    expect(attribution.body.orders).toBe(1);

    // Paused, the code is worth nothing.
    await admin('patch', `/codes/${code}`, { active: false }).expect(200);
    const paused = await api().post('/api/v1/cart/validate').set('Cookie', returning.cookie).send({ items: [{ offerId: offer.id, quantity: 1 }], couponCode: code }).expect(200);
    expect(paused.body.cart.totals.discount.amountMinor).toBe(0);
    await resetToFc26();
  });

  it('refuses a creator code above 30% or with a malformed code', async () => {
    await admin('post', '/codes', { code: 'BIG', creator: 'x', percentBps: 5_000 }).expect(422);
    await admin('post', '/codes', { code: 'no spaces', creator: 'x', percentBps: 500 }).expect(422);
  });
});
