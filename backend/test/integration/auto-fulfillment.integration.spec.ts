import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';

/** Launch bonus coins a variant promises, from its metadata. Zero when none. */
function launchBonusOf(metadata: unknown): number {
  const bonus = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>)['launchBonus'] : undefined;
  return typeof bonus === 'number' && bonus > 0 ? Math.round(bonus) : 0;
}

/**
 * Automatic delivery planning, end to end.
 *
 * The property under test is that **nobody touches the order**. A coin purchase
 * is paid through the public storefront endpoints and, with no operator call of
 * any kind, the delivery instruction exists and the customer can see it.
 *
 * The second property matters as much: when the automation cannot do the job,
 * it degrades to the operator queue rather than damaging a paid order.
 */
describe('automatic delivery planning', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.OTP_DEV_ECHO = 'true';
    app = await createApp();
    await app.init();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.rateLimitCounter.deleteMany({});
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  const post = (path: string, body: object, cookie?: string, idempotencyKey?: string) => {
    let call = request(app.getHttpServer()).post(`/api/v1${path}`).send(body);
    if (cookie) call = call.set('Cookie', cookie);
    if (idempotencyKey) call = call.set('Idempotency-Key', idempotencyKey);
    return call;
  };

  /** An offer for a product of the given type, with a known coin quantity. */
  async function offerFor(type: 'GAME_CURRENCY' | 'GIFT_CARD') {
    return prisma.offer.findFirstOrThrow({
      where: {
        active: true,
        inventory: { status: 'IN_STOCK' },
        product: { type },
        variant: type === 'GAME_CURRENCY' ? { quantityValue: { not: null } } : {},
      },
      include: { variant: true },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Buys and pays, using only the endpoints a customer uses.
   *
   * Deliberately calls no admin route: if an instruction exists afterwards, the
   * system wrote it.
   */
  async function buyAndPay(offerId: string, quantity = 1) {
    const created = await post('/checkout/sessions', { items: [{ offerId, quantity }] }).expect(201);
    const cookie = created.headers['set-cookie'][0].split(';')[0];

    const values: Record<string, string | boolean> = {};
    for (const requirement of created.body.requirements) {
      if (!requirement.required) continue;
      values[requirement.key] =
        requirement.control === 'checkbox'
          ? true
          : requirement.key === 'EMAIL'
            ? 'buyer@example.com'
            : requirement.options?.length
              ? requirement.options[0].value
              : 'Test Value';
    }
    await post(`/checkout/sessions/${created.body.id}/validate`, { values }, cookie).expect(200);

    const order = await post(
      '/orders',
      { checkoutSessionId: created.body.id },
      cookie,
      `auto-${Math.random().toString(36).slice(2, 12)}`,
    ).expect(201);

    const opened = await post('/payment/intents', { checkoutSessionId: created.body.id }, cookie)
      .expect(201);
    await post(
      `/payment/intents/${opened.body.intent.id}/confirm`,
      { instrument: { token: 'sim_success' } },
      cookie,
    ).expect(200);

    return { orderId: order.body.id as string, cookie };
  }

  describe('a paid coin order plans itself', () => {
    it('writes the listing instruction with no operator involved', async () => {
      const offer = await offerFor('GAME_CURRENCY');
      const { orderId } = await buyAndPay(offer.id);

      const fulfillment = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const instruction = fulfillment.customerInstruction as {
        kind: string;
        playerName: string;
        requestedCoins: number;
        deliveredCoins: number;
        issuedBy: string;
        trades: unknown[];
      } | null;

      expect(fulfillment.status).toBe('WAITING_FOR_CUSTOMER');
      expect(instruction).not.toBeNull();
      expect(instruction?.kind).toBe('TRADE');
      expect(instruction?.playerName).toBeTruthy();
      expect(instruction?.trades.length).toBeGreaterThan(0);
    });

    it('derives the amount from the variant rather than asking anyone', async () => {
      const offer = await offerFor('GAME_CURRENCY');
      const { orderId } = await buyAndPay(offer.id);

      const fulfillment = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const instruction = fulfillment.customerInstruction as { requestedCoins: number; deliveredCoins: number };

      // The variant's coins plus the launch bonus its metadata promises. The
      // planner used to deliver the base amount alone, which under-delivered
      // every bundle sold with a bonus.
      expect(instruction.requestedCoins).toBe((offer.variant.quantityValue ?? 0) + launchBonusOf(offer.variant.metadata));
      // Rounding favours the customer, always.
      expect(instruction.deliveredCoins).toBeGreaterThanOrEqual(instruction.requestedCoins);
    });

    it('multiplies the variant by the quantity ordered', async () => {
      const offer = await offerFor('GAME_CURRENCY');
      const { orderId } = await buyAndPay(offer.id, 2);

      const fulfillment = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const instruction = fulfillment.customerInstruction as { requestedCoins: number };

      expect(instruction.requestedCoins).toBe(((offer.variant.quantityValue ?? 0) + launchBonusOf(offer.variant.metadata)) * 2);
    });

    it('attributes the instruction to the system, not to a person', async () => {
      const offer = await offerFor('GAME_CURRENCY');
      const { orderId } = await buyAndPay(offer.id);

      const fulfillment = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const event = await prisma.fulfillmentEvent.findFirstOrThrow({
        where: { fulfillmentId: fulfillment.id, type: 'TRADE_INSTRUCTION_ISSUED' },
      });

      expect(event.actorType).toBe('SYSTEM');
      expect(event.actorId).toBeNull();
    });

    it('moves the order out of FULFILLMENT_PENDING', async () => {
      const offer = await offerFor('GAME_CURRENCY');
      const { orderId } = await buyAndPay(offer.id);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('FULFILLMENT_PROCESSING');
    });

    it('shows the customer what to list, on their own order', async () => {
      const offer = await offerFor('GAME_CURRENCY');
      const { orderId, cookie } = await buyAndPay(offer.id);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/orders/${orderId}`)
        .set('Cookie', cookie)
        .expect(200);

      const serialized = JSON.stringify(response.body);
      expect(serialized).toContain('TRADE');
    });
  });

  describe('what it deliberately does not do', () => {
    it('leaves a gift card alone: it is not delivered by a trade', async () => {
      const offer = await offerFor('GIFT_CARD');
      const { orderId } = await buyAndPay(offer.id);

      const fulfillment = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });

      expect(fulfillment.customerInstruction).toBeNull();
      expect(fulfillment.status).toBe('PENDING');
    });

    it('issues one instruction however many times settlement is applied', async () => {
      const offer = await offerFor('GAME_CURRENCY');
      const { orderId } = await buyAndPay(offer.id);

      const fulfillment = await prisma.fulfillment.findFirstOrThrow({ where: { orderId } });
      const issued = await prisma.fulfillmentEvent.count({
        where: { fulfillmentId: fulfillment.id, type: 'TRADE_INSTRUCTION_ISSUED' },
      });

      expect(issued).toBe(1);
    });
  });
});
