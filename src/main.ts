import { ErrorHandler } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling, withPreloading } from '@angular/router';

import { AppComponent } from './app/app.component';
import { APP_ROUTES } from './app/app.routes';
import { GlobalErrorHandler } from './app/core/error';
import { CommercePreloadStrategy } from './app/core/preload.strategy';
import { resolveDataLayer } from './app/data';

// The data layer is resolved first: in HTTP mode that is immediate, in mock
// mode it loads the in-memory backend as its own chunk. No Angular animations
// provider: every motion on the site is CSS, and the animation engine was
// sixty kilobytes of script nothing called.
resolveDataLayer()
  .then((dataLayer) => bootstrapApplication(AppComponent, {
    providers: [
      provideRouter(
        APP_ROUTES,
        // Only the buying path is preloaded, and only when the browser is idle.
        withPreloading(CommercePreloadStrategy),
        withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      ),
      provideHttpClient(withInterceptorsFromDi()),
      ...dataLayer,
      { provide: ErrorHandler, useClass: GlobalErrorHandler },
    ],
  }))
  .catch((error: unknown) => {
    console.error('[easycoins] bootstrap failed', error);
  });
