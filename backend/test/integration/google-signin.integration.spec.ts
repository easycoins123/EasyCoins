import { PrismaClient } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { unauthorizedError } from '../../src/common/errors/api-error';
import { configureApp } from '../../src/main';
import { GoogleOAuthService, GoogleProfile } from '../../src/modules/customers/google-oauth.service';

/**
 * A Google that answers.
 *
 * The real service's authorization URL, state cookie, state comparison and
 * return-path handling are exercised as written; only the code exchange with
 * Google's token endpoint is replaced, because that is the one step that needs
 * Google. What it returns is decided per test.
 */
class StubGoogleOAuthService extends GoogleOAuthService {
  static profile: GoogleProfile | null = null;
  static failWith: string | null = null;

  override async exchangeCode(): Promise<GoogleProfile> {
    if (StubGoogleOAuthService.failWith) {
      throw unauthorizedError(StubGoogleOAuthService.failWith, 'GOOGLE_EXCHANGE_FAILED');
    }
    if (!StubGoogleOAuthService.profile) {
      throw new Error('test did not set a profile');
    }
    return StubGoogleOAuthService.profile;
  }
}

/**
 * Google sign-in, end to end, against a real database.
 *
 * The properties that matter: a first sign-in creates one customer and one
 * identity; a second sign-in with the same Google account lands in the same
 * customer even if the address changed; an address that already has a password
 * account is linked rather than duplicated; a cancelled or failed round trip
 * issues no session and creates nothing; and the session that is issued
 * behaves like every other session, including on sign-out.
 */
describe('Google sign-in', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();

  const APP_BASE_URL = 'http://localhost:4200';
  const email = () => `qa-google-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const subject = () => `sub-${Math.random().toString(36).slice(2, 12)}`;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.OTP_DEV_ECHO = 'true';
    process.env.HOUSEKEEPING_INTERVAL_SECONDS = '0';
    // Configured, so the flow is offered. The values never reach Google: the
    // exchange is stubbed above.
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret-not-real';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/v1/auth/google/callback';
    process.env.APP_BASE_URL = APP_BASE_URL;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleOAuthService)
      .useClass(StubGoogleOAuthService)
      .compile();

    app = await configureApp(moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true }));
    await app.init();
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.rateLimitCounter.deleteMany({});
    StubGoogleOAuthService.profile = null;
    StubGoogleOAuthService.failWith = null;
  });

  afterAll(async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    await app?.close();
    await prisma.$disconnect();
  });

  const cookiesOf = (response: request.Response): string[] =>
    (response.headers['set-cookie'] as unknown as string[]) ?? [];

  /** Live session cookies only: not the clearing of the one-time state cookie. */
  const sessionCookies = (response: request.Response): string[] =>
    cookiesOf(response).filter((cookie) => cookie.startsWith('tt_session=') && !cookie.includes('Expires=Thu, 01 Jan 1970'));

  /** Starts a flow and returns what the browser would carry back to us. */
  async function start(returnTo = '/account'): Promise<{ state: string; stateCookie: string; location: string }> {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/google')
      .query({ returnTo })
      .expect(302);

    const location = response.headers['location'] as string;
    const state = new URL(location).searchParams.get('state') ?? '';
    const stateCookie = cookiesOf(response)
      .find((cookie) => cookie.startsWith('tt_oauth_state='))
      ?.split(';')[0] ?? '';

    return { state, stateCookie, location };
  }

  /** Completes a flow as Google would, with the profile the stub returns. */
  async function complete(profile: GoogleProfile, returnTo = '/account') {
    StubGoogleOAuthService.profile = profile;
    const { state, stateCookie } = await start(returnTo);
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/google/callback')
      .set('Cookie', stateCookie)
      .query({ state, code: 'code-from-google' });
    const session = sessionCookies(response)[0]?.split(';')[0] ?? '';
    return { response, session };
  }

  // -------------------------------------------------------------------------
  describe('starting the flow', () => {
    it('is offered once credentials exist', async () => {
      const methods = await request(app.getHttpServer()).get('/api/v1/auth/methods').expect(200);
      expect(methods.body.google).toBe(true);
    });

    it('sends the customer to Google with our redirect and a state cookie', async () => {
      const { location, state, stateCookie } = await start('/store');
      const url = new URL(location);

      expect(url.origin).toBe('https://accounts.google.com');
      expect(url.searchParams.get('redirect_uri')).toBe(process.env.GOOGLE_REDIRECT_URI);
      expect(url.searchParams.get('scope')).toBe('openid email profile');
      expect(state.length).toBeGreaterThan(20);
      expect(stateCookie.startsWith('tt_oauth_state=')).toBe(true);
      // The cookie holds a hash, never the state itself.
      expect(stateCookie).not.toContain(state);
    });
  });

  // -------------------------------------------------------------------------
  describe('a new Google user', () => {
    it('creates one customer and one identity, issues a session and returns home', async () => {
      const address = email();
      const sub = subject();
      const before = await prisma.customer.count();

      const { response, session } = await complete(
        { subject: sub, email: address, emailVerified: true, name: 'דנה כהן' },
        '/store',
      );

      expect(response.status).toBe(302);
      expect(response.headers['location']).toBe(`${APP_BASE_URL}/store`);
      expect(session).not.toBe('');
      expect(await prisma.customer.count()).toBe(before + 1);

      const customer = await prisma.customer.findUnique({ where: { email: address } });
      expect(customer?.displayName).toBe('דנה כהן');
      expect(customer?.emailVerified).toBe(true);
      expect(customer?.passwordHash).toBeNull();

      const identity = await prisma.authIdentity.findUnique({
        where: { identity_provider_account: { provider: 'GOOGLE', providerAccountId: sub } },
      });
      expect(identity?.customerId).toBe(customer?.id);

      const me = await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', session).expect(200);
      expect(me.body.authenticated).toBe(true);
      expect(me.body.customer.email).toBe(address);
      // Nothing secret leaves the server.
      expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|tokenHash|providerAccountId/);
    });

    it('clears the one-time state cookie once it has been used', async () => {
      const { response } = await complete({ subject: subject(), email: email(), emailVerified: true });
      const cleared = cookiesOf(response).find((cookie) => cookie.startsWith('tt_oauth_state='));
      expect(cleared).toContain('Expires=Thu, 01 Jan 1970');
    });
  });

  // -------------------------------------------------------------------------
  describe('an existing Google user', () => {
    it('signs into the same customer, matched by Google id even when the address changed', async () => {
      const sub = subject();
      const first = await complete({ subject: sub, email: email(), emailVerified: true, name: 'First' });
      const me1 = await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', first.session).expect(200);

      const second = await complete({ subject: sub, email: email(), emailVerified: true, name: 'Renamed' });
      const me2 = await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', second.session).expect(200);

      expect(me2.body.customer.id).toBe(me1.body.customer.id);
      expect(await prisma.authIdentity.count({ where: { providerAccountId: sub } })).toBe(1);
    });

    it('issues a fresh session each time, so the earlier cookie keeps working only until sign-out', async () => {
      const sub = subject();
      const address = email();
      const first = await complete({ subject: sub, email: address, emailVerified: true });
      const second = await complete({ subject: sub, email: address, emailVerified: true });

      expect(first.session).not.toBe(second.session);

      await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', second.session).expect(204);
      const after = await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', second.session).expect(200);
      expect(after.body.authenticated).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('an address that already has a password account', () => {
    it('links Google to that account instead of creating a second one', async () => {
      const address = email();
      const registered = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: address, password: 'correct-horse-battery' })
        .expect(204);
      const passwordSession = sessionCookies(registered)[0].split(';')[0];
      const me1 = await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', passwordSession).expect(200);
      expect(me1.body.customer.emailVerified).toBe(false);

      const before = await prisma.customer.count();
      const { session } = await complete({ subject: subject(), email: address, emailVerified: true });
      const me2 = await request(app.getHttpServer()).get('/api/v1/me').set('Cookie', session).expect(200);

      expect(me2.body.customer.id).toBe(me1.body.customer.id);
      expect(me2.body.customer.emailVerified).toBe(true);
      expect(await prisma.customer.count()).toBe(before);
      expect(await prisma.authIdentity.count({ where: { customerId: me1.body.customer.id } })).toBe(1);

      // The password still works afterwards; Google was added, not substituted.
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: address, password: 'correct-horse-battery' })
        .expect(200);
    });
  });

  // -------------------------------------------------------------------------
  describe('when the round trip does not complete', () => {
    it('reports a cancellation as such, with no session and no account', async () => {
      const before = await prisma.customer.count();
      const { stateCookie, state } = await start();

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback')
        .set('Cookie', stateCookie)
        .query({ state, error: 'access_denied' });

      expect(response.status).toBe(302);
      expect(response.headers['location']).toBe(`${APP_BASE_URL}/account?auth=cancelled`);
      expect(sessionCookies(response)).toHaveLength(0);
      expect(await prisma.customer.count()).toBe(before);
    });

    it('reports any other Google error generically', async () => {
      const { stateCookie, state } = await start();
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback')
        .set('Cookie', stateCookie)
        .query({ state, error: 'server_error' });

      expect(response.headers['location']).toBe(`${APP_BASE_URL}/account?auth=failed`);
      expect(sessionCookies(response)).toHaveLength(0);
    });

    it('refuses a state that does not match the cookie', async () => {
      const first = await start();
      const second = await start();

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback')
        .set('Cookie', first.stateCookie)
        .query({ state: second.state, code: 'code' });

      expect(response.headers['location']).toBe(`${APP_BASE_URL}/account?auth=failed`);
      expect(sessionCookies(response)).toHaveLength(0);
    });

    it('refuses a callback with no state cookie at all, as an expired or replayed link would have', async () => {
      const { state } = await start();
      const before = await prisma.customer.count();

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback')
        .query({ state, code: 'code' });

      expect(response.headers['location']).toBe(`${APP_BASE_URL}/account?auth=failed`);
      expect(sessionCookies(response)).toHaveLength(0);
      expect(await prisma.customer.count()).toBe(before);
    });

    it('issues nothing when the exchange with Google fails', async () => {
      StubGoogleOAuthService.failWith = 'token endpoint said no';
      const { stateCookie, state } = await start();
      const before = await prisma.customer.count();

      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/google/callback')
        .set('Cookie', stateCookie)
        .query({ state, code: 'code' });

      expect(response.headers['location']).toBe(`${APP_BASE_URL}/account?auth=failed`);
      expect(sessionCookies(response)).toHaveLength(0);
      expect(await prisma.customer.count()).toBe(before);
    });

    it('never follows a return path off this site', async () => {
      const { response } = await complete(
        { subject: subject(), email: email(), emailVerified: true },
        'https://evil.example/phish',
      );
      expect(response.headers['location']).toBe(`${APP_BASE_URL}/account`);
    });
  });
});
