import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest, of, throwError } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';

import {
  CatalogQuery, DEFAULT_PAGE_SIZE, FulfillmentDescriptor, FulfillmentMethod, Game, Offer, Page,
  Platform, PlatformId, Product, ProductDetail, Region, RegionId, Slug,
} from '../domain';
import { CatalogApiService, FulfillmentApiService, ProductApiService } from '../data/api';

/**
 * Resolved reference data. Components render platforms, regions and delivery
 * methods through these maps instead of comparing against literal strings like
 * "PlayStation", which is what keeps the UI game-agnostic.
 */
export interface CatalogLookups {
  readonly games: readonly Game[];
  readonly platforms: ReadonlyMap<PlatformId, Platform>;
  readonly regions: ReadonlyMap<RegionId, Region>;
  readonly fulfillment: ReadonlyMap<FulfillmentMethod, FulfillmentDescriptor>;
}

/**
 * How long a catalog read is reused before it is fetched again.
 *
 * A minute is long enough that landing on the home page, opening the store,
 * looking at the cart and opening the drawer costs one request for the coin
 * product instead of four, and short enough that a price change reaches a
 * customer who keeps browsing. Nothing a customer pays is read from here: the
 * cart is re-priced by the server before checkout.
 */
const CATALOG_TTL_MS = 60_000;

interface Memo {
  readonly at: number;
  readonly stream: Observable<unknown>;
}

@Injectable({ providedIn: 'root' })
export class CatalogFacade {
  private readonly catalogApi = inject(CatalogApiService);
  private readonly productApi = inject(ProductApiService);
  private readonly fulfillmentApi = inject(FulfillmentApiService);
  private readonly memo = new Map<string, Memo>();

  /**
   * Reference data is small, stable and needed by nearly every screen, so it is
   * fetched once and shared. `shareReplay({ refCount: false })` keeps it warm for
   * the session; it is never invalidated because a page reload refetches anyway.
   */
  readonly lookups$: Observable<CatalogLookups> = combineLatest([
    this.catalogApi.getGames(),
    this.catalogApi.getPlatforms(),
    this.catalogApi.getRegions(),
    this.fulfillmentApi.getDescriptors(),
  ]).pipe(
    map(([games, platforms, regions, fulfillment]): CatalogLookups => ({
      games,
      platforms: new Map(platforms.map((platform) => [platform.id, platform])),
      regions: new Map(regions.map((region) => [region.id, region])),
      fulfillment: new Map(fulfillment.map((descriptor) => [descriptor.method, descriptor])),
    })),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly games$ = this.lookups$.pipe(map((lookups) => lookups.games));

  search(query: CatalogQuery): Observable<Page<Product>> {
    const request: CatalogQuery = { ...query, page: query.page ?? { page: 1, pageSize: DEFAULT_PAGE_SIZE } };
    return this.remember(`search:${JSON.stringify(request)}`, () => this.catalogApi.searchProducts(request));
  }

  featured(limit = 6): Observable<readonly Product[]> {
    return this.remember(`featured:${limit}`, () => this.catalogApi.getFeaturedProducts(limit));
  }

  gameBySlug(slug: Slug): Observable<Game> {
    return this.remember(`game:${slug}`, () => this.catalogApi.getGameBySlug(slug));
  }

  productsForGame(slug: Slug): Observable<readonly Product[]> {
    return this.remember(`game-products:${slug}`, () => this.gameBySlug(slug).pipe(
      switchMap((game) => this.catalogApi.getProductsByGame(game.id)),
    ));
  }

  productBySlug(slug: Slug): Observable<ProductDetail> {
    return this.remember(`product:${slug}`, () => this.productApi.getProductBySlug(slug));
  }

  relatedProducts(slug: Slug, limit = 4): Observable<readonly Product[]> {
    return this.remember(`related:${slug}:${limit}`, () => this.productApi.getRelatedProducts(slug, limit)
      .pipe(catchError(() => of([] as readonly Product[]))));
  }

  /**
   * Reuses a read for a short while.
   *
   * Every page that needs the coin product used to fetch it again: the home
   * page, the store, the cart, the drawer. The stream is shared and replayed
   * for `CATALOG_TTL_MS`; a failed read is forgotten at once so the next
   * caller tries the server again rather than replaying an error.
   */
  private remember<T>(key: string, factory: () => Observable<T>): Observable<T> {
    const now = Date.now();
    const hit = this.memo.get(key);
    if (hit && now - hit.at < CATALOG_TTL_MS) {
      return hit.stream as Observable<T>;
    }
    const stream = factory().pipe(
      catchError((error: unknown) => {
        this.memo.delete(key);
        return throwError(() => error);
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.memo.set(key, { at: now, stream });
    return stream;
  }

  offerById(offerId: string): Observable<Offer> {
    return this.productApi.getOfferById(offerId);
  }
}
