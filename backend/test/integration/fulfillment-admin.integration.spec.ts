import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createApp } from '../../src/main';

/**
 * The operator API and the fulfillment state machine, against a real server and
 * a real PostgreSQL.
 *
 * The properties that matter here are the ones that cost money when they break:
 *
 * 1. An unauthenticated caller reaches nothing.
 * 2. Two operators cannot work the same job.
 * 3. Nothing is delivered against an order that is not paid.
 * 4. The delivery instruction never contains a credential field.
 * 5. An order is only "fulfilled" once every item is.
 *
 * Concurrency is exercised with genuinely simultaneous HTTP requests rather
 * than a simulated race inside one process.
 */
describe('fulfillment and the operator API', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  const YUVAL = 'test-operator-token-yuval-0123456789abcdef';
  const DEKEL = 'test-operator-token-dekel-0123456789abcdef';

  let offerId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.OTP_DEV_ECHO = 'true';
    process.env.ADMIN_TOKENS = `yuval:${YUVAL},dekel:${DEKEL}`;

    app = await createApp();
    await app.init();
    await prisma.$connect();

    const offer = await prisma.offer.findFirstOrThrow({
      where: { active: true, inventory: { status: 'IN_STOCK' } },
      orderBy: { id: 'asc' },
    });
    offerId = offer.id;
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

  const asOperator = (method: 'get' | 'post', path: string, token = YUVAL) =>
    request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);

  /** Drives a purchase all the way to paid, so its fulfillments exist and are PENDING. */
  async function paidOrder(): Promise<{ orderId: string; fulfillmentId: string; cookie: string }> {
    const created = await post('/checkout/sessions', { items: [{ offerId, quantity: 1 }] }).expect(201);
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
      `ful-${Math.random().toString(36).slice(2, 12)}`,
    ).expect(201);

    const opened = await post('/payment/intents', { checkoutSessionId: created.body.id }, cookie)
      .expect(201);
    await post(
      `/payment/intents/${opened.body.intent.id}/confirm`,
      { instrument: { token: 'sim_success' } },
      cookie,
    ).expect(200);

    const fulfillment = await prisma.fulfillment.findFirstOrThrow({
      where: { orderId: order.body.id },
    });

    return { orderId: order.body.id, fulfillmentId: fulfillment.id, cookie };
  }

  describe('authentication', () => {
    it('refuses a request with no token', async () => {
      await request(app.getHttpServer()).get('/api/v1/admin/fulfillments').expect(401);
    });

    it('refuses an unknown token', async () => {
      await asOperator('get', '/admin/fulfillments', 'not-a-real-token-but-long-enough-to-pass')
        .expect(401);
    });

    it('refuses a customer session cookie in place of an operator token', async () => {
      // The two authentication systems are separate on purpose: a stolen
      // storefront session must not reach the operator API.
      const created = await post('/checkout/sessions', { items: [{ offerId, quantity: 1 }] }).expect(201);
      const cookie = created.headers['set-cookie'][0].split(';')[0];

      await request(app.getHttpServer())
        .get('/api/v1/admin/fulfillments')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('refuses a token that is a prefix of a valid one', async () => {
      await asOperator('get', '/admin/fulfillments', YUVAL.slice(0, -1)).expect(401);
    });

    it('accepts each configured operator', async () => {
      await asOperator('get', '/admin/fulfillments', YUVAL).expect(200);
      await asOperator('get', '/admin/fulfillments', DEKEL).expect(200);
    });
  });

  describe('the queue', () => {
    it('lists a paid order as work to do', async () => {
      const { orderId, fulfillmentId } = await paidOrder();

      // Filtered to the order rather than reading the first page: the queue is
      // oldest-first and the development database is not emptied between runs,
      // so a brand-new job is at the far end of it.
      const response = await asOperator('get', `/admin/fulfillments?orderId=${orderId}`).expect(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);

      expect(ids).toContain(fulfillmentId);
      expect(response.body.items[0].status).toBe('PENDING');
    });

    it('exposes the customer answers the operator needs to do the job', async () => {
      const { orderId } = await paidOrder();

      const response = await asOperator('get', `/admin/fulfillments?orderId=${orderId}`).expect(200);
      const job = response.body.items[0];

      expect(job.order.contactEmail).toBeDefined();
      expect(job.order.checkoutValues).toBeDefined();
    });

    it('never exposes a credential field, because none is ever collected', async () => {
      const { orderId } = await paidOrder();

      const response = await asOperator('get', `/admin/fulfillments?orderId=${orderId}`).expect(200);
      const serialized = JSON.stringify(response.body).toLowerCase();

      for (const forbidden of ['password', 'backupcode', 'backup_code', 'securityanswer', '2fa']) {
        expect(serialized).not.toContain(forbidden);
      }
    });
  });

  describe('claiming', () => {
    it('gives a job to exactly one of two operators racing for it', async () => {
      const { fulfillmentId } = await paidOrder();

      const [first, second] = await Promise.all([
        asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`, YUVAL).send({}),
        asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`, DEKEL).send({}),
      ]);

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 409]);

      const stored = await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
      expect(['yuval', 'dekel']).toContain(stored.operatorId);
    });

    it('lets the holder re-claim without error', async () => {
      const { fulfillmentId } = await paidOrder();

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);
    });

    it('returns a released job to the queue', async () => {
      const { fulfillmentId } = await paidOrder();

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/release`).send({}).expect(200);

      const stored = await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
      expect(stored.operatorId).toBeNull();
      expect(stored.status).toBe('PENDING');
    });

    it('refuses to let one operator release another operator’s job', async () => {
      const { fulfillmentId } = await paidOrder();

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`, YUVAL).send({}).expect(200);
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/release`, DEKEL).send({}).expect(409);
    });
  });

  describe('the Buy the Player instruction', () => {
    it('issues listings that add up to at least what was ordered', async () => {
      const { fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);

      const response = await asOperator('post', `/admin/fulfillments/${fulfillmentId}/trade-instruction`)
        .send({ playerName: 'Bronze Common Keeper', coins: 1_000_000 })
        .expect(200);

      const instruction = response.body.customerInstruction;
      expect(instruction.kind).toBe('TRADE');
      expect(instruction.deliveredCoins).toBeGreaterThanOrEqual(1_000_000);
      expect(instruction.trades.length).toBeGreaterThan(0);
    });

    it('moves the job to WAITING_FOR_CUSTOMER, which is the honest state', async () => {
      const { fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/trade-instruction`)
        .send({ playerName: 'Bronze Common Keeper', coins: 500_000 })
        .expect(200);

      const stored = await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
      expect(stored.status).toBe('WAITING_FOR_CUSTOMER');
    });

    it('rejects an unknown field, so a credential cannot be smuggled in', async () => {
      const { fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/trade-instruction`)
        .send({ playerName: 'Bronze Common Keeper', coins: 500_000, password: 'hunter2' })
        .expect(422);
    });

    it('refuses an amount the market cannot deliver', async () => {
      const { fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/trade-instruction`)
        .send({ playerName: 'Bronze Common Keeper', coins: 5 })
        .expect(422);
    });

    it('previews a plan without touching an order', async () => {
      const response = await asOperator('get', '/admin/trade-preview?coins=2000000').expect(200);

      expect(response.body.deliveredCoins).toBeGreaterThanOrEqual(2_000_000);
      expect(response.body.grossCoinsSpent).toBeGreaterThan(response.body.deliveredCoins);
    });
  });

  describe('delivering', () => {
    it('marks the order fulfilled once its only item is delivered', async () => {
      const { orderId, fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/deliver`)
        .send({ payload: { kind: 'TRADE', completedTrades: 1 } })
        .expect(200);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('FULFILLED');
    });

    it('records who delivered it', async () => {
      const { fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`, DEKEL).send({}).expect(200);

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/deliver`, DEKEL)
        .send({ payload: { kind: 'TRADE', completedTrades: 1 } })
        .expect(200);

      const events = await prisma.fulfillmentEvent.findMany({ where: { fulfillmentId } });
      const delivered = events.find((event) => event.type === 'DELIVERED');

      expect(delivered?.actorId).toBe('dekel');
      expect(delivered?.actorType).toBe('OPERATOR');
    });

    it('writes an audit entry for every operator action', async () => {
      const { fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);

      const entries = await prisma.auditLog.findMany({
        where: { entityType: 'fulfillment', entityId: fulfillmentId },
      });

      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].actorType).toBe('OPERATOR');
      expect(entries[0].actorId).toBe('yuval');
    });

    it('refuses to deliver against an order that is not paid', async () => {
      const { orderId, fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);

      // The money went back between the job opening and the operator acting.
      await prisma.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } });

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/deliver`)
        .send({ payload: { kind: 'TRADE' } })
        .expect(409);
    });

    it('refuses to deliver a job claimed by someone else', async () => {
      const { fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`, YUVAL).send({}).expect(200);

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/deliver`, DEKEL)
        .send({ payload: { kind: 'TRADE' } })
        .expect(409);
    });

    it('lets exactly one of two simultaneous deliveries win', async () => {
      const { fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);

      const [first, second] = await Promise.all([
        asOperator('post', `/admin/fulfillments/${fulfillmentId}/deliver`).send({
          payload: { kind: 'TRADE', attempt: 1 },
        }),
        asOperator('post', `/admin/fulfillments/${fulfillmentId}/deliver`).send({
          payload: { kind: 'TRADE', attempt: 2 },
        }),
      ]);

      // The loser may be rejected as a conflict, or accepted as a repeat of a
      // transition already made. What must not happen is two DELIVERED events.
      expect([first.status, second.status]).toContain(200);

      const delivered = await prisma.fulfillmentEvent.count({
        where: { fulfillmentId, type: 'DELIVERED' },
      });
      expect(delivered).toBe(1);
    });
  });

  describe('failing and retrying', () => {
    it('requires a Hebrew reason, because the customer is shown it', async () => {
      const { fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/fail`)
        .send({ reason: { en: 'supplier timeout' } })
        .expect(422);
    });

    it('records the failure and moves the order to FAILED', async () => {
      const { orderId, fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/fail`)
        .send({ reason: { he: 'הספק לא סיפק את הקוינס בזמן.', en: 'The supplier did not deliver in time.' } })
        .expect(200);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(order.status).toBe('FAILED');
    });

    it('returns a failed job to the queue on retry', async () => {
      const { fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/fail`)
        .send({ reason: { he: 'ניסיון ראשון נכשל.' } })
        .expect(200);

      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/retry`).send({}).expect(200);

      const stored = await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
      expect(stored.status).toBe('PENDING');
      expect(stored.operatorId).toBeNull();
      expect(stored.failureReason).toBeNull();
    });

    it('refuses an illegal transition outright', async () => {
      const { fulfillmentId } = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/claim`).send({}).expect(200);
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/deliver`)
        .send({ payload: { kind: 'TRADE' } })
        .expect(200);

      // DELIVERED is terminal for fulfillment; undoing it is a refund, which is
      // a money operation and does not belong to this state machine.
      await asOperator('post', `/admin/fulfillments/${fulfillmentId}/fail`)
        .send({ reason: { he: 'שינוי דעה.' } })
        .expect(409);
    });
  });

  describe('the customer hand-off', () => {
    /** Drives a paid order to a waiting trade instruction the customer can confirm. */
    async function waitingTradeOrder() {
      const order = await paidOrder();
      await asOperator('post', `/admin/fulfillments/${order.fulfillmentId}/claim`).send({}).expect(200);
      await asOperator('post', `/admin/fulfillments/${order.fulfillmentId}/trade-instruction`)
        .send({ playerName: 'Bronze Common Keeper', coins: 500_000 })
        .expect(200);
      return order;
    }

    it('moves a waiting trade job to READY when the customer says they listed it', async () => {
      const { orderId, fulfillmentId, cookie } = await waitingTradeOrder();

      await post(`/orders/${orderId}/mark-listed`, {}, cookie).expect(200);

      const stored = await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
      expect(stored.status).toBe('READY');
    });

    it('records the hand-off as the customer, with no operator name attached', async () => {
      const { orderId, fulfillmentId, cookie } = await waitingTradeOrder();

      await post(`/orders/${orderId}/mark-listed`, {}, cookie).expect(200);

      const event = await prisma.fulfillmentEvent.findFirstOrThrow({
        where: { fulfillmentId, type: 'CUSTOMER_LISTED' },
      });
      expect(event.actorType).toBe('CUSTOMER');
      expect(event.actorId).toBeNull();
    });

    it('is idempotent: a second confirmation adds no second event', async () => {
      const { orderId, fulfillmentId, cookie } = await waitingTradeOrder();

      await post(`/orders/${orderId}/mark-listed`, {}, cookie).expect(200);
      await post(`/orders/${orderId}/mark-listed`, {}, cookie).expect(200);

      const stored = await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
      expect(stored.status).toBe('READY');

      const events = await prisma.fulfillmentEvent.count({
        where: { fulfillmentId, type: 'CUSTOMER_LISTED' },
      });
      expect(events).toBe(1);
    });

    it('will not let a stranger advance an order they do not own', async () => {
      const { orderId, fulfillmentId } = await waitingTradeOrder();

      // No cookie: an anonymous caller is a different session and must see a
      // not-found, never someone else's order.
      await post(`/orders/${orderId}/mark-listed`, {}).expect(404);

      const stored = await prisma.fulfillment.findUniqueOrThrow({ where: { id: fulfillmentId } });
      expect(stored.status).toBe('WAITING_FOR_CUSTOMER');
    });
  });

  describe('the dashboard', () => {
    it('counts open work', async () => {
      await paidOrder();

      const response = await asOperator('get', '/admin/stats').expect(200);

      expect(response.body.open).toBeGreaterThan(0);
      expect(typeof response.body.revenueTodayMinor).toBe('number');
    });
  });
});
