import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { unauthorizedError } from '../../common/errors/api-error';
import { APP_CONFIG } from '../../config/config.module';
import { AppConfig } from '../../config/environment';
import { PrismaService } from '../../database/prisma.service';
import { OrderAccessService } from '../orders/order-access.service';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import {
  ChangePasswordDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto,
} from './dto/account.dto';
import { SessionService } from './session.service';
import { RequestCodeDto, UpdateProfileDto, VerifyCodeDto } from './dto/auth.dto';
import { MeResponse, toCustomerResponse, toMeResponse } from './dto/customer.mapper';

/**
 * Sign-in, sign-out and the current customer.
 *
 * Every response here is deliberately uninformative about whether an address
 * exists. See `AuthService` for why that is structural rather than a branch.
 */
@Controller()
export class CustomersController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly orderAccess: OrderAccessService,
    private readonly accounts: AccountService,
    private readonly google: GoogleOAuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Which sign-in methods this deployment can actually offer.
   *
   * The storefront asks before rendering the sign-in screen, so a Google button
   * only appears where Google is configured. Showing a button that returns 503
   * is worse than not showing it.
   */
  @Get('auth/methods')
  authMethods() {
    // Anything that has to reach an inbox is only offered when a transport
    // exists. Production runs without one today, and a "forgot password" that
    // promises a link nobody sends is worse than no link.
    const mail = this.config.notificationTransport !== 'none';
    return {
      password: true,
      google: this.google.isConfigured,
      emailCode: mail,
      passwordReset: mail,
    };
  }

  /**
   * Registers with an email and password.
   *
   * Always 204, and a session is issued only when an account was actually
   * created. An address that already exists produces the same response, so the
   * endpoint cannot be used to discover who has an account here.
   */
  @Post('auth/register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async register(
    @Body() body: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const customer = await this.accounts.register(
      body.email,
      body.password,
      request.ip ?? null,
      body.displayName,
    );

    if (customer) {
      await this.orderAccess.claimSessionOrders(
        (await this.sessions.resolve(request))?.id ?? '',
        customer.id,
      );
      await this.sessions.attachToCustomer(request, response, customer.id);
    }
  }

  /** Signs in with a password. */
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    const customer = await this.accounts.signInWithPassword(
      body.email,
      body.password,
      request.ip ?? null,
    );

    const previous = await this.sessions.resolve(request);
    if (previous) {
      await this.orderAccess.claimSessionOrders(previous.id, customer.id);
    }
    await this.sessions.attachToCustomer(request, response, customer.id);

    return toMeResponse(customer);
  }

  /** Starts a password reset. Always 204, whatever the address. */
  @Post('auth/password/forgot')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const result = await this.accounts.requestPasswordReset(
      body.email,
      request.ip ?? null,
      this.config.otpDevEcho,
    );

    if (result.devToken) {
      // A header rather than a body, because a 204 has no body. Local only.
      response.setHeader('X-Dev-Reset-Token', result.devToken);
    }
  }

  /** Completes a reset and signs the customer in on a fresh session. */
  @Post('auth/password/reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    const customer = await this.accounts.resetPassword(body.token, body.password);
    await this.sessions.attachToCustomer(request, response, customer.id);
    return toMeResponse(customer);
  }

  /** Changes the password of the signed-in customer. */
  @Post('auth/password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() request: Request,
  ): Promise<void> {
    const session = await this.sessions.resolve(request);
    if (!session?.customerId) {
      throw unauthorizedError('Sign in to change your password', 'UNAUTHENTICATED');
    }
    await this.accounts.changePassword(session.customerId, body.currentPassword, body.newPassword);
  }

  /** Sends the customer to Google, remembering where to return them. */
  @Get('auth/google')
  async googleStart(
    @Res() response: Response,
    @Query('returnTo') returnTo?: string,
  ): Promise<void> {
    const { url, state } = this.google.buildAuthorizationUrl(returnTo ?? '/account');

    // Only the hash is stored, so the cookie cannot be replayed into a
    // different flow. httpOnly and short-lived, like every cookie we set.
    response.cookie('tt_oauth_state', this.google.hashState(state), {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000,
    });

    response.redirect(url);
  }

  /**
   * Handles the return from Google.
   *
   * The state is checked before the code is exchanged: without that, an
   * attacker could start a flow and have the result land in someone else's
   * browser.
   */
  @Get('auth/google/callback')
  async googleCallback(
    @Req() request: Request,
    @Res() response: Response,
    @Query('state') state?: string,
    @Query('code') code?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    const clearState = () => response.clearCookie('tt_oauth_state', { path: '/' });

    if (error || !state || !code) {
      clearState();
      // A customer who pressed "cancel" at Google is told that, not that
      // something failed; every other reason stays deliberately generic.
      const outcome = error === 'access_denied' ? 'cancelled' : 'failed';
      response.redirect(`${this.config.appBaseUrl}/account?auth=${outcome}`);
      return;
    }

    if (!this.google.stateMatches(state, request.cookies?.['tt_oauth_state'])) {
      clearState();
      response.redirect(`${this.config.appBaseUrl}/account?auth=failed`);
      return;
    }

    try {
      const profile = await this.google.exchangeCode(code);
      const customer = await this.accounts.signInWithGoogle(profile);

      const previous = await this.sessions.resolve(request);
      if (previous) {
        await this.orderAccess.claimSessionOrders(previous.id, customer.id);
      }
      await this.sessions.attachToCustomer(request, response, customer.id);

      clearState();
      response.redirect(`${this.config.appBaseUrl}${this.google.returnPathFrom(state)}`);
    } catch {
      // The reason goes to the log inside the service; the customer gets a
      // generic failure so a probe learns nothing from the redirect.
      clearState();
      response.redirect(`${this.config.appBaseUrl}/account?auth=failed`);
    }
  }

  /** Records a deletion request and closes every session. */
  @Post('account/delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestDeletion(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const session = await this.sessions.resolve(request);
    if (!session?.customerId) {
      throw unauthorizedError('Sign in first', 'UNAUTHENTICATED');
    }
    await this.accounts.requestDeletion(session.customerId);
    await this.sessions.signOut(request, response);
  }

  /**
   * Requests a sign-in code.
   *
   * Always 204, whether the address is known, unknown or malformed past basic
   * shape validation. The response body carries the code only when the
   * development echo is enabled, which configuration validation refuses outside
   * local development.
   */
  @Post('auth/request-code')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestCode(
    @Body() body: RequestCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const result = await this.auth.requestCode(body.email, request.ip ?? null);

    if (result.devCode) {
      // A header rather than a body, because a 204 has no body. Present only in
      // local development.
      response.setHeader('X-Dev-Otp', result.devCode);
    }
  }

  /**
   * Verifies a code and starts an authenticated session.
   *
   * The session is rotated here: any pre-authentication token is revoked and a
   * new one issued, which is what prevents session fixation.
   *
   * Orders the visitor placed as a guest are transferred to the customer before
   * the rotation. Without that step the rotation itself would strand them: the
   * order is owned by a session that sign-in has just revoked, and nobody could
   * ever read it again.
   */
  @Post('auth/verify-code')
  @HttpCode(HttpStatus.OK)
  async verifyCode(
    @Body() body: VerifyCodeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    const customer = await this.auth.verifyCode(body.email, body.code, request.ip ?? null);

    const previous = await this.sessions.resolve(request);
    if (previous) {
      await this.orderAccess.claimSessionOrders(previous.id, customer.id);
    }

    await this.sessions.attachToCustomer(request, response, customer.id);
    return toMeResponse(customer);
  }

  /** Revokes the session server-side and clears the cookie. */
  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.signOut(request, response);
  }

  /** Who the caller is. Anonymous is a normal answer, not an error. */
  @Get('me')
  async me(@Req() request: Request): Promise<MeResponse> {
    const session = await this.sessions.resolve(request);
    if (!session?.customerId) {
      return toMeResponse(null);
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: session.customerId },
    });
    return toMeResponse(customer);
  }

  /**
   * Updates the caller's own profile.
   *
   * Email is deliberately absent: changing it would move the identity the
   * sign-in flow is built on, and needs its own verification.
   */
  @Patch('me')
  async updateProfile(@Body() body: UpdateProfileDto, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    if (!session?.customerId) {
      throw unauthorizedError('Profile update requires an authenticated session');
    }

    const customer = await this.prisma.customer.update({
      where: { id: session.customerId },
      data: {
        displayName: body.displayName,
        phone: body.phone,
        preferredLocale: body.preferredLocale,
        preferredRegion: body.preferredRegion as never,
      },
    });

    return toCustomerResponse(customer);
  }
}
