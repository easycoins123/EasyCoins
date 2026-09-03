import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { AppLogger } from './common/logging/app-logger.service';
import { APP_CONFIG } from './config/config.module';
import { AppConfig, EnvironmentValidationError, validateEnvironment } from './config/environment';

/** Every route lives under this prefix; the Angular ApiClient builds the same. */
export const API_PREFIX = 'api/v1';

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Our structured logger replaces Nest's once the app is built; until then
    // buffer so nothing is written in the framework's format.
    bufferLogs: true,
  });
  return configureApp(app);
}

/**
 * Everything that turns a bare Nest application into this API: logger,
 * security headers, body limits, cookies, CORS, validation and the error
 * envelope. Split from `createApp` so a test can build the application from a
 * testing module with a provider overridden (a stubbed Google exchange, say)
 * and still get exactly the production middleware stack.
 */
export async function configureApp(app: NestExpressApplication): Promise<NestExpressApplication> {
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = app.get(AppLogger);
  app.useLogger(logger);

  app.setGlobalPrefix(API_PREFIX);

  // Behind a reverse proxy (Vercel, Render) the socket address is the proxy's.
  // Trusting exactly one hop makes `request.ip` the client address the rate
  // limits and session records are built on. Without it every customer shares
  // the proxy's address, and the per-IP limits lock everyone out at once.
  if (config.isDeployed) {
    app.set('trust proxy', 1);
  }

  // --- Security headers ----------------------------------------------------
  // The API serves JSON only, so the strictest CSP is appropriate: nothing here
  // is ever rendered as a document.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: config.isDeployed
        ? { maxAge: 63072000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  // Not an API that needs to advertise its framework.
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // --- Body limits ---------------------------------------------------------
  // A commerce API posts small JSON documents. Capping the body is the cheapest
  // defence against a trivial memory-exhaustion attempt.
  app.use(
    json({
      limit: config.requestBodyLimit,
      // The raw bytes are kept so a webhook signature can be verified against
      // exactly what the provider signed. Re-serialising the parsed object would
      // change whitespace and key order, and every signature would fail.
      verify: (request, _response, buffer) => {
        (request as unknown as { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(urlencoded({ extended: false, limit: config.requestBodyLimit }));

  app.use(cookieParser(config.sessionSecret || undefined));

  // --- CORS ----------------------------------------------------------------
  // An explicit allowlist, never a wildcard: the storefront sends credentials,
  // and browsers reject `*` with credentials anyway.
  app.enableCors({
    origin: (origin, callback) => {
      // Same-origin, curl and server-to-server calls send no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, config.corsAllowedOrigins.includes(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    // `Authorization` is here for the operator panel, which is a separate
    // origin and authenticates with a bearer token rather than the storefront's
    // cookie. Without it the browser blocks the preflight and the panel reports
    // a connection failure that looks like the backend being down.
    allowedHeaders: [
      'Content-Type',
      'X-Request-Id',
      'X-Session-Trace',
      'Idempotency-Key',
      'Authorization',
    ],
    // Webhook headers are deliberately absent: a provider calls server to
    // server and never from a browser, so they have no business on this list.
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });

  // --- Validation ----------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // An unexpected field is rejected rather than ignored. docs/API-CONTRACT
      // promises the checkout engine refuses unknown fields, and this is where
      // that promise is kept for every endpoint at once.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(app.get(ApiExceptionFilter));

  return app;
}

async function bootstrap(): Promise<void> {
  try {
    // Validated before Nest builds anything. Otherwise the failure surfaces
    // during dependency injection and Nest prints a stack trace, which is the
    // opposite of what an operator needs from a configuration mistake.
    validateEnvironment(process.env);

    const app = await createApp();
    const config = app.get<AppConfig>(APP_CONFIG);

    // Render sends SIGTERM before replacing an instance. Enabling the hooks lets
    // Nest run every onApplicationShutdown, so the housekeeping timer stops and
    // Prisma closes its pool instead of the process being killed mid-query.
    app.enableShutdownHooks();

    // PORT comes from the environment, and the bind address is explicit: a
    // platform that routes to the container needs 0.0.0.0, not localhost.
    await app.listen(config.port, '0.0.0.0');

    app.get(AppLogger).info('backend started', {
      env: config.nodeEnv,
      port: config.port,
      prefix: `/${API_PREFIX}`,
      corsOrigins: config.corsAllowedOrigins.length,
      paymentMode: config.paymentMode,
    });
  } catch (error) {
    // Fail fast and loudly. A configuration problem must never degrade into a
    // half-working service.
    if (error instanceof EnvironmentValidationError) {
      process.stderr.write(`\n${error.message}\n\n`);
      process.stderr.write('See backend/.env.example for the expected variables.\n');
    } else {
      process.stderr.write(
        `\nBackend failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
    process.exit(1);
  }
}

// Only self-start when run directly; tests import `createApp` instead.
if (require.main === module) {
  void bootstrap();
}
