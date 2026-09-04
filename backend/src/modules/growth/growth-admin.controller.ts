import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { badRequestError } from '../../common/errors/api-error';
import { PrismaService } from '../../database/prisma.service';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { CampaignsService } from './campaigns.service';
import { CampaignDto, GrowthSettingDto, PublishReviewDto } from './dto/growth.dto';
import { isGrowthConfigKey } from './growth-config';
import { GrowthConfigService } from './growth-config.service';
import { ReviewsService } from './reviews.service';
import { TrustService } from './trust.service';

/**
 * The owner's side of the growth programmes.
 *
 * Every switch the storefront reads is set here: whether a programme is on,
 * what its rewards are worth, the founders cap, the trust thresholds, the
 * drops in the Drop Zone. Behind the same named-operator guard as the
 * fulfillment queue, and every change lands in the audit log with a name.
 */
@Controller('admin/growth')
@UseGuards(AdminAuthGuard)
export class GrowthAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: GrowthConfigService,
    private readonly campaigns: CampaignsService,
    private readonly trust: TrustService,
    private readonly reviews: ReviewsService,
  ) {}

  /** What is issued, held and spent: the numbers an owner asks for first. */
  @Get('overview')
  async overview() {
    const [drops, rewards, founders, referrals, campaigns] = await Promise.all([
      this.prisma.easyDrop.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.customerReward.groupBy({ by: ['status', 'kind'], _count: { _all: true }, _sum: { value: true } }),
      this.prisma.founderSeat.count(),
      this.prisma.referralAttribution.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.campaign.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      easyDrops: drops.map((row) => ({ status: row.status, count: row._count._all })),
      rewards: rewards.map((row) => ({ status: row.status, kind: row.kind, count: row._count._all, valueSum: row._sum.value ?? 0 })),
      foundersSeated: founders,
      referrals: referrals.map((row) => ({ status: row.status, count: row._count._all })),
      campaigns: campaigns.map((row) => ({ status: row.status, count: row._count._all })),
    };
  }

  @Get('settings')
  settings() {
    return this.config.list();
  }

  @Put('settings/:key')
  @HttpCode(200)
  async putSetting(@Param('key') key: string, @Body() body: GrowthSettingDto, @Req() request: Request) {
    if (!isGrowthConfigKey(key)) {
      throw badRequestError(`Unknown growth setting ${key}`, 'GROWTH_SETTING_UNKNOWN');
    }
    const value = await this.config.set(key, body.value, operatorOf(request));
    return { key, value, source: 'override' };
  }

  @Delete('settings/:key')
  @HttpCode(204)
  async resetSetting(@Param('key') key: string, @Req() request: Request): Promise<void> {
    if (!isGrowthConfigKey(key)) {
      throw badRequestError(`Unknown growth setting ${key}`, 'GROWTH_SETTING_UNKNOWN');
    }
    await this.config.reset(key, operatorOf(request));
  }

  @Get('campaigns')
  listCampaigns() {
    return this.campaigns.adminList();
  }

  @Post('campaigns')
  createCampaign(@Body() body: CampaignDto, @Req() request: Request) {
    return this.campaigns.create(body, operatorOf(request));
  }

  @Patch('campaigns/:id')
  updateCampaign(@Param('id') id: string, @Body() body: CampaignDto, @Req() request: Request) {
    return this.campaigns.update(id, body, operatorOf(request));
  }

  /** The raw figures behind the public snapshot, thresholds beside them. */
  @Get('trust')
  async trustRaw() {
    const [raw, growth] = await Promise.all([this.trust.raw(), this.config.get()]);
    return { raw, thresholds: growth.trust.thresholds, enabled: growth.trust.enabled };
  }

  @Get('reviews')
  listReviews(@Query('published') published?: string) {
    return this.reviews.adminList(published === undefined ? undefined : published === 'true');
  }

  @Post('reviews/:id/publish')
  @HttpCode(204)
  async publishReview(@Param('id') id: string, @Body() body: PublishReviewDto, @Req() request: Request): Promise<void> {
    await this.reviews.setPublished(id, body.published ?? true, operatorOf(request));
  }
}

function operatorOf(request: Request): string {
  if (!request.operator) {
    throw new Error('admin route reached without an authenticated operator');
  }
  return request.operator.name;
}
