import { Controller, Get, Header, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';

import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/environment';
import { LadderService } from './ladder.service';
import { buildSitemapXml } from './sitemap';

/**
 * `/api/v1/sitemap.xml`, which the storefront host serves as `/sitemap.xml`.
 *
 * Generated on request from the edition state, so the day the owner
 * activates FC27 the FC27 product URL appears and the retired FC26 one goes,
 * without a deploy. Public, read-only, cached briefly at the edge.
 *
 * The base URL is the request's own forwarded host, not the configured
 * `APP_BASE_URL` alone: the storefront proxies this path from its own domain
 * (root `vercel.json`), so the value that reaches search engines should be
 * whatever host the visitor actually used, never a value someone mistyped or
 * forgot to set in the API project's settings. `X-Forwarded-Host` is trusted
 * only when it is the production domain or a Vercel deployment host — a
 * fixed, code-defined allowlist, not attacker-controllable — so a spoofed
 * header cannot poison the edge cache with an arbitrary host; anything else
 * falls back to the configured `APP_BASE_URL`.
 */
const TRUSTED_HOST_SUFFIXES = ['easycoins.co.il', '.vercel.app'];

@Controller('sitemap.xml')
export class SitemapController {
  constructor(
    private readonly ladder: LadderService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=120, s-maxage=300')
  async sitemap(@Req() request: Request): Promise<string> {
    return buildSitemapXml(this.baseUrl(request), await this.ladder.storefront());
  }

  private baseUrl(request: Request): string {
    const forwardedHost = firstValue(request.headers['x-forwarded-host']);
    const forwardedProto = firstValue(request.headers['x-forwarded-proto']) ?? 'https';
    if (!forwardedHost || !isTrustedHost(forwardedHost)) {
      return this.config.appBaseUrl;
    }
    return `${forwardedProto}://${forwardedHost}`;
  }
}

/** A forwarded header can arrive as "host1, host2" (one hop per proxy); only the request's own edge matters. */
function firstValue(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(',')[0]?.trim() || undefined;
}

function isTrustedHost(host: string): boolean {
  const bare = host.split(':')[0].toLowerCase();
  return TRUSTED_HOST_SUFFIXES.some((suffix) => {
    const apex = suffix.replace(/^\./, '');
    // A subdomain match requires the boundary dot, so "evileasycoins.co.il"
    // (no dot before the suffix) is correctly rejected; only "*.easycoins.co.il" is accepted.
    return bare === apex || bare.endsWith(`.${apex}`);
  });
}
