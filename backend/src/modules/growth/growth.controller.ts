import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { unauthorizedError } from '../../common/errors/api-error';
import { SessionService } from '../customers/session.service';
import { CampaignsService } from './campaigns.service';
import { CustomCoinsService } from './custom-coins.service';
import { AttachReferralDto, CreateReviewDto, CustomQuoteDto, RevealEasyDropDto } from './dto/growth.dto';
import { EasyClubService } from './easyclub.service';
import { EasyDropService } from './easydrop.service';
import { GrowthConfigService } from './growth-config.service';
import { ownerOfSession } from './growth-shared';
import { ReferralService } from './referral.service';
import { ReviewsService } from './reviews.service';
import { RewardsService } from './rewards.service';
import { TrustService } from './trust.service';

/**
 * The customer-facing growth API.
 *
 * Public reads carry no personal data: the founders counter, the drop zone,
 * the trust snapshot, the custom-coin rules. Everything about a person is
 * behind their session, resolved the same way orders are: a signed-in
 * customer sees their account, a guest session sees what it earned, and
 * nobody sees anyone else's, because every query is scoped by owner.
 */
@Controller()
export class GrowthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly config: GrowthConfigService,
    private readonly club: EasyClubService,
    private readonly rewards: RewardsService,
    private readonly easyDrop: EasyDropService,
    private readonly referral: ReferralService,
    private readonly campaigns: CampaignsService,
    private readonly trust: TrustService,
    private readonly customCoins: CustomCoinsService,
    private readonly reviews: ReviewsService,
  ) {}

  // --- public ------------------------------------------------------------

  @Get('growth/founders')
  founders() {
    return this.club.foundersStatus();
  }

  /**
   * Which programmes are on and how they are shaped.
   *
   * Configuration the storefront needs for copy and layout: the EasyDrop
   * tiers, the club tiers, the streak steps, whether referral is open, the
   * custom-coin rules. Reward values are named where the customer will be
   * told them anyway; nothing here is a secret and nothing here is a claim.
   */
  @Get('growth/programmes')
  async programmes() {
    const [growth, founders] = await Promise.all([this.config.get(), this.club.foundersStatus()]);
    return {
      easydrop: {
        enabled: growth.easydrop.enabled,
        cardsPerDrop: growth.easydrop.cardsPerDrop,
        expiresInDays: growth.easydrop.expiresInDays,
        tiers: growth.easydrop.pools.map((pool) => ({ tier: pool.tier, name: pool.name, minTotalMinor: pool.minTotalMinor })),
      },
      easyclub: { pointsPerShekel: growth.easyclub.pointsPerShekel, tiers: growth.easyclub.tiers },
      founders,
      streak: {
        enabled: growth.streak.enabled,
        windowDays: growth.streak.windowDays,
        rewards: growth.streak.rewards.map((step) => ({ purchase: step.purchase, title: step.reward.title })),
      },
      referral: {
        enabled: growth.referral.enabled,
        friendReward: growth.referral.friendReward.title,
        referrerReward: growth.referral.referrerReward.title,
      },
      customCoins: await this.customCoins.rules(),
      easyback: { enabled: growth.easyback.enabled },
    };
  }

  @Get('growth/campaigns')
  dropZone() {
    return this.campaigns.publicList();
  }

  @Get('growth/trust')
  trustSnapshot() {
    return this.trust.snapshot();
  }

  @Get('coins/custom/rules')
  customRules() {
    return this.customCoins.rules();
  }

  /**
   * Prices a custom amount, or the most coins a budget buys.
   *
   * The answer includes an offer id the cart can add like any other. The
   * price on that offer was written by this server; the request carried none.
   */
  @Post('coins/custom/quote')
  @HttpCode(HttpStatus.OK)
  customQuote(@Body() body: CustomQuoteDto) {
    return this.customCoins.quote({
      mode: body.mode,
      amount: body.amount,
      budgetMinor: body.budgetMinor,
      platformId: body.platformId,
      regionId: body.regionId,
    });
  }

  // --- account -----------------------------------------------------------

  /** EASYCLUB, for a signed-in customer. */
  @Get('account/club')
  async clubSummary(@Req() request: Request) {
    const session = await this.sessions.resolve(request);
    if (!session?.customerId) {
      throw unauthorizedError('Sign in to see your EASYCLUB', 'UNAUTHENTICATED');
    }
    return this.club.summary(session.customerId);
  }

  /** What the caller holds. A guest sees what their session earned; nobody sees nothing but an empty list. */
  @Get('account/rewards')
  async rewardsList(@Req() request: Request) {
    const session = await this.sessions.resolve(request);
    return this.rewards.listForOwner(ownerOfSession(session));
  }

  @Get('account/referral')
  async referralSummary(@Req() request: Request) {
    const session = await this.sessions.resolve(request);
    if (!session?.customerId) {
      throw unauthorizedError('Sign in to get your referral link', 'UNAUTHENTICATED');
    }
    return this.referral.summary(session.customerId);
  }

  /**
   * Records that this visitor came through a friend's link.
   *
   * Creates an anonymous session if there is none, because the attribution
   * has to belong to something that will later place the order.
   */
  @Post('referral/attach')
  @HttpCode(HttpStatus.OK)
  async attachReferral(
    @Body() body: AttachReferralDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.sessions.ensure(request, response);
    return this.referral.attach(body.code, session, request.ip ?? null);
  }

  // --- EasyDrop ----------------------------------------------------------

  /** The drop for an order the caller owns; `drop` is null when the order has none. */
  @Get('orders/:orderId/easydrop')
  async easyDropFor(@Param('orderId') orderId: string, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    return { drop: await this.easyDrop.forOrder(orderId, session) };
  }

  /** Opens one card. Repeating it returns the card already opened. */
  @Post('orders/:orderId/easydrop/reveal')
  @HttpCode(HttpStatus.OK)
  async revealEasyDrop(
    @Param('orderId') orderId: string,
    @Body() body: RevealEasyDropDto,
    @Req() request: Request,
  ) {
    const session = await this.sessions.resolve(request);
    return { drop: await this.easyDrop.reveal(orderId, body.index, session) };
  }

  // --- reviews -----------------------------------------------------------

  /** A verified-purchase review, against a delivered order the caller owns. */
  @Post('account/reviews')
  @HttpCode(HttpStatus.CREATED)
  async createReview(@Body() body: CreateReviewDto, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    return this.reviews.submit(session, { orderId: body.orderId, rating: body.rating, title: body.title, body: body.body });
  }
}
