import { Module } from '@nestjs/common';

import { CustomersModule } from '../customers/customers.module';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { GrowthModule } from '../growth/growth.module';
import { OrderAccessService } from '../orders/order-access.service';
import { InventoryService } from '../orders/inventory.service';
import { PaymentStateService } from './payment-state.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SandboxPaymentProvider } from './providers/sandbox-payment.provider';
import { WebhooksController } from './webhooks.controller';

/**
 * OrderAccessService and InventoryService are listed rather than imported from
 * OrdersModule, which already imports the modules this one needs. Both are
 * stateless beyond Prisma, so a second instance behaves identically and the
 * alternative would be a circular import.
 *
 * Growth is imported for two things the state machine owes it: redeeming or
 * releasing a held reward inside the settlement transaction, and announcing a
 * paid order after it.
 */
@Module({
  imports: [CustomersModule, FulfillmentModule, GrowthModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [
    PaymentsService,
    PaymentStateService,
    SandboxPaymentProvider,
    OrderAccessService,
    InventoryService,
  ],
  exports: [PaymentStateService, SandboxPaymentProvider],
})
export class PaymentsModule {}
