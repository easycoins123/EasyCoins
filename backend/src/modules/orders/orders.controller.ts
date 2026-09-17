import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { PrismaService } from '../../database/prisma.service';
import { SessionService } from '../customers/session.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { OrderAccessService } from './order-access.service';
import { ORDER_INCLUDE, OrderCreationService } from './order-creation.service';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  OrderWithRelations,
  toOrderResponse,
  toOrderStatusResponse,
} from './dto/order.mapper';

/**
 * Reading orders.
 *
 * Order creation belongs to a later phase; these endpoints exist now because
 * ownership is the security property worth getting right first, and it can only
 * be tested against a real endpoint.
 */
@Controller()
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly access: OrderAccessService,
    private readonly creation: OrderCreationService,
    private readonly fulfillment: FulfillmentService,
  ) {}

  /**
   * Creates the order for a checkout session.
   *
   * 201 for a new order, 200 when the checkout already had one. Both carry the
   * same body, so a client that retried after a timeout sees its order either
   * way and never has to decide whether to try again.
   *
   * The idempotency key is required. Without it a retry after a network failure
   * would be indistinguishable from a deliberate second purchase.
   */
  @Post('orders')
  @HttpCode(201)
  async createOrder(
    @Body() body: CreateOrderDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const session = await this.sessions.resolve(request);
    const result = await this.creation.createFromCheckout(
      body.checkoutSessionId,
      session,
      idempotencyKey?.trim() || null,
    );

    response.status(result.status);

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: result.orderId },
      include: ORDER_INCLUDE,
    });

    return toOrderResponse(order as OrderWithRelations);
  }

  @Get('orders/:orderId')
  async getOrder(@Param('orderId') orderId: string, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    // Throws a not-found for someone else's order, never a forbidden.
    await this.access.requireReadable(orderId, session);

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    return toOrderResponse(order as OrderWithRelations);
  }

  @Get('orders/:orderId/status')
  async getOrderStatus(@Param('orderId') orderId: string, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    await this.access.requireReadable(orderId, session);

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    return toOrderStatusResponse(order as OrderWithRelations);
  }

  /**
   * The customer's hand-off: "I listed the card, come buy it."
   *
   * Moves every trade job on the order that was waiting on the customer to
   * `READY`, which is what the operator queue watches for. Ownership is checked
   * the same way a read is, so a customer can only advance their own order, and
   * the whole order is returned so the page re-renders its progress from one
   * response.
   *
   * Idempotent: pressing it twice, or after an operator already moved on, is a
   * 200 with nothing left to move, never an error.
   */
  @Post('orders/:orderId/mark-listed')
  @HttpCode(200)
  async markOrderListed(@Param('orderId') orderId: string, @Req() request: Request) {
    const session = await this.sessions.resolve(request);
    await this.access.requireReadable(orderId, session);

    await this.fulfillment.markListedByCustomer(orderId);

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });

    return toOrderResponse(order as OrderWithRelations);
  }

  /**
   * The caller's own orders.
   *
   * Anonymous sessions get the orders they placed, so a guest can see their
   * history without an account. No session means an empty page rather than an
   * error: having bought nothing is not a failure.
   */
  @Get('account/orders')
  async listOrders(
    @Req() request: Request,
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
  ) {
    const page = Math.max(1, Number(pageParam) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(pageSizeParam) || 20));

    const session = await this.sessions.resolve(request);
    const { total } = await this.access.listForSession(session, {
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const where = session
      ? session.customerId
        ? { customerId: session.customerId }
        : { sessionId: session.id }
      : { id: '__none__' };

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: ORDER_INCLUDE,
    });

    return {
      items: orders.map((order) => toOrderResponse(order as OrderWithRelations)),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    };
  }
}
