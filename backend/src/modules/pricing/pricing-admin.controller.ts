import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { badRequestError } from '../../common/errors/api-error';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { CreatorCodesService } from './creator-codes.service';
import { ActivateLadderDto, CreatorCodeDto, PricingSettingDto, UpdateCreatorCodeDto } from './dto/pricing.dto';
import { LadderService } from './ladder.service';
import { isPricingConfigKey } from './pricing-config';
import { PricingConfigService } from './pricing-config.service';

/**
 * The owner's price controls.
 *
 * Everything a price decision needs is read and written here, behind the
 * same named-operator guard as fulfillment, with an audit row per change:
 * the economics (supplier cost, fees, margin floor), the FC27 ladder as a
 * draft, its evaluation against the economics, activation, the launch
 * offer, creator codes and the competitor snapshot. No deploy is needed to
 * move a price.
 */
@Controller('admin/pricing')
@UseGuards(AdminAuthGuard)
export class PricingAdminController {
  constructor(
    private readonly config: PricingConfigService,
    private readonly ladder: LadderService,
    private readonly codes: CreatorCodesService,
  ) {}

  @Get('settings')
  settings() {
    return this.config.list();
  }

  @Put('settings/:key')
  @HttpCode(200)
  async putSetting(@Param('key') key: string, @Body() body: PricingSettingDto, @Req() request: Request) {
    if (!isPricingConfigKey(key)) {
      throw badRequestError(`Unknown pricing setting ${key}`, 'PRICING_SETTING_UNKNOWN');
    }
    const value = await this.config.set(key, body.value, operatorOf(request));
    return { key, value, source: 'override' };
  }

  @Delete('settings/:key')
  @HttpCode(204)
  async resetSetting(@Param('key') key: string, @Req() request: Request): Promise<void> {
    if (!isPricingConfigKey(key)) {
      throw badRequestError(`Unknown pricing setting ${key}`, 'PRICING_SETTING_UNKNOWN');
    }
    await this.config.reset(key, operatorOf(request));
  }

  /** The ladder against the economics: per-package rate, cost, contribution, margin, gate. */
  @Get('evaluation')
  evaluation(@Query('platformId') platformId?: string) {
    return this.ladder.evaluation(platformId || undefined);
  }

  @Get('storefront')
  storefront() {
    return this.ladder.storefront();
  }

  @Get('ladder/preview')
  preview() {
    return this.ladder.preview();
  }

  @Post('ladder/activate')
  @HttpCode(200)
  activate(@Body() body: ActivateLadderDto, @Req() request: Request) {
    return this.ladder.activate(operatorOf(request), body.acknowledgeUnknownCost === true);
  }

  @Post('ladder/republish')
  @HttpCode(200)
  republish(@Req() request: Request) {
    return this.ladder.republish(operatorOf(request));
  }

  @Post('ladder/deactivate')
  @HttpCode(200)
  deactivate(@Req() request: Request) {
    return this.ladder.deactivate(operatorOf(request));
  }

  @Get('codes')
  listCodes() {
    return this.codes.list();
  }

  @Post('codes')
  createCode(@Body() body: CreatorCodeDto, @Req() request: Request) {
    return this.codes.create(body, operatorOf(request));
  }

  @Patch('codes/:code')
  updateCode(@Param('code') code: string, @Body() body: UpdateCreatorCodeDto, @Req() request: Request) {
    return this.codes.update(code, body, operatorOf(request));
  }

  @Get('codes/:code/attribution')
  attribution(@Param('code') code: string) {
    return this.codes.attribution(code);
  }
}

function operatorOf(request: Request): string {
  if (!request.operator) {
    throw new Error('admin route reached without an authenticated operator');
  }
  return request.operator.name;
}
