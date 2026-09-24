import { Module } from '@nestjs/common';

import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { GrowthClaimService } from '../growth/growth-claim.service';
import { OrderAccessService } from '../orders/order-access.service';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { CustomersController } from './customers.controller';
import { SessionService } from './session.service';

@Module({
  controllers: [CustomersController],
  // OrderAccessService and GrowthClaimService are listed here rather than
  // imported from their modules, which already import this one: importing them
  // back would be a cycle. Neither holds state beyond Prisma, so a second
  // instance is equivalent.
  providers: [
    AuthService,
    AccountService,
    GoogleOAuthService,
    SessionService,
    RateLimitService,
    OrderAccessService,
    GrowthClaimService,
  ],
  exports: [SessionService, AccountService, GoogleOAuthService],
})
export class CustomersModule {}
