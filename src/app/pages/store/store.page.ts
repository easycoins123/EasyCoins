import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, EMPTY, Observable, combineLatest, of, timer } from 'rxjs';
import {
  catchError, debounce, distinctUntilChanged, filter, map, shareReplay, startWith, switchMap,
} from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { OfferValue, rankByValue } from '../../core/value';
import {
  AppError, CatalogQuery, CatalogSort, DEFAULT_PAGE_SIZE, Offer, Page, Platform, Product,
  ProductDetail, ProductType, toAppError,
} from '../../domain';
import { CartFacade, CatalogFacade, CatalogLookups } from '../../state';
import {
  CoinTierCardComponent, EmptyStateComponent, ErrorStateComponent, FilterBarComponent,
  FilterChange, FilterGroup, ProductCardComponent, SkeletonGridComponent, ValueStripComponent,
} from '../../ui';

/** One coin bundle on the shelf, with its position in the range for the art. */
interface TierRow {
  readonly row: OfferValue;
  readonly rank: number;
}

interface StoreViewModel {
  readonly page: Page<Product>;
  readonly lookups: CatalogLookups;
  readonly coins: ProductDetail | null;
  /** The coin product, expanded into one card per bundle. */
  readonly tiers: readonly TierRow[];
  /** Everything else on the page. */
  readonly others: readonly Product[];
}

/**
 * The shop.
 *
 * Title, one line of value, the toolbar, the goods. The coin product is the
 * shop's reason to exist, so it is not one card reading "100K to 2M": each
 * bundle is its own card with its own price and a button, and the other
 * products for the game follow on the same shelf.
 *
 * Filters are built from domain data, so a new platform or product category
 * appears in the bar on its own. Choosing a platform re-prices the bundles
 * from that platform's offers; sorting by price reorders them. Nothing here
 * decides a price: it lays out offers the server priced.
 */
@Component({
  selector: 'tt-store-page',
  standalone: true,
  imports: [
    CommonModule,
    ProductCardComponent, CoinTierCardComponent, SkeletonGridComponent, EmptyStateComponent,
    ErrorStateComponent, FilterBarComponent, ValueStripComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tt-container tt-section store">
      <header class="head">
        <div class="head__text">
          <span class="tt-eyebrow">{{ gameName }} · Ultimate Team</span>
          <h1>חנות הקוינס</h1>
          <p class="tt-muted">
            חמש חבילות במחיר סופי. הפלטפורמה ואזור החנות מוצגים לפני התשלום, ולכל הזמנה יש דף מעקב.
          </p>
        </div>
        <!-- Trust in the first screen. Facts the shop keeps; nothing invented. -->
        <tt-value-strip class="head__trust" [points]="trustPoints" [compact]="true"></tt-value-strip>
      </header>

      <tt-filter-bar class="filters"
                     [groups]="filterGroups(lookups$ | async)"
                     [search]="(search$ | async) ?? ''"
                     [activeCount]="activeFilterCount"
                     (changed)="onFilter($event)"
                     (searchChange)="setSearch($event)"
                     (clear)="clear()">
      </tt-filter-bar>

      <ng-container *ngIf="error(); else content">
        <tt-error-state [error]="error()" (retry)="retry()"></tt-error-state>
      </ng-container>

      <ng-template #content>
        <ng-container *ngIf="vm$ | async as vm; else loading">
          <p class="count tt-faint">{{ countLabel(vm) }}</p>

          <tt-empty-state *ngIf="isEmpty(vm)"
                          title="לא נמצאו מוצרים"
                          message="נסו לשנות את החיפוש או לאפס את הסינון."
                          actionLabel="איפוס סינון"
                          (action)="clear()">
          </tt-empty-state>

          <h2 class="tt-visually-hidden">תוצאות</h2>
          <div class="tt-grid shelf" *ngIf="!isEmpty(vm)">
            <ng-container *ngIf="vm.coins as coins">
              <tt-tier-card *ngFor="let tier of vm.tiers; trackBy: trackByOffer"
                            [row]="tier.row"
                            [rank]="tier.rank"
                            [productSlug]="coins.product.slug"
                            [productName]="coins.product.name"
                            [busy]="adding()"
                            (buy)="buyOffer($event)">
              </tt-tier-card>
            </ng-container>
            <tt-product-card *ngFor="let product of vm.others; trackBy: trackById"
                             [product]="product"
                             [lookups]="vm.lookups">
            </tt-product-card>
          </div>

          <div class="more" *ngIf="vm.page.hasMore">
            <button type="button" class="tt-btn tt-btn--ghost" (click)="loadMore()">טעינת מוצרים נוספים</button>
          </div>
        </ng-container>
      </ng-template>

      <ng-template #loading><tt-skeleton-grid [count]="6"></tt-skeleton-grid></ng-template>
    </div>
  `,
  styles: [`
    .head {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--tt-space-4);
      margin-block-end: var(--tt-space-5);
      padding-block-end: var(--tt-space-5);
      border-block-end: 1px solid var(--tt-border);
    }
    .head__text { max-inline-size: 60ch; }
    .head h1 { margin-block: var(--tt-space-1) var(--tt-space-2); }
    .head p { margin: 0; font-size: var(--tt-text-sm); }
    .head__trust { display: block; flex: none; }

    /* A toolbar on a rule, not a panel. The grid starts under it. */
    .filters {
      display: block;
      margin-block-end: var(--tt-space-4);
      padding-block-end: var(--tt-space-4);
      border-block-end: 1px solid var(--tt-border);
    }
    .count { margin-block-end: var(--tt-space-3); }

    /* Two across on a phone, up to five across on a desktop, so the five
       bundles can sit in one row where there is room for it. */
    .shelf { min-block-size: 260px; gap: var(--tt-space-3); }
    @media (min-width: 700px) { .shelf { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--tt-space-4); } }
    @media (min-width: 1000px) { .shelf { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    @media (min-width: 1240px) { .shelf { grid-template-columns: repeat(5, minmax(0, 1fr)); } }

    .more { display: flex; justify-content: center; margin-block-start: var(--tt-space-5); }

    @media (max-width: 719px) {
      .head { margin-block-end: var(--tt-space-4); padding-block-end: var(--tt-space-4); }
      .head h1 { font-size: var(--tt-text-2xl); }
      .head__trust { inline-size: 100%; }
    }
  `],
})
export class StorePage {
  private readonly catalog = inject(CatalogFacade);
  private readonly cart = inject(CartFacade);
  private readonly analytics = inject(AnalyticsService);
  private readonly route = inject(ActivatedRoute);

  readonly gameName = STOREFRONT.focusGameName;

  private readonly querySubject = new BehaviorSubject<CatalogQuery>({
    sort: 'relevance',
    page: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
  });

  private pageSize = DEFAULT_PAGE_SIZE;

  /** Cleared after the first query; see the debounce in `vm$`. */
  private firstQuery = true;

  /** Compact trust row for the store head. Facts only. */
  readonly trustPoints = [
    { icon: 'lock' as const, title: 'תשלום מאובטח', note: 'האשראי עובר לספק הסליקה.' },
    { icon: 'delivery' as const, title: 'מעקב הזמנה', note: 'דף סטטוס לכל הזמנה.' },
    { icon: 'support' as const, title: 'תמיכה בעברית', note: 'שאלה על הזמנה או מוצר.' },
  ];

  readonly error = signal<AppError | undefined>(undefined);

  /** Set while a bundle is being added, so a button cannot be double-pressed. */
  readonly adding = signal(false);

  readonly lookups$ = this.catalog.lookups$;
  readonly search$ = this.querySubject.pipe(map((query) => query.search ?? ''));


  /**
   * The coin product with its offers, for the bundle cards.
   *
   * Fetched by the slug the storefront names, in one request, so the shelf is
   * not waiting on the game's product list first. If it fails the shelf simply
   * shows the product as an ordinary card. Shared, because every filter change
   * rebuilds the shelf and the detail does not change with the filter.
   */
  private readonly coins$: Observable<ProductDetail | null> = this.catalog
    .productBySlug(STOREFRONT.focusProductSlug)
    .pipe(
      catchError(() => of(null)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

  readonly productTypes: readonly { value: ProductType; label: string }[] = [
    { value: ProductType.GameCurrency, label: 'מטבעות משחק' },
    { value: ProductType.DigitalCode, label: 'קוד דיגיטלי' },
    { value: ProductType.GiftCard, label: 'כרטיס מתנה' },
    { value: ProductType.Subscription, label: 'מנוי' },
    { value: ProductType.PlayerService, label: 'שירות שחקן' },
  ];

  /**
   * One stream drives the shelf: query changes are debounced, the request is
   * switched, and the template consumes it through `async`.
   */
  readonly vm$: Observable<StoreViewModel> = combineLatest([
    this.querySubject.pipe(
      // Nothing is requested until the storefront's game has resolved, so the
      // grid never renders the whole platform catalogue for a frame.
      filter((query) => query.gameIds !== undefined),
      debounce(() => {
        const wait = timer(this.firstQuery ? 0 : 200);
        this.firstQuery = false;
        return wait;
      }),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    ),
    this.lookups$,
    this.coins$,
  ]).pipe(
    switchMap(([query, lookups, coins]) => this.catalog.search(query).pipe(
      map((page): StoreViewModel => this.shelf(page, lookups, coins, query)),
    )),
    catchError((error: unknown) => {
      this.error.set(toAppError(error));
      return EMPTY;
    }),
    // Emitting undefined first keeps the skeleton on screen until data arrives.
    startWith(undefined as unknown as StoreViewModel),
  );

  constructor() {
    const params = this.route.snapshot.queryParamMap;

    // The storefront sells one game, so every query is scoped to it.
    this.catalog.gameBySlug(STOREFRONT.focusGameSlug).subscribe((game) => {
      this.patch({ gameIds: [game.id] });
    });

    // The header search navigates here with `?search=`.
    const search = params.get('search');
    if (search) {
      this.patch({ search });
    }
    this.analytics.pageView('/store', 'Store');
  }

  /**
   * Lays the page out as a shelf.
   *
   * The coin product, when the query returned it, becomes one card per bundle
   * priced from the offers of the chosen platform (or the first platform when
   * none is chosen), all in one region so the ranking compares like with like.
   * Everything else stays a product card.
   */
  private shelf(
    page: Page<Product>,
    lookups: CatalogLookups,
    coins: ProductDetail | null,
    query: CatalogQuery,
  ): StoreViewModel {
    const inPage = coins !== null && page.items.some((product) => product.id === coins.product.id);
    const others = page.items.filter((product) => product.id !== coins?.product.id);

    if (!coins || !inPage) {
      return { page, lookups, coins: null, tiers: [], others };
    }

    const platformId = query.platformIds?.[0];
    const pool = coins.offers.filter((offer) => !platformId || offer.platformId === platformId);
    const first = pool[0];
    const comparable = first
      ? pool.filter((offer) => offer.platformId === first.platformId && offer.regionId === first.regionId)
      : [];

    const ranked = rankByValue(comparable, coins.product.variants)
      .filter((row) => row.perUnitMinor !== undefined)
      .sort((a, b) => (a.variant.quantityValue ?? 0) - (b.variant.quantityValue ?? 0))
      .map((row, index): TierRow => ({ row, rank: Math.min(5, index + 1) }));

    const tiers = query.sort === 'price-desc' ? [...ranked].reverse() : ranked;
    return { page, lookups, coins, tiers, others };
  }

  /** Adds one bundle. The offer is the one the card's price belongs to. */
  buyOffer(offer: Offer): void {
    if (this.adding()) {
      return;
    }
    this.adding.set(true);
    this.cart.add({ offerId: offer.id, quantity: 1 }).subscribe({
      complete: () => this.adding.set(false),
      error: () => this.adding.set(false),
    });
  }

  isEmpty(vm: StoreViewModel): boolean {
    return vm.tiers.length === 0 && vm.others.length === 0;
  }

  countLabel(vm: StoreViewModel): string {
    const total = vm.tiers.length + vm.others.length;
    return total === 1 ? 'פריט אחד' : `${total} פריטים`;
  }

  get platformId(): string { return this.querySubject.value.platformIds?.[0] ?? ''; }
  get type(): string { return this.querySubject.value.types?.[0] ?? ''; }
  get sort(): CatalogSort { return this.querySubject.value.sort ?? 'relevance'; }

  /** The filter groups, built from whatever the catalog actually offers. */
  filterGroups(lookups: CatalogLookups | null): readonly FilterGroup[] {
    return [
      {
        key: 'platform',
        label: 'פלטפורמה',
        anyLabel: 'לא משנה',
        selected: this.platformId,
        options: this.platforms(lookups).map((platform) => ({
          value: platform.id,
          label: platform.name.he,
        })),
      },
      {
        key: 'type',
        label: 'סוג מוצר',
        anyLabel: 'לא משנה',
        selected: this.type,
        options: this.productTypes.map((entry) => ({ value: entry.value, label: entry.label })),
      },
      {
        key: 'sort',
        label: 'מיון',
        anyLabel: 'מומלץ',
        selected: this.sort === 'relevance' ? '' : this.sort,
        options: [
          { value: 'price-asc', label: 'מהזול ליקר' },
          { value: 'price-desc', label: 'מהיקר לזול' },
          { value: 'name-asc', label: 'שם' },
        ],
      },
    ];
  }

  /** How many groups the customer has narrowed, for the sheet's badge. */
  get activeFilterCount(): number {
    const query = this.querySubject.value;
    return [
      query.platformIds?.length,
      query.types?.length,
      query.sort && query.sort !== 'relevance' ? 1 : 0,
      query.search ? 1 : 0,
    ].filter(Boolean).length;
  }

  onFilter(change: FilterChange): void {
    if (change.key === 'platform') {
      this.setPlatform(change.value);
    } else if (change.key === 'type') {
      this.setType(change.value);
    } else if (change.key === 'sort') {
      this.setSort((change.value || 'relevance') as CatalogSort);
    }
  }

  platforms(lookups: CatalogLookups | null): readonly Platform[] {
    return lookups ? [...lookups.platforms.values()] : [];
  }

  setSearch(value: string): void { this.patch({ search: value || undefined }); }
  setPlatform(value: string): void { this.patch({ platformIds: value ? [value] : undefined }); }
  setType(value: string): void { this.patch({ types: value ? [value as ProductType] : undefined }); }
  setSort(value: CatalogSort): void { this.patch({ sort: value }); }

  loadMore(): void {
    this.pageSize += DEFAULT_PAGE_SIZE;
    this.patch({});
  }

  /** Clears the customer's filters, keeping the storefront's game scope. */
  clear(): void {
    this.pageSize = DEFAULT_PAGE_SIZE;
    this.querySubject.next({
      sort: 'relevance',
      gameIds: this.querySubject.value.gameIds,
      page: { page: 1, pageSize: this.pageSize },
    });
  }

  retry(): void {
    this.error.set(undefined);
    this.patch({});
  }

  trackById(_index: number, product: Product): string {
    return product.id;
  }

  trackByOffer(_index: number, tier: TierRow): string {
    return tier.row.offer.id;
  }

  private patch(partial: Partial<CatalogQuery>): void {
    this.querySubject.next({
      ...this.querySubject.value,
      ...partial,
      page: { page: 1, pageSize: this.pageSize },
    });
  }
}
