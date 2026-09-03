import { Injectable } from '@nestjs/common';
import type { Customer } from '@prisma/client';

import {
  accountInactiveError, invalidCredentialsError, unauthorizedError, validationError,
} from '../../common/errors/api-error';
import { generateId, generateSessionToken, hashSessionToken } from '../../common/crypto/tokens';
import { checkPasswordStrength, hashPassword, needsRehash, verifyPassword } from '../../common/crypto/passwords';
import { AppLogger } from '../../common/logging/app-logger.service';
import { RATE_LIMITS, RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { PrismaService } from '../../database/prisma.service';
import { GoogleProfile } from './google-oauth.service';

/** A reset link is short-lived. Long enough to reach an inbox, no longer. */
const RESET_TTL_MINUTES = 60;

/**
 * Customer accounts.
 *
 * Three ways in, one account behind them:
 *
 * - Email and password, for someone who wants a normal login.
 * - Google, for someone who does not want another password.
 * - The existing sign-in code, kept as-is. It was the only route before this
 *   and it is still the recovery path for an account with no password whose
 *   owner has lost access to their Google account. Deleting it would have
 *   stranded every customer who signed up under it.
 *
 * The three converge on one `customers` row keyed by email, so a person who
 * registered with a password and later presses "continue with Google" lands in
 * the account they already have rather than a duplicate.
 *
 * Session handling is unchanged: this service authenticates, and `SessionService`
 * issues the cookie and rotates it. Keeping those separate is what stopped the
 * fixation hole from reopening here.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Creates an account with a password.
   *
   * An address that already exists is not reported as taken. Doing so turns the
   * form into an oracle for which addresses have accounts here, which for a
   * gaming store is exactly the list a phisher wants. The caller receives the
   * same answer either way and, if the address was already registered, no
   * session: the real owner can still sign in, and the person probing learns
   * nothing.
   */
  async register(
    email: string,
    password: string,
    ip: string | null,
    displayName?: string,
  ): Promise<Customer | null> {
    const normalised = this.normalise(email);

    await this.rateLimit.consume(RATE_LIMITS.registerPerIp, ip ?? 'unknown');

    const problem = checkPasswordStrength(password);
    if (problem) {
      throw validationError('Password rejected', [
        { field: 'password', message: problem.message },
      ], 'WEAK_PASSWORD');
    }

    const existing = await this.prisma.customer.findUnique({ where: { email: normalised } });

    if (existing) {
      // Same shape of work either way, so the two paths cannot be told apart by
      // how long the response takes.
      await hashPassword(password);
      this.logger.info('registration attempted for an existing address', {});
      return null;
    }

    const customer = await this.prisma.customer.create({
      data: {
        id: generateId('cust'),
        email: normalised,
        passwordHash: await hashPassword(password),
        passwordUpdatedAt: new Date(),
        // Trimmed, and stored as null rather than an empty string so "has a
        // name" stays a single check everywhere downstream.
        displayName: displayName?.trim() || null,
        // Not verified by registering. Owning the address is proven by the
        // sign-in code or by Google, not by typing it into a form.
        emailVerified: false,
        lastLoginAt: new Date(),
      },
    });

    this.logger.info('customer registered', { customerId: customer.id, method: 'password' });
    return customer;
  }

  /**
   * Signs in with a password.
   *
   * One error for every failure: unknown address, no password set, wrong
   * password. Distinguishing them tells an attacker which addresses exist and
   * which use Google.
   */
  async signInWithPassword(email: string, password: string, ip: string | null): Promise<Customer> {
    const normalised = this.normalise(email);

    await this.rateLimit.consume(RATE_LIMITS.loginPerIp, ip ?? 'unknown');
    await this.rateLimit.consume(RATE_LIMITS.loginPerEmail, normalised);

    const customer = await this.prisma.customer.findUnique({ where: { email: normalised } });

    // Runs even when there is no customer, so a missing account and a wrong
    // password take the same time. Without this the response time is an
    // account-existence oracle.
    const matches = await verifyPassword(password, customer?.passwordHash ?? null);

    if (!customer || !matches) {
      throw invalidCredentialsError();
    }

    if (customer.status !== 'ACTIVE') {
      throw accountInactiveError();
    }

    // Transparently upgrade a hash made with weaker parameters.
    if (needsRehash(customer.passwordHash)) {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: { passwordHash: await hashPassword(password), passwordUpdatedAt: new Date() },
      });
    }

    await this.touchLogin(customer.id);
    return customer;
  }

  /**
   * Signs in with a verified Google profile, creating the account if needed.
   *
   * Linking is by provider subject first and email second. The subject is
   * Google's immutable id; an email can be changed or, on some domains,
   * reassigned, so matching only on email would eventually hand one person's
   * account to another.
   */
  async signInWithGoogle(profile: GoogleProfile): Promise<Customer> {
    const identity = await this.prisma.authIdentity.findUnique({
      where: {
        identity_provider_account: { provider: 'GOOGLE', providerAccountId: profile.subject },
      },
      include: { customer: true },
    });

    if (identity) {
      await this.prisma.authIdentity.update({
        where: { id: identity.id },
        data: { lastUsedAt: new Date(), providerEmail: profile.email },
      });
      await this.touchLogin(identity.customerId);
      return identity.customer;
    }

    // No identity yet. Attach to the existing account for this address if there
    // is one, which is what makes "I registered with a password, now I want
    // Google" work instead of creating a second account.
    const existing = await this.prisma.customer.findUnique({ where: { email: profile.email } });

    const customer =
      existing ??
      (await this.prisma.customer.create({
        data: {
          id: generateId('cust'),
          email: profile.email,
          displayName: profile.name ?? null,
          // Google verified the address, so we can too.
          emailVerified: true,
          lastLoginAt: new Date(),
        },
      }));

    await this.prisma.authIdentity.create({
      data: {
        id: generateId('idn'),
        customerId: customer.id,
        provider: 'GOOGLE',
        providerAccountId: profile.subject,
        providerEmail: profile.email,
        lastUsedAt: new Date(),
      },
    });

    if (existing && !existing.emailVerified) {
      await this.prisma.customer.update({
        where: { id: existing.id },
        data: { emailVerified: true },
      });
    }

    await this.touchLogin(customer.id);
    this.logger.info('customer signed in with google', {
      customerId: customer.id,
      linkedToExisting: Boolean(existing),
    });

    return customer;
  }

  /**
   * Starts a password reset.
   *
   * Always reports success. Whether an address has an account is not something
   * this endpoint will confirm.
   *
   * Returns the token only when the development echo is on, exactly as the
   * sign-in code does, so a developer can complete the flow without a mail
   * provider. Configuration refuses that echo outside local development.
   */
  async requestPasswordReset(
    email: string,
    ip: string | null,
    echo: boolean,
  ): Promise<{ devToken?: string }> {
    const normalised = this.normalise(email);

    await this.rateLimit.consume(RATE_LIMITS.passwordResetPerEmail, normalised);
    if (ip) {
      await this.rateLimit.consume(RATE_LIMITS.passwordResetPerIp, ip);
    }

    const customer = await this.prisma.customer.findUnique({ where: { email: normalised } });
    if (!customer) {
      return {};
    }

    // Any outstanding link is retired, so requesting a second one invalidates
    // the first rather than leaving two doors open.
    await this.prisma.passwordReset.updateMany({
      where: { customerId: customer.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const token = generateSessionToken();
    await this.prisma.passwordReset.create({
      data: {
        id: generateId('pwr'),
        customerId: customer.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000),
        requestIp: ip,
      },
    });

    // The token itself is never logged, in any environment.
    this.logger.info('password reset requested', { customerId: customer.id });

    return echo ? { devToken: token } : {};
  }

  /**
   * Completes a reset.
   *
   * Claiming the token is a conditional update whose row count decides the
   * outcome, so two requests arriving with the same link cannot both succeed.
   * Every session the customer holds is revoked afterwards: a reset is what
   * somebody does when they think an account is compromised, and leaving the
   * attacker's session alive would defeat the point.
   */
  async resetPassword(token: string, password: string): Promise<Customer> {
    const problem = checkPasswordStrength(password);
    if (problem) {
      throw validationError('Password rejected', [
        { field: 'password', message: problem.message },
      ], 'WEAK_PASSWORD');
    }

    const record = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashSessionToken(token) },
    });

    if (!record || record.consumedAt !== null || record.expiresAt <= new Date()) {
      throw unauthorizedError('This reset link is no longer valid', 'RESET_TOKEN_INVALID');
    }

    const claimed = await this.prisma.passwordReset.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    if (claimed.count !== 1) {
      throw unauthorizedError('This reset link is no longer valid', 'RESET_TOKEN_INVALID');
    }

    const customer = await this.prisma.customer.update({
      where: { id: record.customerId },
      data: {
        passwordHash: await hashPassword(password),
        passwordUpdatedAt: new Date(),
      },
    });

    await this.prisma.customerSession.updateMany({
      where: { customerId: customer.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.logger.info('password reset completed', { customerId: customer.id });
    return customer;
  }

  /**
   * Changes a password for a signed-in customer.
   *
   * The current password is required even though the session already proves
   * identity: a borrowed unlocked phone should not be enough to lock the owner
   * out of their own account.
   */
  async changePassword(customerId: string, current: string, next: string): Promise<void> {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });

    if (customer.passwordHash && !(await verifyPassword(current, customer.passwordHash))) {
      throw unauthorizedError('Current password is incorrect', 'INVALID_CREDENTIALS');
    }

    const problem = checkPasswordStrength(next);
    if (problem) {
      throw validationError('Password rejected', [
        { field: 'password', message: problem.message },
      ], 'WEAK_PASSWORD');
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { passwordHash: await hashPassword(next), passwordUpdatedAt: new Date() },
    });

    this.logger.info('password changed', { customerId });
  }

  /**
   * Records a customer's request to delete their account.
   *
   * Deliberately not an immediate delete. Orders are financial records with a
   * retention obligation, so erasure is a supervised process that a person runs
   * against a documented policy, not a button that cascades through the orders
   * table. This marks the request, closes every session, and leaves the rest to
   * that process.
   */
  async requestDeletion(customerId: string): Promise<void> {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { status: 'CLOSED' },
    });

    await this.prisma.customerSession.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    this.logger.warn('account deletion requested', { customerId });
  }

  /** Which sign-in methods an account actually has. Drives the account page. */
  async methodsFor(customerId: string): Promise<{ password: boolean; google: boolean }> {
    const [customer, identity] = await Promise.all([
      this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { passwordHash: true },
      }),
      this.prisma.authIdentity.findFirst({
        where: { customerId, provider: 'GOOGLE' },
        select: { id: true },
      }),
    ]);

    return { password: Boolean(customer?.passwordHash), google: Boolean(identity) };
  }

  private async touchLogin(customerId: string): Promise<void> {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { lastLoginAt: new Date() },
    });
  }

  private normalise(email: string): string {
    return email.trim().toLowerCase();
  }
}
