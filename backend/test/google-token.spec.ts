import { generateKeyPairSync, sign as signBytes } from 'node:crypto';

import { AppLogger } from '../src/common/logging/app-logger.service';
import type { AppConfig } from '../src/config/environment';
import { GoogleOAuthService } from '../src/modules/customers/google-oauth.service';

/**
 * Verifying Google's identity token, without Google.
 *
 * A key pair is generated for the test, its public half is served as the JWKS
 * through a stubbed `fetch`, and tokens are signed with the private half. Every
 * check the service performs is then exercised against a token that fails
 * exactly that check and no other, so a regression in one of them cannot hide
 * behind another.
 */
describe('Google identity token verification', () => {
  const CLIENT_ID = 'test-client.apps.googleusercontent.com';
  const KID = 'test-key-1';

  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as JsonWebKey), kid: KID, alg: 'RS256', use: 'sig' };

  const originalFetch = global.fetch;
  let service: GoogleOAuthService;

  const encode = (value: object | Buffer): string =>
    (Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).toString('base64url');

  function token(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', kid: KID, typ: 'JWT' }): string {
    const body = `${encode(header)}.${encode(claims)}`;
    const signature = signBytes('sha256', Buffer.from(body), privateKey);
    return `${body}.${encode(signature)}`;
  }

  const validClaims = () => ({
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: '1234567890',
    email: 'Person@Example.com',
    email_verified: true,
    name: 'Test Person',
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
  });

  beforeAll(() => {
    global.fetch = (async () => ({
      ok: true,
      json: async () => ({ keys: [jwk] }),
    })) as unknown as typeof fetch;

    const config = {
      googleClientId: CLIENT_ID,
      googleClientSecret: 'not-used-here',
      googleRedirectUri: 'http://localhost:3000/api/v1/auth/google/callback',
    } as AppConfig;
    const logger = { info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as AppLogger;
    service = new GoogleOAuthService(logger, config);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('accepts a well-formed token and normalises the address', async () => {
    const profile = await service.verifyIdToken(token(validClaims()));
    expect(profile).toEqual({
      subject: '1234567890',
      email: 'person@example.com',
      emailVerified: true,
      name: 'Test Person',
    });
  });

  it('accepts the bare issuer Google also uses', async () => {
    const profile = await service.verifyIdToken(token({ ...validClaims(), iss: 'accounts.google.com' }));
    expect(profile.subject).toBe('1234567890');
  });

  it('refuses an expired token', async () => {
    await expect(service.verifyIdToken(token({ ...validClaims(), exp: Math.floor(Date.now() / 1000) - 5 })))
      .rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
  });

  it('refuses a token minted for another application', async () => {
    await expect(service.verifyIdToken(token({ ...validClaims(), aud: 'someone-else' })))
      .rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
  });

  it('refuses a token from another issuer', async () => {
    await expect(service.verifyIdToken(token({ ...validClaims(), iss: 'https://evil.example' })))
      .rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
  });

  it('refuses an address Google has not verified', async () => {
    await expect(service.verifyIdToken(token({ ...validClaims(), email_verified: false })))
      .rejects.toMatchObject({ code: 'GOOGLE_EMAIL_UNVERIFIED' });
  });

  it('refuses a tampered payload', async () => {
    const good = token(validClaims());
    const [header, , signature] = good.split('.');
    const tampered = `${header}.${encode({ ...validClaims(), email: 'attacker@example.com' })}.${signature}`;
    await expect(service.verifyIdToken(tampered)).rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
  });

  it('refuses an algorithm other than RS256, so "none" cannot bypass the signature', async () => {
    const unsigned = `${encode({ alg: 'none', kid: KID })}.${encode(validClaims())}.`;
    await expect(service.verifyIdToken(unsigned)).rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
  });

  it('refuses a token signed with a key Google does not publish', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const body = `${encode({ alg: 'RS256', kid: KID })}.${encode(validClaims())}`;
    const forged = `${body}.${encode(signBytes('sha256', Buffer.from(body), other.privateKey))}`;
    await expect(service.verifyIdToken(forged)).rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
  });

  it('refuses garbage', async () => {
    await expect(service.verifyIdToken('not.a.token.at.all')).rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
    await expect(service.verifyIdToken('')).rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
  });
});
