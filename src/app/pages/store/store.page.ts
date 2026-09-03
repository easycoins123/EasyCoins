import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, EMPTY, Observable, combineLatest, of, timer } from 'rxjs';
import {
  catchError, debounce, distinctUntilChanged, filter, map, shareReplay, startWith, switchMap,
} from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { coinProductsFrom } from '../../core/value';
import {
  AppError, CatalogQuery, CatalogSort, CoinProduct, DEFAULT_PAGE_SIZE, Offer, Page, Platform, Product,
  ProductDetail, ProductType, toAppError,
} from '../../domain';
import { CartFacade, CatalogFacade, CatalogLookups } from '../../state';
import {
  EasyCoinsCardComponent, EmptyStateComponent, ErrorStateComponent, FilterBarComponent,
  FilterChange, FilterGroup, IconComponent, ProductCardComponent, RevealDirective,
  SkeletonGridComponent, StadiumComponent,
} from '../../ui';

interface StoreViewModel {
  readonly page: Page<Product>;
  readonly lookups: CatalogLookups;
  readonly coins: ProductDetail | null;
  /** The coin bundles, one card each, priced for the chosen platform. */
  readonly products: readonly CoinProduct[];
  readonly others: readonly Product[];
}

/**
 * The shop.
 *
 * Title, one line of value, the toolbar, the goods. The coin product is the
 * shop's reason to exist, so it is not one card reading "100K to 2M": each
 * bundle is its own card in its own material with its own price and a button,
 * and the other products for the game follow on the same shelf.
 *
 * Filters are built from domain data. Choosing a platform re-prices the
 * bundles from that platform's offers; sorting by price reorders them.
 * Nothing here decides a price: it lays out offers the server priced.
 */
@Component({
  selector: 'tt-store-page',
  standalone: true,
  imports: [
    CommonModule,
    ProductCardComponent, EasyCoinsCardComponent, SkeletonGridComponent, EmptyStateComponent,
    ErrorStateComponent, FilterBarComponent, IconComponent, RevealDirective, StadiumComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="store-page">
      <!-- The shop stands in the same stadium as the rest of the site; the
           world fades out before the shelf so the cards keep their ground. -->
      <div class="store__world" aria-hidden="true"><tt-stadium scene="band"></tt-stadium></div>
    <div class="tt-container tt-section store">
      <header class="tt-head tt-head--tight">
        <span class="tt-eyebrow">{{ gameName }} · Ultimate Team</span>
        <h1>חנות הקוינס</h1>
        <p class="tt-head__lede">חמש חבילות במחיר סופי. הפלטפורמה ואזור החנות מוצגים לפני התשלום, ולכל הזמנה יש דף מעקב.</p>
      </header>

      <tt-filter-bar class="filters"
                     [groups]="filterGroups(lookups$ | async)"
                     [search]="(search$ | async) ?? ''"
                     [activeCount]="activeFilterCount"
                     (changed)="onFilter($event)"
                     (searchChange)="setSearch($event)"
                     (clear)="clear()">
      </tt-filter-bar>

      <!-- Trust in the first screen, as a strip on the toolbar's rule. -->
      <ul class="assure tt-plate">
        <li><tt-icon name="lock" [size]="15"></tt-icon> תשלום מאובטח</li>
        <li><tt-icon name="delivery" [size]="15"></tt-icon> מעקב הזמנה</li>
        <li><tt-icon name="support" [size]="15"></tt-icon> תמיכה בעברית</li>
        <li><tt-icon name="tag" [size]="15"></tt-icon> מחיר סופי</li>
      </ul>

      <ng-container *ngIf="error(); else content">
        <tt-error-state [error]="error()" (retry)="retry()"></tt-error-state>
      </ng-container>

      <ng-template #content>
        <ng-container *ngIf="vm$ | async as vm; else loading">
          <p class="count tt-faint">{{ countLabel(vm) }}</p>

          <tt-empty-state *ngIf="isEmpty(vm)" icon="football"
                          title="לא נמצאו מוצרים"
                          message="נסו לשנות את החיפוש או לאפס את הסינון."
                          actionLabel="איפוס סינון"
                          (action)="clear()">
          </tt-empty-state>

          <h2 class="tt-visually-hidden">תוצאות</h2>
          <div class="tt-grid shelf" *ngIf="!isEmpty(vm)">
            <tt-easycoins-card *ngFor="let product of vm.products; let i = index; trackBy: trackByOffer"
                               [ttReveal]="i"
                               [product]="product"
                               [featured]="product.badge === 'best-value'"
                               [chip]="chipFor(product, vm.products)"
                               [flagship]="i === vm.products.length - 1 && vm.products.length % 2 === 1 && vm.others.length === 0"
                               [busy]="adding()"
                               (buy)="buyOffer($event)">
            </tt-easycoins-card>
            <tt-product-card *ngFor="let product of vm.others; let i = index; trackBy: trackById"
                             [ttReveal]="vm.products.length + i"
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
    </div>
  `,
  styles: [`
    .store-page { position: relative; isolation: isolate; }
    .store__world {
      position: absolute; inset-inline: 0; inset-block-start: 0; block-size: min(520px, 70vh); z-index: -1;
      isolation: isolate;
      -webkit-mask-image: linear-gradient(180deg, #000 55%, transparent 100%);
      mask-image: linear-gradient(180deg, #000 55%, transparent 100%);
    }
    .store { position: relative; }

    .filters { display: block; margin-block-end: var(--tt-space-3); }
    .assure {
      display: flex;
      flex-wrap: wrap;
      gap: var(--tt-space-2) var(--tt-space-5);
      margin: 0 0 var(--tt-space-5);
      padding: var(--tt-space-2) var(--tt-space-4);
      border-radius: var(--tt-radius-md);
      list-style: none;
      color: var(--tt-text-muted);
      font-size: var(--tt-text-xs);
      font-weight: 700;
    }
    .assure li { display: inline-flex; align-items: center; gap: 6px; min-block-size: 28px; }
    .assure tt-icon { color: var(--tt-gold-400); }
    .count { margin-block-end: var(--tt-space-3); }

    .shelf { min-block-size: 260px; gap: var(--tt-space-3); }
    @media (min-width: 700px) { .shelf { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--tt-space-4); } }
    @media (min-width: 1000px) { .shelf { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    @media (min-width: 1240px) { .shelf { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
    .more { display: flex; justify-content: center; margin-block-start: var(--tt-space-5); }

    @media (max-width: 719px) {
      .assure { gap: var(--tt-space-1) var(--tt-space-3); padding-inline: var(--tt-space-3); }
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
  private firstQuery = true;

  readonly error = signal<AppError | undefined>(undefined);
  readonly adding = signal(false);

  readonly lookups$ = this.catalog.lookups$;
  readonly search$ = this.querySubject.pipe(map((query) => query.search ?? ''));

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

  readonly vm$: Observable<StoreViewModel> = combineLatest([
    this.querySubject.pipe(
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
    startWith(undefined as unknown as StoreViewModel),
  );

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    this.catalog.gameBySlug(STOREFRONT.focusGameSlug).subscribe((game) => {
      this.patch({ gameIds: [game.id] });
    });
    const search = params.get('search');
    if (search) {
      this.patch({ search });
    }
    // A platform in the URL pre-selects the filter, so a link can land a
    // customer on the shelf already priced for their console.
    const platform = params.get('platform');
    if (platform) {
      this.patch({ platformIds: [platform] });
    }
    this.analytics.pageView('/store', 'Store');
  }

  private shelf(page: Page<Product>, lookups: CatalogLookups, coins: ProductDetail | null, query: CatalogQuery): StoreViewModel {
    const inPage = coins !== null && page.items.some((product) => product.id === coins.product.id);
    const others = page.items.filter((product) => product.id !== coins?.product.id);
    if (!coins || !inPage) {
      return { page, lookups, coins: null, products: [], others };
    }
    const ranked = coinProductsFrom(coins, lookups.platforms, {
      game: STOREFRONT.focusGameEdition,
      platformId: query.platformIds?.[0],
    });
    const products = query.sort === 'price-desc' ? [...ranked].reverse() : ranked;
    return { page, lookups, coins, products, others };
  }

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
    return vm.products.length === 0 && vm.others.length === 0;
  }

  countLabel(vm: StoreViewModel): string {
    const total = vm.products.length + vm.others.length;
    return total === 1 ? 'פריט אחד' : `${total} פריטים`;
  }

  get platformId(): string { return this.querySubject.value.platformIds?.[0] ?? ''; }
  get type(): string { return this.querySubject.value.types?.[0] ?? ''; }
  get sort(): CatalogSort { return this.querySubject.value.sort ?? 'relevance'; }

  filterGroups(lookups: CatalogLookups | null): readonly FilterGroup[] {
    return [
      {
        key: 'platform', label: 'פלטפורמה', anyLabel: 'לא משנה', selected: this.platformId,
        options: this.platforms(lookups).map((platform) => ({ value: platform.id, label: platform.name.he })),
      },
      {
        key: 'type', label: 'סוג מוצר', anyLabel: 'לא משנה', selected: this.type,
        options: this.productTypes.map((entry) => ({ value: entry.value, label: entry.label })),
      },
      {
        key: 'sort', label: 'מיון', anyLabel: 'מומלץ', selected: this.sort === 'relevance' ? '' : this.sort,
        options: [
          { value: 'price-asc', label: 'מהזול ליקר' },
          { value: 'price-desc', label: 'מהיקר לזול' },
          { value: 'name-asc', label: 'שם' },
        ],
      },
    ];
  }

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

  trackByOffer(_index: number, product: CoinProduct): string {
    return product.id;
  }

  /** A fact the shelf can back: the smallest bundle is the cheapest, the largest the biggest. */
  chipFor(product: CoinProduct, shelf: readonly CoinProduct[]): string | undefined {
    if (product.badge === 'best-value') {
      return 'הכי משתלם';
    }
    const amounts = shelf.map((entry) => entry.amount);
    if (product.amount === Math.min(...amounts)) {
      return 'הכי זול';
    }
    if (product.amount === Math.max(...amounts)) {
      return 'הכי גדולה';
    }
    return undefined;
  }

  private patch(partial: Partial<CatalogQuery>): void {
    this.querySubject.next({
      ...this.querySubject.value,
      ...partial,
      page: { page: 1, pageSize: this.pageSize },
    });
  }
}
