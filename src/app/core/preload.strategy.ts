import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

/**
 * Preloads only the routes on the buying path, and only once the browser is idle.
 *
 * The previous strategy preloaded every lazy chunk the moment the shell was
 * up, which on a phone meant nineteen script downloads competing with the
 * hero image and the fonts for the first seconds of the visit. A route opts
 * in with `data: { preload: true }`; everything else loads when navigated to.
 * A visitor who asked for reduced data, or who is on a 2G connection, gets no
 * preloading at all.
 */
@Injectable({ providedIn: 'root' })
export class CommercePreloadStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (!route.data?.['preload'] || !this.connectionAllows()) {
      return of(null);
    }
    return whenIdle().pipe(mergeMap(() => load()));
  }

  private connectionAllows(): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (!connection) {
      return true;
    }
    return !connection.saveData && !/2g/.test(connection.effectiveType ?? '');
  }
}

/** Resolves when the main thread has a quiet moment, or after a short grace period. */
function whenIdle(): Observable<void> {
  return new Observable<void>((subscriber) => {
    const done = () => {
      subscriber.next();
      subscriber.complete();
    };
    if (typeof window === 'undefined') {
      done();
      return undefined;
    }
    const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) {
      const handle = idle(done, { timeout: 4000 });
      return () => (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(done, 2500);
    return () => clearTimeout(timer);
  });
}
