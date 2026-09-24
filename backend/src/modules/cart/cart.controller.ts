import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { SessionService } from '../customers/session.service';
import { ownerOfSession } from '../growth/growth-shared';
import { AddCartItemDto, CartRequestDto, ValidateCouponDto } from './dto/cart.dto';
import { toCartItemDto, toCartValidationDto } from './dto/cart.mapper';
import { PricingService } from './pricing.service';

/**
 * The cart.
 *
 * The cart itself lives in the browser as a list of offer ids and quantities,
 * which is what lets it survive a reload without a round trip and without an
 * account. Nothing financial is stored there: every price on screen came from
 * one of these endpoints, and is recomputed by them before anything is charged.
 *
 * There is no cart resource to address, so there is no cart to read out of
 * someone else's session. The absence is the security property.
 *
 * The session is consulted for one thing only: which earned rewards the
 * caller owns, so a reward id in the request is priced only if it is theirs.
 * Browsing and adding to a cart still write nothing.
 */
@Controller()
export class CartController {
  constructor(
    private readonly pricing: PricingService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Prices one line for the cart.
   *
   * Returns 201 with the priced line, or a business error the customer can act
   * on: sold out, quantity too high, no longer sold.
   */
  @Post('cart/items')
  @HttpCode(HttpStatus.CREATED)
  async addItem(@Body() body: AddCartItemDto) {
    const line = await this.pricing.priceLine({
      offerId: body.offerId,
      quantity: body.quantity,
    });
    return toCartItemDto(line);
  }

  /**
   * Re-prices the whole cart against current catalog state.
   *
   * Called before checkout and whenever the cart is restored from storage, so a
   * price change, a sold-out item or a withdrawn product is caught before the
   * customer reaches payment rather than after. The answer also carries the
   * stacking decision: which benefit is on the order and which was set aside.
   */
  @Post('cart/validate')
  @HttpCode(HttpStatus.OK)
  async validate(@Body() body: CartRequestDto, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    const cart = await this.pricing.priceCart(body.items, {
      couponCode: body.couponCode,
      rewardId: body.rewardId,
      owner: ownerOfSession(session),
    });
    return toCartValidationDto(cart, body.couponCode ?? null);
  }

  /**
   * Checks a coupon against a cart.
   *
   * The discount is resolved from the promotion row, never from the request, so
   * an unknown or expired code is simply worth nothing. A code the stacking
   * policy sets aside is reported with the policy's reason.
   */
  @Post('promotions/validate')
  @HttpCode(HttpStatus.OK)
  async validateCoupon(@Body() body: ValidateCouponDto, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    const cart = await this.pricing.priceCart(body.items, {
      couponCode: body.code,
      rewardId: body.rewardId,
      owner: ownerOfSession(session),
    });
    const coupon = cart.benefits.applied.find((benefit) => benefit.kind === 'COUPON');
    const refused = cart.benefits.rejected.find((benefit) => benefit.kind === 'COUPON');
    const applied = coupon !== undefined && (coupon.effect.discountMinor ?? 0) > 0;

    return {
      applied,
      code: body.code,
      discount: { amountMinor: applied ? coupon.effect.discountMinor ?? 0 : 0, currency: cart.currency },
      message: applied
        ? {
            he: 'הקוד הופעל על העגלה.',
            en: 'The code was applied to your cart.',
          }
        : refused?.reason ?? {
            he: 'הקוד אינו תקף.',
            en: 'That code is not valid.',
          },
    };
  }
}
