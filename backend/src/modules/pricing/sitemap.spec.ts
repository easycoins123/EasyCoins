import { buildSitemapXml, sitemapEntries } from './sitemap';

/**
 * The sitemap must describe reality.
 *
 * This exists because of a real defect: the storefront shipped a static
 * sitemap that advertised the FC27 product URL while FC27 was a draft, so
 * search engines were sent to a page that answered 404. Product URLs now
 * come from the edition state; these prove which edition is listed when.
 */
const FC26 = { id: 'fc26', label: 'FC 26', productSlug: 'ea-fc-ultimate-team-coins', productId: 'prod-fc-coins' } as const;
const FC27 = { id: 'fc27', label: 'FC 27', productSlug: 'fc27-coins', productId: 'prod-fc27-coins' } as const;

describe('sitemap', () => {
  it('lists FC26 and not a draft FC27 while FC26 is on sale', () => {
    const xml = buildSitemapXml('https://www.easycoins.co.il', {
      editions: [{ ...FC26, status: 'active' }, { ...FC27, status: 'draft' }],
    });
    expect(xml).toContain('<loc>https://www.easycoins.co.il/products/ea-fc-ultimate-team-coins</loc>');
    expect(xml).not.toContain('fc27-coins');
    expect(xml).toContain('<loc>https://www.easycoins.co.il/</loc>');
    expect(xml).toContain('<loc>https://www.easycoins.co.il/store</loc>');
    expect(xml).toContain('<loc>https://www.easycoins.co.il/refund-policy</loc>');
  });

  it('lists FC27 and drops the retired FC26 once FC27 is on sale', () => {
    const xml = buildSitemapXml('https://www.easycoins.co.il', {
      editions: [{ ...FC26, status: 'retired' }, { ...FC27, status: 'active' }],
    });
    expect(xml).toContain('<loc>https://www.easycoins.co.il/products/fc27-coins</loc>');
    expect(xml).not.toContain('ea-fc-ultimate-team-coins');
  });

  it('lists both while both have live offers, and neither when neither does', () => {
    expect(sitemapEntries({ editions: [{ ...FC26, status: 'active' }, { ...FC27, status: 'active' }] }).map((entry) => entry.path))
      .toEqual(expect.arrayContaining(['/products/ea-fc-ultimate-team-coins', '/products/fc27-coins']));
    const none = sitemapEntries({ editions: [{ ...FC26, status: 'retired' }, { ...FC27, status: 'retired' }] });
    expect(none.some((entry) => entry.path.startsWith('/products/'))).toBe(false);
    expect(none.length).toBe(11);
  });

  it('never lists a checkout, cart, account or order page', () => {
    const paths = sitemapEntries({ editions: [{ ...FC26, status: 'active' }, { ...FC27, status: 'draft' }] }).map((entry) => entry.path);
    for (const path of paths) {
      expect(path).not.toMatch(/^\/(checkout|cart|account|order)/);
    }
  });

  it('is well-formed: one urlset, escaped locations, no trailing slash doubled', () => {
    const xml = buildSitemapXml('https://example.test/', { editions: [{ ...FC26, status: 'active', productSlug: 'a&b' }] });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.match(/<urlset/g)?.length).toBe(1);
    expect(xml).toContain('<loc>https://example.test/products/a&amp;b</loc>');
    expect(xml).not.toContain('https://example.test//');
    expect(xml.trim().endsWith('</urlset>')).toBe(true);
  });
});
