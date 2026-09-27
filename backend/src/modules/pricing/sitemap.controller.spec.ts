import type { Request } from 'express';

import { SitemapController } from './sitemap.controller';
import { LadderService } from './ladder.service';
import { AppConfig } from '../../config/environment';

/**
 * The sitemap must never publish a placeholder or misconfigured host.
 *
 * This exists because of a real defect: the API project's `APP_BASE_URL`
 * was left at a placeholder value in production, so every sitemap URL read
 * `https://example.com/...`. The fix trusts the request's own forwarded
 * host once it is provably the production domain or a Vercel deployment,
 * and otherwise falls back to the configured value rather than guessing.
 */
describe('SitemapController', () => {
  const ladder = { storefront: jest.fn().mockResolvedValue({ editions: [] }) } as unknown as LadderService;
  const config = { appBaseUrl: 'https://example.com' } as AppConfig;

  function requestWith(headers: Record<string, string | string[] | undefined>): Request {
    return { headers } as unknown as Request;
  }

  it('uses the forwarded production host, not the misconfigured APP_BASE_URL', async () => {
    const controller = new SitemapController(ladder, config);
    const xml = await controller.sitemap(requestWith({ 'x-forwarded-host': 'www.easycoins.co.il', 'x-forwarded-proto': 'https' }));
    expect(xml).toContain('https://www.easycoins.co.il/');
    expect(xml).not.toContain('example.com');
  });

  it('accepts the apex domain and a Vercel deployment host', async () => {
    const controller = new SitemapController(ladder, config);
    expect(await controller.sitemap(requestWith({ 'x-forwarded-host': 'easycoins.co.il' }))).toContain('https://easycoins.co.il/');
    expect(await controller.sitemap(requestWith({ 'x-forwarded-host': 'easy-coins-web.vercel.app' }))).toContain('https://easy-coins-web.vercel.app/');
  });

  it('falls back to the configured value when the header is absent', async () => {
    const controller = new SitemapController(ladder, config);
    const xml = await controller.sitemap(requestWith({}));
    expect(xml).toContain('https://example.com/');
  });

  it('refuses a spoofed host outside the trusted domains, and does not cache-poison with it', async () => {
    const controller = new SitemapController(ladder, config);
    const xml = await controller.sitemap(requestWith({ 'x-forwarded-host': 'evil.example.net' }));
    expect(xml).not.toContain('evil.example.net');
    expect(xml).toContain('https://example.com/');
  });

  it('refuses a host that merely contains the trusted suffix as a substring, not a real subdomain', async () => {
    const controller = new SitemapController(ladder, config);
    const xml = await controller.sitemap(requestWith({ 'x-forwarded-host': 'easycoins.co.il.evil.net' }));
    expect(xml).not.toContain('easycoins.co.il.evil.net');
    expect(xml).toContain('https://example.com/');
  });

  it('takes only the first hop of a multi-value forwarded header', async () => {
    const controller = new SitemapController(ladder, config);
    const xml = await controller.sitemap(requestWith({ 'x-forwarded-host': 'www.easycoins.co.il, evil.example.net' }));
    expect(xml).toContain('https://www.easycoins.co.il/');
  });

  it('refuses a suffix-concatenation bypass with no boundary dot', async () => {
    const controller = new SitemapController(ladder, config);
    const xml = await controller.sitemap(requestWith({ 'x-forwarded-host': 'evileasycoins.co.il' }));
    expect(xml).not.toContain('evileasycoins.co.il');
    expect(xml).toContain('https://example.com/');
  });
});
