import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { SessionService } from '../customers/session.service';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutSessionDto, SubmitCheckoutDetailsDto } from './dto/checkout.dto';
import { toCheckoutSessionDto, toCheckoutSubmitDto } from './dto/checkout.mapper';

/**
 * Checkout.
 *
 * Unlike the catalog, these endpoints do consult the session: a checkout belongs
 * to whoever opened it, and only they may read or complete it.
 */
@Controller()
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Opens a checkout for the current cart.
   *
   * This is the first point in the journey that needs an owner, so it is where
   * an anonymous session is created if the visitor does not already have one.
   * Browsing and adding to a cart still write nothing.
   */
  @Post('checkout/sessions')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Body() body: CreateCheckoutSessionDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.sessions.ensure(request, response);
    const checkout = await this.checkout.createSession(body.items, {
      session,
      couponCode: body.couponCode,
      rewardId: body.rewardId,
    });
    return toCheckoutSessionDto(checkout);
  }

  /** A checkout the caller owns. Someone else's is a not-found. */
  @Get('checkout/sessions/:id')
  async getSession(@Param('id') id: string, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    const checkout = await this.checkout.requireOwned(id, session);
    return toCheckoutSessionDto(checkout);
  }

  /**
   * Submits contact and fulfillment details.
   *
   * Field errors come back as issues rather than as a failed request, because a
   * half-filled form is a normal state for a customer to be in and the UI needs
   * to show them what to fix.
   */
  @Post('checkout/sessions/:id/validate')
  @HttpCode(HttpStatus.OK)
  async submitDetails(
    @Param('id') id: string,
    @Body() body: SubmitCheckoutDetailsDto,
    @Req() request: Request,
  ) {
    const session = await this.sessions.resolve(request);
    const owned = await this.checkout.requireOwned(id, session);
    const { checkout, issues } = await this.checkout.submitDetails(owned, body.values ?? {});
    return toCheckoutSubmitDto(checkout, issues);
  }
}
