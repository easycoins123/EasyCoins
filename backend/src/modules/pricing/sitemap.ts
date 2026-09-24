import type { StorefrontState } from './ladder.service';

/**
 * The sitemap describes what is public.
 *
 * Static routes are listed by hand because they are static. Product URLs are
 * not: a product page answers only while its edition has live offers, so its
 * URL is derived from the same edition state the storefront reads
 * (`LadderService.storefront()`). A draft or retired edition never appears:
 * its page is missing (404) or has nothing to buy.
 */
export interface SitemapEntry {
  readonly path: string;
  readonly changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  readonly priority: string;
}

export const STATIC_SITEMAP_ENTRIES: readonly SitemapEntry[] = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/store', changefreq: 'daily', priority: '0.9' },
  { path: '/deals', changefreq: 'weekly', priority: '0.7' },
  { path: '/delivery', changefreq: 'monthly', priority: '0.6' },
  { path: '/faq', changefreq: 'monthly', priority: '0.6' },
  { path: '/reviews', changefreq: 'weekly', priority: '0.5' },
  { path: '/support', changefreq: 'monthly', priority: '0.4' },
  { path: '/about', changefreq: 'monthly', priority: '0.4' },
  { path: '/terms', changefreq: 'yearly', priority: '0.2' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.2' },
  { path: '/refund-policy', changefreq: 'yearly', priority: '0.2' },
];

/** Every entry the sitemap lists for this edition state: static pages, then the editions on sale. */
export function sitemapEntries(state: Pick<StorefrontState, 'editions'>): SitemapEntry[] {
  const products = state.editions
    .filter((edition) => edition.status === 'active')
    .map((edition): SitemapEntry => ({ path: `/products/${edition.productSlug}`, changefreq: 'daily', priority: '0.9' }));
  return [STATIC_SITEMAP_ENTRIES[0], STATIC_SITEMAP_ENTRIES[1], ...products, ...STATIC_SITEMAP_ENTRIES.slice(2)];
}

/** The XML document, with the base URL taken from configuration and every URL escaped. */
export function buildSitemapXml(baseUrl: string, state: Pick<StorefrontState, 'editions'>): string {
  const base = baseUrl.replace(/\/+$/, '');
  const urls = sitemapEntries(state)
    .map((entry) => `  <url><loc>${escapeXml(base + entry.path)}</loc><changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char);
}
