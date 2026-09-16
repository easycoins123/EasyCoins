import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { AppLogger } from '../common/logging/app-logger.service';
import { APP_CONFIG } from '../config/config.module';
import { AppConfig } from '../config/environment';

/**
 * The Prisma client, with a lifecycle Nest can manage.
 *
 * Connecting in `onModuleInit` means a bad `DATABASE_URL` surfaces at startup
 * rather than on the first customer request. Disconnecting in `onModuleDestroy`
 * lets a deploy drain cleanly instead of dropping in-flight transactions.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly logger: AppLogger,
  ) {
    super({
      datasources: { db: { url: config.databaseUrl } },
      // Queries are logged only where a developer asked for them; a production
      // query log would leak customer data into stdout.
      log: config.logLevel === 'debug' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.info('database connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.info('database disconnected');
  }

  /**
   * Cheap liveness probe for the readiness endpoint. `SELECT 1` verifies the
   * connection is genuinely usable, which a pool that merely exists does not.
   */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  /**
   * Interactive transactions with headroom for a database that is not local.
   *
   * Prisma's defaults (2s to acquire a connection, 5s to run) assume the
   * database sits next to the app. Here it is a hosted pooler with real network
   * latency, and a multi-statement transaction (order creation, payment
   * settlement) pays that latency on every statement. The defaults expire
   * mid-transaction, and Prisma then fails the next query with "Transaction not
   * found ... refers to an old closed transaction". These limits give the round
   * trips room; the function's own maxDuration is the true ceiling.
   *
   * Every interactive transaction goes through here so the timeout is set in one
   * place rather than remembered at six call sites.
   */
  runInTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(fn, { maxWait: 15_000, timeout: 30_000 });
  }
}
