import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { filter, map, startWith } from 'rxjs/operators';

import { BRAND, STOREFRONT } from '../brand';
import { GAME_EDITIONS, StorefrontState } from '../../domain';
import { StorefrontFacade } from '../../state/storefront.facade';

/**
 * Search and share metadata that follows the edition on sale.
 *
 * The static `index.html` describes the brand without a year, because it is
 * served for every route and every season. Once the storefront knows which
 * edition it sells, the pages that search engines land on (home, store, the
 * coin product) get an edition-specific title and description, plus a small
 * JSON-LD block naming the organisation and the coin product. Nothing here
 * claims a rank, a rating or a count; it names what the shop sells.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly router = inject(Router);
  private readonly storefront = inject(StorefrontFacade);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  start(): void {
    const url$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split('?')[0]),
      startWith(this.router.url.split('?')[0]),
    );
    const subscription = combineLatest([url$, this.storefront.state$]).subscribe(([url, state]) => this.apply(url, state));
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  /** The words a search engine should see for this edition. */
  static copyFor(state: StorefrontState): { title: string; description: string; keywords: string } {
    const label = GAME_EDITIONS[state.activeEdition].label; // "FC 27"
    const short = label.replace(' ', ''); // "FC27"
    return {
      title: `קוינס ${label} · ${BRAND.name}`,
      description: `קניית קוינס ${label} (${short}) ל-Ultimate Team בישראל: פלייסטיישן, אקסבוקס ומחשב. מחיר סופי לפני התשלום, המחיר יורד ככל שעולים בכמות, דף מעקב לכל הזמנה.`,
      keywords: `קוינס ${label}, קוינס ${short}, קוינס פיפא ${GAME_EDITIONS[state.activeEdition].year}, קניית קוינס ${short}, ${short} coins Israel, קוינס לאולטימייט טים ${GAME_EDITIONS[state.activeEdition].year}`,
    };
  }

  private apply(url: string, state: StorefrontState): void {
    const copy = SeoService.copyFor(state);
    const editionPages = ['/', '/store', `/products/${state.editions.find((edition) => edition.id === state.activeEdition)?.productSlug ?? STOREFRONT.focusProductSlug}`];
    if (editionPages.includes(url)) {
      this.title.setTitle(url === '/' ? copy.title : `${this.title.getTitle().split(BRAND.titleSeparator)[0]}${BRAND.titleSeparator}${copy.title}`);
      this.meta.updateTag({ name: 'description', content: copy.description });
      this.meta.updateTag({ name: 'keywords', content: copy.keywords });
      this.meta.updateTag({ property: 'og:title', content: copy.title });
      this.meta.updateTag({ property: 'og:description', content: copy.description });
      this.meta.updateTag({ name: 'twitter:title', content: copy.title });
      this.meta.updateTag({ name: 'twitter:description', content: copy.description });
    }
    this.meta.updateTag({ property: 'og:url', content: `${this.origin()}${url}` });
    this.setCanonical(`${this.origin()}${url}`);
    this.setJsonLd(state);
  }

  private origin(): string {
    return this.document.location?.origin ?? 'https://www.easycoins.co.il';
  }

  private setCanonical(href: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  /** Organisation and the coin product, as structured data. No ratings, no counts. */
  private setJsonLd(state: StorefrontState): void {
    const label = GAME_EDITIONS[state.activeEdition].label;
    const active = state.editions.find((edition) => edition.id === state.activeEdition);
    const data = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          name: BRAND.name,
          url: this.origin(),
          logo: `${this.origin()}/assets/brand/icon-192.png`,
        },
        {
          '@type': 'Product',
          name: `קוינס ${label} · Ultimate Team`,
          description: `קוינס ל-EA SPORTS ${label} Ultimate Team לפלייסטיישן, אקסבוקס ומחשב, במחיר סופי לפני התשלום.`,
          brand: { '@type': 'Brand', name: BRAND.name },
          url: `${this.origin()}/products/${active?.productSlug ?? STOREFRONT.focusProductSlug}`,
        },
      ],
    };
    let script = this.document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"][data-seo]');
    if (!script) {
      script = this.document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo', '');
      this.document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(data);
  }
}
