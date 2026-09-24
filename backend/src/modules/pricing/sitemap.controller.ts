import { Controller, Get, Header, Inject } from '@nestjs/common';

import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/environment';
import { LadderService } from './ladder.service';
import { buildSitemapXml } from './sitemap';

/**
 * `/api/v1/sitemap.xml`, which the storefront host serves as `/sitemap.xml`.
 *
 * Generated on request from the edition state, so the day the owner
 * activates FC27 the FC27 product URL appears and the retired FC26 one goes,
 * without a deploy. Public, read-only, cached for an hour at the edge.
 */
@Controller('sitemap.xml')
export class SitemapController {
  constructor(
    private readonly ladder: LadderService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=3600')
  async sitemap(): Promise<string> {
    return buildSitemapXml(this.config.appBaseUrl, await this.ladder.storefront());
  }
}
