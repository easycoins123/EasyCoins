import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { catchError, map, of } from 'rxjs';

import { LocalizePipe } from '../../core/i18n';
import { formatQuantity } from '../../core/value';
import { Product } from '../../domain';
import { CatalogFacade } from '../../state';
import { MoneyPipe } from '../money.pipe';
import { CoinArtComponent } from './cards/coin-art.component';
import { IconComponent } from './icon.component';

/**
 * Header search with live suggestions.
 *
 * Suggestions come from the same catalog search the store page uses, so what a
 * customer sees here is what they will get there. A search box that only
 * navigates is a box people learn to ignore; one that answers while you type is
 * how a marketplace feels.
 *
 * Debounced at 200ms and limited to five results, because the point is to get
 * someone to a product in one tap, not to render the catalogue twice.
 */
@Component({
  selector: 'tt-search-box',
  standalone: true,
  imports: [CommonModule, LocalizePipe, MoneyPipe, IconComponent, CoinArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="search" role="search" (submit)="submit($event)">
      <tt-icon name="search" [size]="18" class="search__icon"></tt-icon>

      <input #field
             type="search"
             name="q"
             autocomplete="off"
             role="combobox"
             aria-autocomplete="list"
             aria-controls="tt-search-suggestions"
             [attr.aria-expanded]="open()"
             placeholder="חיפוש מוצר או משחק"
             aria-label="חיפוש בחנות"
             (input)="onInput(field.value)"
             (focus)="onInput(field.value)" />

      <button type="button" class="clear" *ngIf="field.value" (click)="clear(field)" aria-label="ניקוי חיפוש">
        <tt-icon name="close" [size]="14"></tt-icon>
      </button>

      <!-- Results. Hidden entirely when empty rather than showing a box that
           says nothing. -->
      <ul id="tt-search-suggestions"
          class="results"
          role="listbox"
          *ngIf="open() && (results().length > 0 || searched())">

        <li *ngFor="let product of results()" role="option" [attr.aria-selected]="false">
          <button type="button" class="result" (click)="goToProduct(product)">
            <tt-coin-art *ngIf="isCoins(product); else picture" class="result__coin" variant="quote" artKey="fut-thumb" tier="legend"></tt-coin-art>
            <ng-template #picture>
              <img *ngIf="product.images[0] as image" [src]="image.url" alt="" aria-hidden="true" />
            </ng-template>
            <span class="result__text">
              <span class="result__name">{{ product.name | t }}</span>
              <span class="result__meta">{{ quantityOf(product) }}</span>
            </span>
            <span class="tt-price result__price">{{ product.fromPrice?.current | money }}</span>
          </button>
        </li>

        <li class="empty" *ngIf="results().length === 0">
          <span>לא נמצאו מוצרים</span>
          <button type="button" class="all" (click)="goToStore()">לכל הקטלוג</button>
        </li>
      </ul>
    </form>
  `,
  styles: [`
    :host { display: block; position: relative; flex: 1; }

    .search { position: relative; }
    .search__icon {
      position: absolute;
      inset-inline-start: var(--tt-space-3);
      inset-block-start: 50%;
      transform: translateY(-50%);
      color: var(--tt-text-faint);
      pointer-events: none;
    }
    input {
      inline-size: 100%;
      padding: 0.55rem var(--tt-space-3);
      padding-inline-start: 2.4rem;
      border-radius: var(--tt-radius-md);
      border: 1px solid var(--tt-border);
      background: var(--tt-surface);
      color: var(--tt-text);
      font: inherit;
      font-size: var(--tt-text-sm);
      transition: border-color var(--tt-duration-fast) var(--tt-ease),
                  background-color var(--tt-duration-fast) var(--tt-ease);
    }
    input::placeholder { color: var(--tt-text-faint); }
    input:focus {
      outline: none;
      border-color: var(--tt-border-brand);
      background: var(--tt-surface-2);
    }
    /* The browser's own clear affordance duplicates ours and sits badly in RTL. */
    input::-webkit-search-cancel-button { display: none; }

    .clear {
      position: absolute;
      inset-inline-end: var(--tt-space-2);
      inset-block-start: 50%;
      transform: translateY(-50%);
      display: grid;
      place-items: center;
      inline-size: 24px;
      block-size: 24px;
      border: 0;
      border-radius: var(--tt-radius-pill);
      background: var(--tt-surface-3);
      color: var(--tt-text-muted);
      cursor: pointer;
    }

    .results {
      position: absolute;
      inset-inline: 0;
      inset-block-start: calc(100% + var(--tt-space-2));
      z-index: var(--tt-z-overlay);
      margin: 0;
      padding: var(--tt-space-1);
      list-style: none;
      border-radius: var(--tt-radius-lg);
      background: var(--tt-bg-elevated);
      border: 1px solid var(--tt-border-strong);
      box-shadow: var(--tt-shadow-3);
      max-block-size: 60vh;
      overflow-y: auto;
    }

    .result {
      display: flex;
      align-items: center;
      gap: var(--tt-space-3);
      inline-size: 100%;
      /* 52px keeps every row a comfortable tap target on a phone. */
      min-block-size: 52px;
      padding-inline: var(--tt-space-2);
      border: 0;
      border-radius: var(--tt-radius-md);
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .result:hover, .result:focus-visible { background: var(--tt-surface-2); }
    .result img { inline-size: 34px; block-size: 34px; object-fit: contain; flex: none; }
    .result__coin { inline-size: 56px; flex: none; }
    .result__text { display: flex; flex-direction: column; flex: 1; min-inline-size: 0; }
    .result__name {
      font-size: var(--tt-text-sm);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .result__meta {
      font-family: var(--tt-font-numeric);
      font-size: var(--tt-text-xs);
      color: var(--tt-text-faint);
      direction: ltr;
      unicode-bidi: isolate;
      text-align: start;
    }
    .result__price { font-size: var(--tt-text-sm); }

    .empty {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--tt-space-3);
      padding: var(--tt-space-3);
      color: var(--tt-text-muted);
      font-size: var(--tt-text-sm);
    }
    .all {
      border: 0;
      background: none;
      color: var(--tt-brand-300);
      font: inherit;
      font-size: var(--tt-text-sm);
      cursor: pointer;
    }
  `],
})
export class SearchBoxComponent {
  /** The coin product carries the FUT coin; every other product its own picture. */
  isCoins(product: Product): boolean {
    return /\/coins\.svg$/.test(product.images[0]?.url ?? '');
  }

  private readonly catalog = inject(CatalogFacade);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly terms = new Subject<string>();

  readonly results = signal<readonly Product[]>([]);
  readonly open = signal(false);
  /** True once a query has actually run, so "no results" is never shown early. */
  readonly searched = signal(false);

  private latest = '';

  constructor() {
    this.terms
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((term) =>
          this.catalog
            .search({ search: term, page: { page: 1, pageSize: 5 } })
            .pipe(
              map((page) => page.items),
              // A failed suggestion lookup closes the list rather than
              // surfacing an error over the header.
              catchError(() => of([] as readonly Product[])),
            ),
        ),
      )
      .subscribe((items) => {
        this.results.set(items);
        this.searched.set(true);
      });
  }

  onInput(value: string): void {
    this.latest = value;
    const term = value.trim();

    if (term.length < 2) {
      // One character matches most of the catalogue, which is noise.
      this.results.set([]);
      this.searched.set(false);
      this.open.set(false);
      return;
    }

    this.open.set(true);
    this.terms.next(term);
  }

  submit(event: Event): void {
    event.preventDefault();
    const term = this.latest.trim();
    this.open.set(false);
    void this.router.navigate(['/store'], term ? { queryParams: { search: term } } : {});
  }

  goToProduct(product: Product): void {
    this.open.set(false);
    void this.router.navigate(['/products', product.slug]);
  }

  goToStore(): void {
    this.open.set(false);
    void this.router.navigate(['/store']);
  }

  clear(field: HTMLInputElement): void {
    field.value = '';
    this.onInput('');
    field.focus();
  }

  quantityOf(product: Product): string {
    const quantities = product.variants
      .map((variant) => variant.quantityValue)
      .filter((value): value is number => typeof value === 'number' && value > 0)
      .sort((a, b) => a - b);

    if (quantities.length === 0) {
      return '';
    }
    const smallest = formatQuantity(quantities[0]);
    const largest = formatQuantity(quantities[quantities.length - 1]);
    return smallest === largest ? smallest : `${smallest}–${largest}`;
  }

  /** A click anywhere else closes the list, as a menu should. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }
}
