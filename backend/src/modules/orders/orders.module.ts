import { Module } from '@nestjs/common';

import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { CheckoutModule } from '../checkout/checkout.module';
import { CustomersModule } from '../customers/customers.module';
import { GrowthModule } from '../growth/growth.module';
import { InventoryService } from './inventory.service';
import { OrderAccessService } from './order-access.service';
import { OrderCreationService } from './order-creation.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [CustomersModule, CheckoutModule, GrowthModule],
  controllers: [OrdersController],
  providers: [OrderAccessService, OrderCreationService, InventoryService, IdempotencyService],
  exports: [OrderAccessService, InventoryService],
})
export class OrdersModule {}
