import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, EMPTY, Observable, combineLatest, of, timer } from 'rxjs';
import {
  catchError, debounce, distinctUntilChanged, filter, map, shareReplay, startWith, switchMap,
} from 'rxjs/operators';

import { AnalyticsService } from '../../core/analytics';
import { STOREFRONT } from '../../core/brand';
import { LocalizePipe } from '../../core/i18n';
import { isCurated, roleLabel } from '../../core/commerce';
import { coinProductsFrom, formatQuantity, withBestValue } from '../../core/value';
import {
  AppError, CatalogQuery, CatalogSort, CoinProduct, DEFAULT_PAGE_SIZE, Offer, Page, Platform, Product,
  ProductDetail, ProductType, toAppError,
} from '../../domain';
import { CartFacade, CatalogFacade, CatalogLookups, PlatformPreferenceService } from '../../state';
import {
  EasyCoinsCardComponent, EmptyStateComponent, ErrorStateComponent, FilterBarComponent,
  FilterChange, FilterGroup, IconComponent, ProductCardComponent, RevealDirective,
  SkeletonGridComponent, StadiumComponent,
} from '../../ui';
import { CoinLadderComponent } from '../../ui/components/commerce/coin-ladder.component';
import { PlatformPickerComponent } from '../../ui/components/commerce/platform-picker.component';

interface StoreViewModel {
  readonly page: Page<Product>;
  readonly lookups: CatalogLookups;
  readonly coins: ProductDetail | null;
  /** The whole coin ladder, priced for the chosen platform. */
  readonly products: readonly CoinProduct[];
  /** The leading bundles, one card each. */
  readonly curated: readonly CoinProduct[];
  readonly others: readonly Product[];
  /** The platforms the coin product is sold for, in catalog order. */
  readonly platforms: readonly Platform[];
  /** The platform the shelf and the ladder are priced for. */
  readonly platform?: Platform;
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
    CommonModule, LocalizePipe,
    ProductCardComponent, EasyCoinsCardComponent, SkeletonGridComponent, EmptyStateComponent,
    ErrorStateComponent, FilterBarComponent, IconComponent, RevealDirective, StadiumComponent, CoinLadderComponent,
    PlatformPickerComponent,
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
        <p class="tt-head__lede">כל הסולם, מ־100K עד 5M, במחיר סופי ועם בונוס ההשקה. בוחרים פלטפורמה, בוחרים כמות, ורואים את המחיר לפני התשלום.</p>
      </header>

      <!-- Step one: the platform. Every price and every button below is for it. -->
      <section class="platform tt-plate" *ngIf="platforms$ | async as platforms" aria-labelledby="store-platform-title">
        <span class="tt-visually-hidden" id="store-platform-title">בחירת פלטפורמה</span>
        <tt-platform-picker [platforms]="platforms"
                            [selected]="platformId"
                            label="על מה משחקים?"
                            [help]="true"
                            (selectedChange)="choosePlatform($event)">
        </tt-platform-picker>
      </section>

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

          <h2 class="shelf__title" *ngIf="vm.curated.length > 0">החבילות המובילות <span class="tt-muted" *ngIf="vm.platform as platform">· ל־{{ platform.name | t }}</span></h2>
          <div class="tt-grid shelf" *ngIf="vm.curated.length > 0">
            <tt-easycoins-card *ngFor="let product of vm.curated; let i = index; trackBy: trackByOffer"
                               [ttReveal]="i"
                               [product]="product"
                               [featured]="product.badge === 'best-value'"
                               [chip]="chipFor(product)"
                               [flagship]="i === vm.curated.length - 1 && vm.curated.length % 2 === 1"
                               [busy]="adding()"
                               (buy)="buyOffer($event)">
            </tt-easycoins-card>
          </div>

          <!-- The whole ladder, comparable in ten seconds. -->
          <section class="ladder" *ngIf="vm.products.length > 0" ttReveal>
            <h2 class="ladder__title">כל הגדלים <span class="tt-muted">· {{ vm.products.length }} חבילות, מ־{{ smallest(vm.products) }} עד {{ largest(vm.products) }}</span></h2>
            <tt-coin-ladder [products]="vm.products" [busy]="adding()" (buy)="buyOffer($event)"></tt-coin-ladder>
          </section>

          <div class="tt-grid others" *ngIf="vm.others.length > 0">
            <h2 class="others__title">עוד בחנות</h2>
            <tt-product-card *ngFor="let product of vm.others; let i = index; trackBy: trackById"
                             [ttReveal]="i"
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
    .platform { margin-block: var(--tt-space-4) var(--tt-space-5); padding: var(--tt-space-4); border-radius: var(--tt-radius-lg); }
    .shelf__title { margin: 0 0 var(--tt-space-4); font-size: var(--tt-text-xl); }
    .ladder { margin-block-start: var(--tt-space-7); }
    /* On a phone the fifth card spans the row as the flagship instead of sitting alone. */
    @media (max-width: 700px) { .shelf > :last-child:nth-child(odd) { grid-column: 1 / -1; } }
    .ladder__title, .others__title { margin: 0 0 var(--tt-space-4); font-size: var(--tt-text-xl); }
    .ladder__title .tt-muted { font-size: var(--tt-text-sm); font-weight: 600; }
    .others { margin-block-start: var(--tt-space-7); }
    .others__title { grid-column: 1 / -1; margin-block-end: 0; }
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
  private readonly preference = inject(PlatformPreferenceService);

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

  /** The product types the catalog actually has for this game, so the filter offers nothing empty. */
  readonly catalogTypes = signal<ReadonlySet<ProductType>>(new Set());

  private readonly coins$: Observable<ProductDetail | null> = this.catalog
    .productBySlug(STOREFRONT.focusProductSlug)
    .pipe(
      catchError(() => of(null)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

  /** The platforms the coin product is offered for, for the picker above the shelf. */
  readonly platforms$: Observable<readonly Platform[]> = combineLatest([this.lookups$, this.coins$]).pipe(
    map(([lookups, coins]) => (coins ? offeredPlatforms(coins, lookups) : [])),
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
    this.catalog.productsForGame(STOREFRONT.focusGameSlug).pipe(catchError(() => of([] as readonly Product[]))).subscribe((products) => {
      this.catalogTypes.set(new Set(products.map((product) => product.type)));
    });
    // The remembered platform prices the shelf and filters the other products
    // from the first paint, so a returning customer never sees the wrong console.
    const remembered = this.preference.platformId();
    if (remembered) {
      this.patch({ platformIds: [remembered] });
    }
    const search = params.get('search');
    if (search) {
      this.patch({ search });
    }
    // A platform in the URL pre-selects the filter, so a link can land a
    // customer on the shelf already priced for their console.
    const platform = params.get('platform');
    if (platform) {
      this.preference.set(platform);
      this.patch({ platformIds: [platform] });
    }
    this.analytics.pageView('/store', 'Store');
  }

  private shelf(page: Page<Product>, lookups: CatalogLookups, coins: ProductDetail | null, query: CatalogQuery): StoreViewModel {
    const inPage = coins !== null && page.items.some((product) => product.id === coins.product.id);
    const others = page.items.filter((product) => product.id !== coins?.product.id);
    const platforms = coins ? offeredPlatforms(coins, lookups) : [];
    const platform = this.preference.resolve(platforms);
    if (!coins || !inPage) {
      return { page, lookups, coins: null, products: [], curated: [], others, platforms, platform };
    }
    const ranked = coinProductsFrom(coins, lookups.platforms, {
      game: STOREFRONT.focusGameEdition,
      platformId: platform?.id,
    });
    const products = query.sort === 'price-desc' ? [...ranked].reverse() : ranked;
    return { page, lookups, coins, products, curated: withBestValue(products.filter((product) => isCurated(product.amount))), others, platforms, platform };
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

  /** The platform the shelf is priced for: the preference, validated against the catalog. */
  get platformId(): string { return this.querySubject.value.platformIds?.[0] ?? ''; }

  choosePlatform(platform: Platform): void {
    this.preference.set(platform.id);
    // The other products are filtered to the same platform, so a customer on
    // PS4 is not shown a code that only exists for PS5 and Xbox.
    this.patch({ platformIds: [platform.id] });
  }
  get type(): string { return this.querySubject.value.types?.[0] ?? ''; }
  get sort(): CatalogSort { return this.querySubject.value.sort ?? 'relevance'; }

  /**
   * The filters, built only from what the shop sells. A product type with no
   * product behind it is a dead option that leads to an empty page, so the
   * type list is derived from the catalog rather than from the enum. Platform
   * is not a filter here: it is the store's first step, chosen above the shelf.
   */
  filterGroups(lookups: CatalogLookups | null): readonly FilterGroup[] {
    void lookups;
    return [
      {
        key: 'type', label: 'סוג מוצר', anyLabel: 'הכול', selected: this.type,
        options: availableTypes(this.productTypes, this.catalogTypes()),
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
  chipFor(product: CoinProduct): string | undefined {
    return roleLabel(product.role);
  }

  smallest(shelf: readonly CoinProduct[]): string {
    return formatQuantity(shelf[0]?.amount);
  }

  largest(shelf: readonly CoinProduct[]): string {
    return formatQuantity(shelf[shelf.length - 1]?.amount);
  }

  private patch(partial: Partial<CatalogQuery>): void {
    this.querySubject.next({
      ...this.querySubject.value,
      ...partial,
      page: { page: 1, pageSize: this.pageSize },
    });
  }
}

/** The platforms a product is offered for, as catalog records in catalog order. */
export function offeredPlatforms(detail: ProductDetail, lookups: CatalogLookups): readonly Platform[] {
  const ids = new Set(detail.offers.filter((offer) => offer.active).map((offer) => offer.platformId));
  return detail.product.platformIds
    .filter((id) => ids.has(id))
    .map((id) => lookups.platforms.get(id))
    .filter((platform): platform is Platform => platform !== undefined)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Filter options for the product types that exist. Until the catalog has
 * answered, nothing is offered rather than everything: an option that leads
 * to an empty page is worse than a moment without options.
 */
export function availableTypes(
  all: readonly { value: ProductType; label: string }[],
  present: ReadonlySet<ProductType>,
): readonly { value: string; label: string }[] {
  return all.filter((entry) => present.has(entry.value)).map((entry) => ({ value: entry.value, label: entry.label }));
}
