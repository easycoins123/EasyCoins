import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';
import { LadderService } from '../../src/modules/pricing/ladder.service';
import { PRICING_DEFAULTS, PRICING_SETTING_PREFIX } from '../../src/modules/pricing/pricing-config';
import { PricingConfigService } from '../../src/modules/pricing/pricing-config.service';
import { GrowthConfigService } from '../../src/modules/growth/growth-config.service';
import { GROWTH_DEFAULTS } from '../../src/modules/growth/growth-config';
import { HousekeepingService } from '../../src/modules/housekeeping/housekeeping.service';
import { SandboxPaymentProvider } from '../../src/modules/payments/providers/sandbox-payment.provider';

/**
 * The growth programmes against real PostgreSQL.
 *
 * What these prove, in the order the owner asked:
 *
 * 1. A paid order earns exactly one EasyDrop, whatever is replayed; a reveal
 *    is recorded once, a refresh shows the same reward, and a second reveal
 *    cannot re-roll it.
 * 2. An earned reward is spent once: held by the order that uses it, spent
 *    when that order is paid, returned if it is cancelled, refused everywhere
 *    else, and never priced for someone who does not own it.
 * 3. Stacking is decided by the server: an earned reward joins the launch
 *    bonus, a coupon joins nothing.
 * 4. A custom amount is priced by the server's rule and nothing the client
 *    sends can move that price.
 * 5. Referral pays out only on a referred visitor's first paid order, never
 *    to oneself, never twice.
 * 6. Points, tiers, founders' seats and trust figures are computed from paid
 *    orders and published only past their thresholds.
 */
describe('growth programmes', () => {
  let app: NestExpressApplication;
  let provider: SandboxPaymentProvider;
  let housekeeping: HousekeepingService;
  let config: GrowthConfigService;
  const prisma = new PrismaClient();
  const ADMIN_TOKEN = 'qa-operator-token-0123456789abcdefghijklmnopqrstuv';

  let coinOfferId: string;
  let coinOfferMinor: number;
  let plainOfferId: string;

  const key = (label: string) => `order-create:${label}-${Math.random().toString(36).slice(2, 10)}`;
  const uniqueEmail = () => `growth-${Math.random().toString(36).slice(2, 10)}@example.com`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.OTP_DEV_ECHO = 'true';
    process.env.HOUSEKEEPING_INTERVAL_SECONDS = '0';
    process.env.ADMIN_TOKENS = `qa:${ADMIN_TOKEN}`;

    app = await createApp();
    await app.init();
    provider = app.get(SandboxPaymentProvider);
    housekeeping = app.get(HousekeepingService);
    config = app.get(GrowthConfigService);
    await prisma.$connect();

    // These prove the growth mechanics on the FC26 catalog they were written
    // against (its launch-bonus variants). The owner's FC27 ladder and the
    // FIRST KICK offer are switched off for this file through the same
    // overrides the admin would use, and switched back on at the end.
    await app.get(LadderService).deactivate('growth-spec');
    await app.get(PricingConfigService).set('launch', { ...PRICING_DEFAULTS.launch, enabled: false }, 'growth-spec');

    const coin = await prisma.offer.findFirstOrThrow({
      where: { product: { slug: 'ea-fc-ultimate-team-coins' }, variant: { quantityValue: 1_000_000 }, platformId: 'plat-ps5', active: true },
    });
    coinOfferId = coin.id;
    coinOfferMinor = coin.priceAmountMinor;
    const plain = await prisma.offer.findFirstOrThrow({
      where: { product: { slug: 'fortnite-v-bucks' }, active: true, inventory: { status: 'IN_STOCK' } },
      orderBy: { priceAmountMinor: 'desc' },
    });
    plainOfferId = plain.id;
  });

  beforeEach(async () => {
    await prisma.rateLimitCounter.deleteMany({});
    await prisma.growthSetting.deleteMany({ where: { NOT: { key: { startsWith: PRICING_SETTING_PREFIX } } } });
    config.invalidate();
  });

  afterAll(async () => {
    await app.get(LadderService).activate('growth-spec', true);
    await prisma.growthSetting.deleteMany({});
    // Reviews these tests wrote against their own orders. The content suites
    // assert that the seed's demonstration reviews are the only ones present.
    await prisma.review.deleteMany({ where: { orderId: { not: null } } });
    await app?.close();
    await prisma.$disconnect();
  });

  // --- helpers -------------------------------------------------------------

  const post = (path: string, body: object, cookie?: string, idempotencyKey?: string) => {
    let call = request(app.getHttpServer()).post(`/api/v1${path}`).send(body);
    if (cookie) call = call.set('Cookie', cookie);
    if (idempotencyKey) call = call.set('Idempotency-Key', idempotencyKey);
    return call;
  };
  const get = (path: string, cookie?: string) => {
    let call = request(app.getHttpServer()).get(`/api/v1${path}`);
    if (cookie) call = call.set('Cookie', cookie);
    return call;
  };
  const admin = (method: 'get' | 'put' | 'post' | 'delete' | 'patch', path: string, body?: object) => {
    const call = request(app.getHttpServer())[method](`/api/v1/admin/growth${path}`).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    return body ? call.send(body) : call;
  };
  const cookieOf = (response: request.Response): string | undefined => response.headers['set-cookie']?.[0]?.split(';')[0];

  /** Registers an account and returns its session cookie. */
  async function registered(email = uniqueEmail(), cookie?: string): Promise<{ cookie: string; email: string; customerId: string }> {
    let call = post('/auth/register', { email, password: 'correct-horse-battery-9', displayName: 'דנה' });
    if (cookie) call = call.set('Cookie', cookie);
    const response = await call.expect(204);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { email } });
    return { cookie: cookieOf(response)!, email, customerId: customer.id };
  }

  /** Opens a checkout, fills it, creates the order. Returns everything a payment needs. */
  async function placedOrder(
    items: { offerId: string; quantity: number }[] = [{ offerId: coinOfferId, quantity: 1 }],
    options: { cookie?: string; couponCode?: string; rewardId?: string; email?: string } = {},
  ) {
    let call = post('/checkout/sessions', { items, ...(options.couponCode ? { couponCode: options.couponCode } : {}), ...(options.rewardId ? { rewardId: options.rewardId } : {}) });
    if (options.cookie) call = call.set('Cookie', options.cookie);
    const created = await call.expect(201);
    const cookie = options.cookie ?? cookieOf(created)!;

    const values: Record<string, string | boolean> = {};
    for (const requirement of created.body.requirements) {
      if (!requirement.required) continue;
      values[requirement.key] = requirement.control === 'checkbox'
        ? true
        : requirement.key === 'EMAIL'
          ? options.email ?? 'buyer@example.com'
          : requirement.options?.length ? requirement.options[0].value : 'Test Value';
    }
    await post(`/checkout/sessions/${created.body.id}/validate`, { values }, cookie).expect(200);
    const order = await post('/orders', { checkoutSessionId: created.body.id }, cookie, key('growth')).expect(201);
    return { orderId: order.body.id as string, checkoutId: created.body.id as string, cookie, checkout: created.body, order: order.body };
  }

  async function pay(checkoutId: string, cookie: string, token = 'sim_success') {
    const intent = (await post('/payment/intents', { checkoutSessionId: checkoutId }, cookie).expect(201)).body.intent;
    const result = await post(`/payment/intents/${intent.id}/confirm`, { instrument: { token } }, cookie).expect(200);
    return { intentId: intent.id as string, status: result.body.status as string };
  }

  async function paidOrder(options: Parameters<typeof placedOrder>[1] = {}, items?: Parameters<typeof placedOrder>[0]) {
    const placed = await placedOrder(items, options);
    await pay(placed.checkoutId, placed.cookie);
    return placed;
  }

  /** Makes every EasyDrop card a known reward, so a test can spend it. */
  async function pinEasyDropTo(card: { kind: string; value: number; minOrderMinor?: number }) {
    await config.set('easydrop', {
      ...GROWTH_DEFAULTS.easydrop,
      pools: [{ tier: 'DROP', name: { he: 'DROP', en: 'DROP' }, minTotalMinor: 0, cards: [{ ...card, title: { he: 'הטבת בדיקה', en: 'Test reward' } }] }],
    }, 'test');
  }

  function deliver(payload: object) {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    return request(app.getHttpServer())
      .post('/api/v1/webhooks/payments/mock')
      .set('Content-Type', 'application/json')
      .set('X-TT-Timestamp', timestamp)
      .set('X-TT-Signature', provider.sign(Buffer.from(body, 'utf8'), timestamp))
      .send(body);
  }

  // -------------------------------------------------------------------------
  describe('EasyDrop', () => {
    it('issues exactly one drop for a paid order and none before payment', async () => {
      const placed = await placedOrder();
      const before = await get(`/orders/${placed.orderId}/easydrop`, placed.cookie).expect(200);
      expect(before.body.drop).toBeNull();

      await pay(placed.checkoutId, placed.cookie);

      const after = await get(`/orders/${placed.orderId}/easydrop`, placed.cookie).expect(200);
      expect(after.body.drop.status).toBe('ISSUED');
      expect(after.body.drop.cardCount).toBe(3);
      expect(after.body.drop.reward).toBeNull();
      // Closed cards stay closed on the wire.
      expect(JSON.stringify(after.body)).not.toContain('"cards"');
      expect(await prisma.easyDrop.count({ where: { orderId: placed.orderId } })).toBe(1);
    });

    it('reveals once: a refresh and a second pick return the same reward', async () => {
      const placed = await paidOrder();
      const first = await post(`/orders/${placed.orderId}/easydrop/reveal`, { index: 1 }, placed.cookie).expect(200);
      expect(first.body.drop.status).toBe('REVEALED');
      expect(first.body.drop.pickedIndex).toBe(1);
      expect(first.body.drop.reward.id).toMatch(/^rwd_/);

      const refreshed = await get(`/orders/${placed.orderId}/easydrop`, placed.cookie).expect(200);
      expect(refreshed.body.drop.reward.id).toBe(first.body.drop.reward.id);

      const again = await post(`/orders/${placed.orderId}/easydrop/reveal`, { index: 2 }, placed.cookie).expect(200);
      expect(again.body.drop.pickedIndex).toBe(1);
      expect(again.body.drop.reward.id).toBe(first.body.drop.reward.id);

      expect(await prisma.customerReward.count({ where: { source: 'EASYDROP', sourceOrderId: placed.orderId } })).toBe(1);
    });

    it('issues one reward for five simultaneous reveals', async () => {
      const placed = await paidOrder();
      const responses = await Promise.all(
        [0, 1, 2, 0, 1].map((index) => post(`/orders/${placed.orderId}/easydrop/reveal`, { index }, placed.cookie)),
      );
      const ids = new Set(responses.filter((r) => r.status === 200).map((r) => r.body.drop.reward.id));
      expect(ids.size).toBe(1);
      expect(await prisma.customerReward.count({ where: { source: 'EASYDROP', sourceOrderId: placed.orderId } })).toBe(1);
    });

    it('is not re-issued by a replayed payment event', async () => {
      const placed = await placedOrder();
      const { intentId } = await pay(placed.checkoutId, placed.cookie);
      const row = await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intentId } });
      await deliver({ id: `evt_${Math.random()}`, type: 'payment.succeeded', occurredAt: new Date().toISOString(), data: { intentId: row.providerIntentId, status: 'SUCCEEDED' } }).expect(200);
      await deliver({ id: `evt_${Math.random()}`, type: 'payment.succeeded', occurredAt: new Date().toISOString(), data: { intentId: row.providerIntentId, status: 'SUCCEEDED' } }).expect(200);
      expect(await prisma.easyDrop.count({ where: { orderId: placed.orderId } })).toBe(1);
    });

    it('is invisible to another session', async () => {
      const placed = await paidOrder();
      const stranger = await placedOrder();
      await get(`/orders/${placed.orderId}/easydrop`, stranger.cookie).expect(404);
      await post(`/orders/${placed.orderId}/easydrop/reveal`, { index: 0 }, stranger.cookie).expect(404);
      await get(`/orders/${placed.orderId}/easydrop`).expect(404);
    });

    it('rejects an index outside the cards', async () => {
      const placed = await paidOrder();
      const response = await post(`/orders/${placed.orderId}/easydrop/reveal`, { index: 7 }, placed.cookie);
      expect(response.status).toBe(422);
      expect(await prisma.customerReward.count({ where: { source: 'EASYDROP', sourceOrderId: placed.orderId } })).toBe(0);
    });

    it('issues nothing when the programme is switched off', async () => {
      await config.set('easydrop', { ...GROWTH_DEFAULTS.easydrop, enabled: false }, 'test');
      const placed = await paidOrder();
      const response = await get(`/orders/${placed.orderId}/easydrop`, placed.cookie).expect(200);
      expect(response.body.drop).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('rewards and stacking', () => {
    it('a next-order credit joins the launch bonus, is held by the order and spent when it is paid', async () => {
      await pinEasyDropTo({ kind: 'NEXT_ORDER_CREDIT', value: 500 });
      const first = await paidOrder();
      const revealed = await post(`/orders/${first.orderId}/easydrop/reveal`, { index: 0 }, first.cookie).expect(200);
      const rewardId = revealed.body.drop.reward.id as string;
      expect(revealed.body.drop.reward.usage).toBe('checkout');

      const validated = await post('/cart/validate', { items: [{ offerId: coinOfferId, quantity: 1 }], rewardId }, first.cookie).expect(200);
      expect(validated.body.cart.totals.discount.amountMinor).toBe(500);
      expect(validated.body.cart.totals.total.amountMinor).toBe(coinOfferMinor - 500);
      expect(validated.body.cart.benefits.applied.map((b: { kind: string }) => b.kind).sort()).toEqual(['LAUNCH_BONUS', 'REWARD']);
      expect(validated.body.cart.benefits.rejected).toHaveLength(0);

      const second = await placedOrder(undefined, { cookie: first.cookie, rewardId });
      expect(second.order.totals.discount.amountMinor).toBe(500);
      expect(second.order.rewardId).toBe(rewardId);
      let reward = await prisma.customerReward.findUniqueOrThrow({ where: { id: rewardId } });
      expect(reward.status).toBe('RESERVED');
      expect(reward.redeemedOrderId).toBe(second.orderId);

      // Held: a third checkout cannot take it.
      const third = await post('/checkout/sessions', { items: [{ offerId: coinOfferId, quantity: 1 }], rewardId }, first.cookie).expect(201);
      expect(third.body.cart.totals.discount.amountMinor).toBe(0);
      expect(third.body.cart.benefits.rejected[0].code).toBe('REWARD_NOT_AVAILABLE');

      await pay(second.checkoutId, first.cookie);
      reward = await prisma.customerReward.findUniqueOrThrow({ where: { id: rewardId } });
      expect(reward.status).toBe('REDEEMED');

      const paidOrderRow = await prisma.order.findUniqueOrThrow({ where: { id: second.orderId } });
      expect(paidOrderRow.paidAt).not.toBeNull();
    });

    it('returns a held reward when the order is cancelled', async () => {
      await pinEasyDropTo({ kind: 'NEXT_ORDER_CREDIT', value: 300 });
      const first = await paidOrder();
      const rewardId = (await post(`/orders/${first.orderId}/easydrop/reveal`, { index: 0 }, first.cookie)).body.drop.reward.id;

      const second = await placedOrder(undefined, { cookie: first.cookie, rewardId });
      const intent = (await post('/payment/intents', { checkoutSessionId: second.checkoutId }, first.cookie).expect(201)).body.intent;
      await post(`/payment/intents/${intent.id}/cancel`, {}, first.cookie).expect(200);

      const reward = await prisma.customerReward.findUniqueOrThrow({ where: { id: rewardId } });
      expect(reward.status).toBe('AVAILABLE');
      expect(reward.redeemedOrderId).toBeNull();
    });

    it('adds reward coins to the delivery instruction, with the launch bonus', async () => {
      await pinEasyDropTo({ kind: 'NEXT_ORDER_COINS', value: 25_000 });
      const first = await paidOrder();
      const rewardId = (await post(`/orders/${first.orderId}/easydrop/reveal`, { index: 0 }, first.cookie)).body.drop.reward.id;

      const second = await paidOrder({ cookie: first.cookie, rewardId });
      const order = await prisma.order.findUniqueOrThrow({ where: { id: second.orderId } });
      expect((order.metadata as { rewardCoins?: number }).rewardCoins).toBe(25_000);

      const fulfillment = await prisma.fulfillment.findFirstOrThrow({ where: { orderId: second.orderId } });
      const instruction = fulfillment.customerInstruction as { requestedCoins: number } | null;
      // 1M bundle + 100K launch bonus + 25K reward.
      expect(instruction?.requestedCoins).toBe(1_125_000);

      const read = await get(`/orders/${second.orderId}`, first.cookie).expect(200);
      expect(read.body.rewardCoins).toBe(25_000);
      expect(read.body.items[0].coins).toBe(1_000_000);
      expect(read.body.items[0].bonusCoins).toBe(100_000);
    });

    it('never prices a reward for someone who does not own it', async () => {
      await pinEasyDropTo({ kind: 'NEXT_ORDER_CREDIT', value: 500 });
      const owner = await paidOrder();
      const rewardId = (await post(`/orders/${owner.orderId}/easydrop/reveal`, { index: 0 }, owner.cookie)).body.drop.reward.id;

      const stranger = await placedOrder();
      const validated = await post('/cart/validate', { items: [{ offerId: coinOfferId, quantity: 1 }], rewardId }, stranger.cookie).expect(200);
      expect(validated.body.cart.totals.discount.amountMinor).toBe(0);
      expect(validated.body.cart.benefits.rejected[0].code).toBe('REWARD_NOT_FOUND');

      const anonymous = await post('/cart/validate', { items: [{ offerId: coinOfferId, quantity: 1 }], rewardId }).expect(200);
      expect(anonymous.body.cart.totals.discount.amountMinor).toBe(0);
    });

    it('refuses a coupon beside the launch bonus and beside a reward, with the reason', async () => {
      await prisma.promotion.update({ where: { id: 'promo-launch' }, data: { active: true } });
      try {
        const withBonus = await post('/cart/validate', { items: [{ offerId: coinOfferId, quantity: 2 }], couponCode: 'launch-week' }).expect(200);
        expect(withBonus.body.cart.totals.discount.amountMinor).toBe(0);
        expect(withBonus.body.issues.some((issue: { code: string }) => issue.code === 'COUPON_NOT_COMBINABLE')).toBe(true);
        expect(withBonus.body.cart.benefits.rejected[0]).toMatchObject({ kind: 'COUPON', code: 'COUPON_NOT_COMBINABLE' });

        const plain = await post('/cart/validate', { items: [{ offerId: plainOfferId, quantity: 1 }], couponCode: 'launch-week' }).expect(200);
        expect(plain.body.cart.totals.discount.amountMinor).toBeGreaterThan(0);
        expect(plain.body.cart.benefits.applied.map((b: { kind: string }) => b.kind)).toEqual(['COUPON']);

        await pinEasyDropTo({ kind: 'NEXT_ORDER_CREDIT', value: 200 });
        const earned = await paidOrder();
        const rewardId = (await post(`/orders/${earned.orderId}/easydrop/reveal`, { index: 0 }, earned.cookie)).body.drop.reward.id;
        const both = await post('/cart/validate', { items: [{ offerId: plainOfferId, quantity: 1 }], couponCode: 'launch-week', rewardId }, earned.cookie).expect(200);
        expect(both.body.cart.benefits.applied.map((b: { kind: string }) => b.kind)).toEqual(['REWARD']);
        expect(both.body.cart.benefits.rejected[0]).toMatchObject({ kind: 'COUPON', code: 'COUPON_NOT_COMBINABLE' });
        expect(both.body.cart.totals.discount.amountMinor).toBe(200);
      } finally {
        await prisma.promotion.update({ where: { id: 'promo-launch' }, data: { active: false } });
      }
    });

    it('lists what a session earned, and moves it into the account on sign-in', async () => {
      await pinEasyDropTo({ kind: 'NEXT_ORDER_CREDIT', value: 500 });
      const guest = await paidOrder();
      const rewardId = (await post(`/orders/${guest.orderId}/easydrop/reveal`, { index: 0 }, guest.cookie)).body.drop.reward.id;

      const asGuest = await get('/account/rewards', guest.cookie).expect(200);
      expect(asGuest.body.available.map((r: { id: string }) => r.id)).toEqual([rewardId]);

      const account = await registered(uniqueEmail(), guest.cookie);
      const asCustomer = await get('/account/rewards', account.cookie).expect(200);
      expect(asCustomer.body.available.map((r: { id: string }) => r.id)).toEqual([rewardId]);

      const reward = await prisma.customerReward.findUniqueOrThrow({ where: { id: rewardId } });
      expect(reward.customerId).toBe(account.customerId);
    });

    it('housekeeping expires and revokes what should no longer count', async () => {
      await pinEasyDropTo({ kind: 'NEXT_ORDER_CREDIT', value: 500 });
      const placed = await paidOrder();
      const rewardId = (await post(`/orders/${placed.orderId}/easydrop/reveal`, { index: 0 }, placed.cookie)).body.drop.reward.id;

      await prisma.customerReward.update({ where: { id: rewardId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
      const swept = await housekeeping.sweep();
      expect(swept.rewardsExpired).toBeGreaterThanOrEqual(1);
      expect((await prisma.customerReward.findUniqueOrThrow({ where: { id: rewardId } })).status).toBe('EXPIRED');

      const other = await paidOrder();
      const otherReward = (await post(`/orders/${other.orderId}/easydrop/reveal`, { index: 0 }, other.cookie)).body.drop.reward.id;
      await prisma.order.update({ where: { id: other.orderId }, data: { status: 'REFUNDED' } });
      const sweptAgain = await housekeeping.sweep();
      expect(sweptAgain.rewardsRevoked).toBeGreaterThanOrEqual(1);
      expect((await prisma.customerReward.findUniqueOrThrow({ where: { id: otherReward } })).status).toBe('REVOKED');
    });
  });

  // -------------------------------------------------------------------------
  describe('custom coins', () => {
    it('prices an amount by the ladder rule and sells it at exactly that price', async () => {
      const quote = await post('/coins/custom/quote', { mode: 'amount', amount: 1_370_000, platformId: 'plat-ps5' }).expect(200);
      // 1.37M at the 1M rung's rate (₪75 per million), rounded up to a shekel.
      expect(quote.body.amount).toBe(1_370_000);
      expect(quote.body.priceMinor).toBe(10_300);
      expect(quote.body.bonus).toBe(137_000);
      expect(quote.body.totalCoins).toBe(1_507_000);
      expect(quote.body.rungAmount).toBe(1_000_000);
      expect(quote.body.offerId).toMatch(/custom-1370000/);

      const line = await post('/cart/items', { offerId: quote.body.offerId, quantity: 1 }).expect(201);
      expect(line.body.unitPrice.amountMinor).toBe(10_300);
      expect(line.body.coins).toBe(1_370_000);
      expect(line.body.bonusCoins).toBe(137_000);

      // The offer is real but not on the shelf.
      const detail = await get('/products/ea-fc-ultimate-team-coins').expect(200);
      expect(detail.body.product.variants.some((variant: { id: string }) => variant.id.includes('custom'))).toBe(false);
      expect(detail.body.offers.some((offer: { id: string }) => offer.id.includes('custom'))).toBe(false);
      expect(detail.body.product.variants).toHaveLength(11);
    });

    it('cannot be moved by anything the client sends', async () => {
      const quote = await post('/coins/custom/quote', { mode: 'amount', amount: 1_370_000, platformId: 'plat-ps5' }).expect(200);
      const tampered = await post('/cart/items', { offerId: quote.body.offerId, quantity: 1, unitPrice: { amountMinor: 1 } });
      expect(tampered.status).toBe(422);

      const priced = await post('/coins/custom/quote', { mode: 'amount', amount: 1_370_000, platformId: 'plat-ps5', priceMinor: 100 });
      expect(priced.status).toBe(422);

      const validated = await post('/cart/validate', { items: [{ offerId: quote.body.offerId, quantity: 5 }] }).expect(200);
      // Custom offers sell one per order.
      expect(validated.body.cart.items[0].quantity).toBe(1);
      expect(validated.body.cart.totals.total.amountMinor).toBe(10_300);
    });

    it('never undercuts the next bundle and equals a bundle at its own size', async () => {
      const exact = await post('/coins/custom/quote', { mode: 'amount', amount: 1_000_000, platformId: 'plat-ps5' }).expect(200);
      expect(exact.body.priceMinor).toBe(coinOfferMinor);
      expect(exact.body.bonus).toBe(100_000);

      const between = await post('/coins/custom/quote', { mode: 'amount', amount: 1_490_000, platformId: 'plat-ps5' }).expect(200);
      const next = await prisma.offer.findFirstOrThrow({ where: { product: { slug: 'ea-fc-ultimate-team-coins' }, variant: { quantityValue: 1_500_000 }, platformId: 'plat-ps5' } });
      expect(between.body.priceMinor).toBeGreaterThan(next.priceAmountMinor - 100);
      expect(between.body.perMillionMinor).toBeGreaterThanOrEqual(Math.round((next.priceAmountMinor / 1_650_000) * 1_000_000));
    });

    it('answers a budget with the most coins that fit', async () => {
      const quote = await post('/coins/custom/quote', { mode: 'budget', budgetMinor: 6_700, platformId: 'plat-ps5' }).expect(200);
      expect(quote.body.priceMinor).toBeLessThanOrEqual(6_700);
      expect(quote.body.amount % 10_000).toBe(0);
      const more = await post('/coins/custom/quote', { mode: 'amount', amount: quote.body.amount + 10_000, platformId: 'plat-ps5' }).expect(200);
      expect(more.body.priceMinor).toBeGreaterThan(6_700);
    });

    it('snaps onto the step grid and refuses amounts outside the range', async () => {
      const snapped = await post('/coins/custom/quote', { mode: 'amount', amount: 1_374_999, platformId: 'plat-ps5' }).expect(200);
      expect(snapped.body.amount).toBe(1_370_000);

      const small = await post('/coins/custom/quote', { mode: 'amount', amount: 50_000, platformId: 'plat-ps5' });
      expect(small.status).toBe(422);
      expect(small.body.code).toBe('AMOUNT_TOO_SMALL');

      const large = await post('/coins/custom/quote', { mode: 'amount', amount: 50_000_000, platformId: 'plat-ps5' });
      expect(large.status).toBe(422);
      expect(large.body.code).toBe('AMOUNT_TOO_LARGE');

      const tiny = await post('/coins/custom/quote', { mode: 'budget', budgetMinor: 100, platformId: 'plat-ps5' });
      expect(tiny.status).toBe(422);
      expect(tiny.body.code).toBe('BUDGET_TOO_SMALL');
    });

    it('is refused when the owner switches it off', async () => {
      await config.set('customCoins', { ...GROWTH_DEFAULTS.customCoins, enabled: false }, 'test');
      const response = await post('/coins/custom/quote', { mode: 'amount', amount: 1_370_000, platformId: 'plat-ps5' });
      expect(response.status).toBe(404);
      const rules = await get('/coins/custom/rules').expect(200);
      expect(rules.body.enabled).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('referral', () => {
    it('pays both people on the friend\'s first paid order, once', async () => {
      const referrer = await registered();
      const code = (await get('/account/referral', referrer.cookie).expect(200)).body.code as string;
      expect(code).toMatch(/^EC[A-Z0-9]{6}$/);

      const attach = await post('/referral/attach', { code });
      expect(attach.body).toMatchObject({ attached: true, outcome: 'ATTACHED' });
      const friendCookie = cookieOf(attach)!;
      // A fresh email: an address that already bought (in this or an earlier run) is, correctly, not a first order.
      const friendEmail = uniqueEmail();

      const first = await paidOrder({ cookie: friendCookie, email: friendEmail });
      const referrerRewards = await prisma.customerReward.findMany({ where: { customerId: referrer.customerId, source: 'REFERRAL_REFERRER' } });
      expect(referrerRewards).toHaveLength(1);
      expect(referrerRewards[0].sourceOrderId).toBe(first.orderId);
      const friendRewards = await prisma.customerReward.findMany({ where: { source: 'REFERRAL_FRIEND', sourceOrderId: first.orderId } });
      expect(friendRewards).toHaveLength(1);

      const attribution = await prisma.referralAttribution.findFirstOrThrow({ where: { code } });
      expect(attribution.status).toBe('REWARDED');

      await paidOrder({ cookie: friendCookie, email: friendEmail });
      expect(await prisma.customerReward.count({ where: { customerId: referrer.customerId, source: 'REFERRAL_REFERRER' } })).toBe(1);

      const summary = await get('/account/referral', referrer.cookie).expect(200);
      expect(summary.body.stats.rewarded).toBe(1);
    });

    it('refuses a customer referring themselves', async () => {
      const referrer = await registered();
      const code = (await get('/account/referral', referrer.cookie).expect(200)).body.code as string;
      const attach = await post('/referral/attach', { code }, referrer.cookie).expect(200);
      expect(attach.body).toMatchObject({ attached: false, outcome: 'SELF' });
    });

    it('refuses an existing customer and an unknown code', async () => {
      const referrer = await registered();
      const code = (await get('/account/referral', referrer.cookie).expect(200)).body.code as string;
      const veteran = await registered();
      await paidOrder({ cookie: veteran.cookie, email: veteran.email });
      const attach = await post('/referral/attach', { code }, veteran.cookie).expect(200);
      expect(attach.body).toMatchObject({ attached: false, outcome: 'EXISTING_CUSTOMER' });

      const unknown = await post('/referral/attach', { code: 'ECNOPE00' }).expect(200);
      expect(unknown.body.outcome).toBe('UNKNOWN_CODE');
    });

    it('rejects the attribution when the friend uses the referrer\'s address', async () => {
      const referrer = await registered();
      const code = (await get('/account/referral', referrer.cookie).expect(200)).body.code as string;
      const attach = await post('/referral/attach', { code }).expect(200);
      const friendCookie = cookieOf(attach)!;
      await paidOrder({ cookie: friendCookie, email: referrer.email });
      const attribution = await prisma.referralAttribution.findFirstOrThrow({ where: { code } });
      expect(attribution.status).toBe('REJECTED');
      expect(attribution.reason).toBe('SAME_EMAIL');
      expect(await prisma.customerReward.count({ where: { customerId: referrer.customerId, source: 'REFERRAL_REFERRER' } })).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  describe('EASYCLUB, founders and trust', () => {
    it('computes points and tier from paid orders and seats a founder', async () => {
      await prisma.founderSeat.deleteMany({});
      const account = await registered();
      await get('/account/club').expect(401);

      const placed = await paidOrder({ cookie: account.cookie, email: account.email });
      const club = await get('/account/club', account.cookie).expect(200);
      expect(club.body.points.base).toBe(Math.floor(placed.order.totals.total.amountMinor / 100));
      expect(club.body.tier.id).toBe('STARTER');
      expect(club.body.nextTier.id).toBe('PRO');
      expect(club.body.orders.count).toBe(1);
      expect(club.body.streak.count).toBe(1);
      expect(club.body.founders.seatNumber).toBe(1);
      // The founders' points reward counts at once.
      expect(club.body.points.bonus).toBe(100);
      expect(club.body.referral.code).toMatch(/^EC/);

      const founders = await get('/growth/founders').expect(200);
      expect(founders.body.taken).toBe(1);
      expect(founders.body.remaining).toBe(GROWTH_DEFAULTS.founders.cap - 1);

      const again = await paidOrder({ cookie: account.cookie, email: account.email });
      const clubAgain = await get('/account/club', account.cookie).expect(200);
      expect(clubAgain.body.streak.count).toBe(2);
      expect(clubAgain.body.orders.count).toBe(2);
      // The second order inside the window earns the configured streak points.
      expect(clubAgain.body.points.bonus).toBe(200);
      expect(await prisma.founderSeat.count({ where: { customerId: account.customerId } })).toBe(1);
      void again;
    });

    it('stops counting a refunded order', async () => {
      const account = await registered();
      const placed = await paidOrder({ cookie: account.cookie, email: account.email });
      const before = await get('/account/club', account.cookie).expect(200);
      expect(before.body.points.base).toBeGreaterThan(0);
      await prisma.order.update({ where: { id: placed.orderId }, data: { status: 'REFUNDED' } });
      const after = await get('/account/club', account.cookie).expect(200);
      expect(after.body.points.base).toBe(0);
      expect(after.body.orders.count).toBe(0);
    });

    it('publishes trust figures only past their thresholds', async () => {
      const snapshot = await get('/growth/trust').expect(200);
      expect(snapshot.body.enabled).toBe(true);
      for (const metric of snapshot.body.metrics) {
        if (metric.sampleSize < metric.threshold) {
          expect(metric.published).toBe(false);
          expect(metric.value).toBeNull();
        }
      }
      const raw = await admin('get', '/trust').expect(200);
      expect(typeof raw.body.raw.completedOrders).toBe('number');
      expect(raw.body.thresholds.completedOrders).toBe(GROWTH_DEFAULTS.trust.thresholds.completedOrders);
    });

    it('shows no drop when none is active and a scheduled one only with a date', async () => {
      const none = await get('/growth/campaigns').expect(200);
      expect(none.body).toEqual([]);

      const created = await admin('post', '/campaigns', {
        slug: `test-drop-${Math.random().toString(36).slice(2, 8)}`,
        kind: 'WEEKEND_DROP',
        status: 'SCHEDULED',
        title: { he: 'דרופ בדיקה', en: 'Test drop' },
        lede: { he: 'דרופ לבדיקה בלבד.', en: 'A test drop.' },
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      }).expect(201);
      expect(created.body.status).toBe('scheduled');
      const listed = await get('/growth/campaigns').expect(200);
      expect(listed.body.some((campaign: { id: string }) => campaign.id === created.body.id)).toBe(true);

      await admin('patch', `/campaigns/${created.body.id}`, { status: 'ENDED' }).expect(200);
      const gone = await get('/growth/campaigns').expect(200);
      expect(gone.body.some((campaign: { id: string }) => campaign.id === created.body.id)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('owner configuration', () => {
    it('validates a setting and names the bad field', async () => {
      const bad = await admin('put', '/settings/easydrop', { value: { ...GROWTH_DEFAULTS.easydrop, pools: [{ tier: 'DROP', name: { he: 'x' }, minTotalMinor: 0, cards: [] }] } });
      expect(bad.status).toBe(422);
      expect(bad.body.code).toBe('GROWTH_SETTING_INVALID');

      const extra = await admin('put', '/settings/founders', { value: { ...GROWTH_DEFAULTS.founders, reward: { kind: 'EXTRA_COINS', value: 1000, title: { he: 'x', en: 'x' } } } });
      expect(extra.status).toBe(422);

      const good = await admin('put', '/settings/founders', { value: { ...GROWTH_DEFAULTS.founders, cap: 11 } }).expect(200);
      expect(good.body.value.cap).toBe(11);
      const listed = await admin('get', '/settings').expect(200);
      expect(listed.body.find((row: { key: string }) => row.key === 'founders').source).toBe('override');
      const founders = await get('/growth/founders').expect(200);
      expect(founders.body.cap).toBe(11);

      await admin('delete', '/settings/founders').expect(204);
      const reset = await get('/growth/founders').expect(200);
      expect(reset.body.cap).toBe(GROWTH_DEFAULTS.founders.cap);
    });

    it('refuses the admin API without an operator token', async () => {
      await request(app.getHttpServer()).get('/api/v1/admin/growth/settings').expect(401);
      await request(app.getHttpServer()).put('/api/v1/admin/growth/settings/founders').send({ value: {} }).expect(401);
    });
  });

  // -------------------------------------------------------------------------
  describe('verified reviews', () => {
    it('accepts a review only for a delivered order the caller owns, once', async () => {
      const account = await registered();
      const placed = await paidOrder({ cookie: account.cookie, email: account.email });

      const early = await post('/account/reviews', { orderId: placed.orderId, rating: 5, body: 'הגיע מהר, תודה רבה!' }, account.cookie);
      expect(early.status).toBe(409);
      expect(early.body.code).toBe('REVIEW_ORDER_NOT_DELIVERED');

      await prisma.fulfillment.updateMany({ where: { orderId: placed.orderId }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
      await prisma.order.update({ where: { id: placed.orderId }, data: { status: 'FULFILLED' } });

      const stranger = await registered();
      await post('/account/reviews', { orderId: placed.orderId, rating: 5, body: 'הגיע מהר, תודה רבה!' }, stranger.cookie).expect(404);

      const created = await post('/account/reviews', { orderId: placed.orderId, rating: 5, body: 'הגיע מהר, תודה רבה!' }, account.cookie).expect(201);
      expect(created.body.verifiedPurchase).toBe(true);
      expect(created.body.published).toBe(false);
      const row = await prisma.review.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.verifiedPurchase).toBe(true);
      expect(row.orderId).toBe(placed.orderId);
      expect(row.authorDisplayName).toBe('דנה');

      const again = await post('/account/reviews', { orderId: placed.orderId, rating: 4, body: 'עוד פעם, גם טוב מאוד.' }, account.cookie);
      expect(again.status).toBe(409);

      await admin('post', `/reviews/${created.body.id}/publish`, {}).expect(204);
      expect((await prisma.review.findUniqueOrThrow({ where: { id: created.body.id } })).published).toBe(true);
    });
  });
});
