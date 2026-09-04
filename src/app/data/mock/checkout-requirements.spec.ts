import {
  Cart, CartItem, CheckoutFieldKey, FulfillmentMethod, computeTotals, fromMajor,
} from '../../domain';
import { OFFERS, PRODUCTS } from './catalog.seed';
import { requirementsForCart, validateCheckoutValues } from './mock-commerce-api.service';

function cartWithOffer(offerId: string): Cart {
  const offer = OFFERS.find((candidate) => candidate.id === offerId);
  if (!offer) {
    throw new Error(`Test setup error: no offer ${offerId}`);
  }
  const item: CartItem = {
    id: 'ci_1',
    offerId: offer.id,
    productId: offer.productId,
    variantId: offer.variantId,
    platformId: offer.platformId,
    regionId: offer.regionId,
    quantity: 1,
    unitPrice: offer.price.current,
    totalPrice: offer.price.current,
    fulfillmentMethod: offer.fulfillmentMethod,
    displayName: { he: 'x' },
    displayVariantName: { he: 'y' },
    addedAt: '2026-01-01T00:00:00.000Z',
  };
  return { id: 'c1', items: [item], totals: computeTotals([item]), updatedAt: '' };
}

const firstOfferFor = (productId: string): string => {
  const offer = OFFERS.find((candidate) => candidate.productId === productId);
  if (!offer) {
    throw new Error(`Test setup error: no offer for ${productId}`);
  }
  return offer.id;
};

/**
 * The dynamic checkout engine is what keeps the store from asking a gift-card
 * buyer for a player handle — and, more importantly, what makes it structurally
 * impossible to ask anyone for a credential.
 */
describe('checkout requirement resolution', () => {
  it('always asks for the contact fields every order needs', () => {
    const keys = requirementsForCart(cartWithOffer(firstOfferFor('prod-fortnite-vbucks')))
      .map((requirement) => requirement.key);
    expect(keys).toContain(CheckoutFieldKey.FullName);
    expect(keys).toContain(CheckoutFieldKey.Email);
    expect(keys).toContain(CheckoutFieldKey.TermsAcceptance);
  });

  it('asks a coin offer for a public account handle', () => {
    const keys = requirementsForCart(cartWithOffer(firstOfferFor('prod-fc-coins')))
      .map((requirement) => requirement.key);
    expect(keys).toContain(CheckoutFieldKey.PlatformAccountHandle);
  });

  it('does not ask a gift-card offer for an account handle', () => {
    const keys = requirementsForCart(cartWithOffer(firstOfferFor('prod-ps-gift-card')))
      .map((requirement) => requirement.key);
    expect(keys).not.toContain(CheckoutFieldKey.PlatformAccountHandle);
    expect(keys).not.toContain(CheckoutFieldKey.GamePlayerId);
  });

  it('asks a region-locked offer to confirm the region', () => {
    const keys = requirementsForCart(cartWithOffer(firstOfferFor('prod-ps-gift-card')))
      .map((requirement) => requirement.key);
    expect(keys).toContain(CheckoutFieldKey.RegionConfirmation);
  });

  it('does not ask a region-free offer to confirm a region', () => {
    const keys = requirementsForCart(cartWithOffer(firstOfferFor('prod-fortnite-vbucks')))
      .map((requirement) => requirement.key);
    expect(keys).not.toContain(CheckoutFieldKey.RegionConfirmation);
  });

  it('asks an in-game service for the public player id', () => {
    const keys = requirementsForCart(cartWithOffer(firstOfferFor('prod-fc-sbc')))
      .map((requirement) => requirement.key);
    expect(keys).toContain(CheckoutFieldKey.GamePlayerId);
  });

  it('unions the requirements of a mixed cart without duplicating a field', () => {
    const coins = cartWithOffer(firstOfferFor('prod-fc-coins'));
    const gift = cartWithOffer(firstOfferFor('prod-ps-gift-card'));
    const items = [...coins.items, { ...gift.items[0], id: 'ci_2' }];
    const mixed: Cart = { id: 'c', items, totals: computeTotals(items), updatedAt: '' };

    const keys = requirementsForCart(mixed).map((requirement) => requirement.key);
    expect(keys).toContain(CheckoutFieldKey.PlatformAccountHandle);
    expect(keys).toContain(CheckoutFieldKey.RegionConfirmation);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never produces a credential field for any offer in the catalog', () => {
    const forbidden = /password|סיסמה|2fa|otp|cvv|recovery|קוד אימות|קודי גיבוי/i;
    for (const offer of OFFERS) {
      for (const requirement of requirementsForCart(cartWithOffer(offer.id))) {
        expect(forbidden.test(requirement.key)).toBeFalse();
        expect(forbidden.test(requirement.label.he))
          .withContext(`offer ${offer.id} label "${requirement.label.he}"`)
          // The only permitted mention is the reassurance that we never ask.
          .toBe(/לעולם לא נבקש/.test(requirement.label.he));
      }
    }
  });
});

describe('checkout validation', () => {
  const requirements = requirementsForCart(cartWithOffer(firstOfferFor('prod-ps-gift-card')));

  it('rejects an entirely empty submission', () => {
    expect(validateCheckoutValues(requirements, {}).length).toBeGreaterThan(0);
  });

  it('names the missing field so the UI can mark it', () => {
    const issues = validateCheckoutValues(requirements, {});
    expect(issues.some((issue) => issue.field === CheckoutFieldKey.Email)).toBeTrue();
  });

  it('rejects a malformed email address', () => {
    const issues = validateCheckoutValues(requirements, {
      [CheckoutFieldKey.FullName]: 'שם',
      [CheckoutFieldKey.Email]: 'not-an-email',
      [CheckoutFieldKey.RegionConfirmation]: true,
      [CheckoutFieldKey.TermsAcceptance]: true,
    });
    expect(issues.some((issue) => issue.field === CheckoutFieldKey.Email)).toBeTrue();
  });

  it('rejects an unticked required checkbox', () => {
    const issues = validateCheckoutValues(requirements, {
      [CheckoutFieldKey.FullName]: 'שם',
      [CheckoutFieldKey.Email]: 'a@b.co',
      [CheckoutFieldKey.RegionConfirmation]: false,
      [CheckoutFieldKey.TermsAcceptance]: true,
    });
    expect(issues.some((issue) => issue.field === CheckoutFieldKey.RegionConfirmation)).toBeTrue();
  });

  it('rejects an over-long value', () => {
    const issues = validateCheckoutValues(requirements, {
      [CheckoutFieldKey.FullName]: 'x'.repeat(500),
      [CheckoutFieldKey.Email]: 'a@b.co',
      [CheckoutFieldKey.RegionConfirmation]: true,
      [CheckoutFieldKey.TermsAcceptance]: true,
    });
    expect(issues.some((issue) => issue.field === CheckoutFieldKey.FullName)).toBeTrue();
  });

  it('treats whitespace as empty for a required field', () => {
    const issues = validateCheckoutValues(requirements, {
      [CheckoutFieldKey.FullName]: '   ',
      [CheckoutFieldKey.Email]: 'a@b.co',
      [CheckoutFieldKey.RegionConfirmation]: true,
      [CheckoutFieldKey.TermsAcceptance]: true,
    });
    expect(issues.some((issue) => issue.field === CheckoutFieldKey.FullName)).toBeTrue();
  });

  it('accepts a complete, valid submission', () => {
    expect(validateCheckoutValues(requirements, {
      [CheckoutFieldKey.FullName]: 'ישראל ישראלי',
      [CheckoutFieldKey.Email]: 'israel@example.com',
      [CheckoutFieldKey.RegionConfirmation]: true,
      [CheckoutFieldKey.TermsAcceptance]: true,
    })).toEqual([]);
  });

  it('does not require the optional phone field', () => {
    const issues = validateCheckoutValues(requirements, {
      [CheckoutFieldKey.FullName]: 'ישראל',
      [CheckoutFieldKey.Email]: 'israel@example.com',
      [CheckoutFieldKey.RegionConfirmation]: true,
      [CheckoutFieldKey.TermsAcceptance]: true,
    });
    expect(issues.some((issue) => issue.field === CheckoutFieldKey.Phone)).toBeFalse();
  });
});

/**
 * Catalog coherence. Bad seed data looks like a UI bug, so the shape of the
 * catalog is asserted rather than eyeballed.
 */
describe('mock catalog data quality', () => {
  it('gives every product at least one variant and one offer', () => {
    for (const product of PRODUCTS) {
      expect(product.variants.length).withContext(product.id).toBeGreaterThan(0);
      expect(OFFERS.filter((offer) => offer.productId === product.id).length)
        .withContext(product.id).toBeGreaterThan(0);
    }
  });

  it('points every offer at a variant that exists on its product', () => {
    for (const offer of OFFERS) {
      const product = PRODUCTS.find((candidate) => candidate.id === offer.productId);
      expect(product).withContext(offer.id).toBeDefined();
      expect(product!.variants.some((variant) => variant.id === offer.variantId))
        .withContext(offer.id).toBeTrue();
    }
  });

  it('keeps every offer inside its product\'s declared platforms and regions', () => {
    for (const offer of OFFERS) {
      const product = PRODUCTS.find((candidate) => candidate.id === offer.productId)!;
      expect(product.platformIds).withContext(offer.id).toContain(offer.platformId);
      expect(product.regionIds).withContext(offer.id).toContain(offer.regionId);
    }
  });

  it('prices every offer above zero in shekels', () => {
    for (const offer of OFFERS) {
      expect(offer.price.current.amountMinor).withContext(offer.id).toBeGreaterThan(0);
      expect(offer.price.current.currency).toBe('ILS');
    }
  });

  it('never shows a compare-at price below the current price', () => {
    for (const offer of OFFERS) {
      if (offer.price.compareAt) {
        expect(offer.price.compareAt.amountMinor)
          .withContext(offer.id).toBeGreaterThan(offer.price.current.amountMinor);
      }
    }
  });

  it('sets the product "from" price to its cheapest offer', () => {
    for (const product of PRODUCTS) {
      const cheapest = Math.min(...OFFERS
        .filter((offer) => offer.productId === product.id)
        .map((offer) => offer.price.current.amountMinor));
      expect(product.fromPrice?.current.amountMinor).withContext(product.id).toBe(cheapest);
    }
  });

  it('never offers a NOT_SUPPORTED fulfillment method for sale', () => {
    for (const offer of OFFERS) {
      expect(offer.fulfillmentMethod).not.toBe(FulfillmentMethod.NotSupported);
    }
  });

  it('asks for an account handle only where fulfillment is manual or in-game', () => {
    for (const offer of OFFERS) {
      const asksHandle = offer.checkoutRequirements.some((requirement) => (
        requirement.key === CheckoutFieldKey.PlatformAccountHandle
        || requirement.key === CheckoutFieldKey.GamePlayerId
      ));
      if (asksHandle) {
        expect([FulfillmentMethod.ManualDelivery, FulfillmentMethod.InGameService, FulfillmentMethod.ManualReview])
          .withContext(offer.id).toContain(offer.fulfillmentMethod);
      }
    }
  });

  it('asks for region confirmation exactly where the region is locked', () => {
    const regionFree = new Set(['reg-global']);
    for (const offer of OFFERS) {
      const asksRegion = offer.checkoutRequirements
        .some((requirement) => requirement.key === CheckoutFieldKey.RegionConfirmation);
      if (regionFree.has(offer.regionId)) {
        expect(asksRegion).withContext(`${offer.id} is region-free`).toBeFalse();
      }
    }
  });

  it('gives every product a name, description and image', () => {
    for (const product of PRODUCTS) {
      expect(product.name.he.length).withContext(product.id).toBeGreaterThan(1);
      expect(product.shortDescription.he.length).withContext(product.id).toBeGreaterThan(5);
      expect(product.description.he.length).withContext(product.id).toBeGreaterThan(20);
      expect(product.images[0]?.url).withContext(product.id).toMatch(/^assets\/products\/.+\.svg$/);
    }
  });

  it('gives every product a slug that is URL-safe and unique', () => {
    const slugs = PRODUCTS.map((product) => product.slug);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps offer ids unique', () => {
    const ids = OFFERS.map((offer) => offer.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('states a quantity unit whenever a variant has a numeric quantity', () => {
    for (const product of PRODUCTS) {
      for (const variant of product.variants) {
        if (variant.quantityValue !== undefined) {
          expect(variant.quantityUnit).withContext(`${product.id}/${variant.id}`).toBeDefined();
        }
      }
    }
  });

  it('prices larger variants above smaller ones within a product', () => {
    for (const product of PRODUCTS) {
      const withQuantity = product.variants.filter((variant) => variant.quantityValue !== undefined);
      const prices = withQuantity.map((variant) => ({
        quantity: variant.quantityValue!,
        price: Math.min(...OFFERS
          .filter((offer) => offer.variantId === variant.id)
          .map((offer) => offer.price.current.amountMinor)),
      }));
      for (let i = 1; i < prices.length; i += 1) {
        if (prices[i].quantity > prices[i - 1].quantity) {
          expect(prices[i].price)
            .withContext(`${product.id} variant ordering`)
            .toBeGreaterThan(prices[i - 1].price);
        }
      }
    }
  });
});

/** Guards the currency invariant that the whole cart depends on. */
describe('offer pricing invariants', () => {
  it('uses integer minor units everywhere', () => {
    for (const offer of OFFERS) {
      expect(Number.isInteger(offer.price.current.amountMinor)).withContext(offer.id).toBeTrue();
    }
  });

  it('matches fromMajor for a known price point', () => {
    const coin100k = OFFERS.find((offer) => offer.variantId === 'prod-fc-coins__100k')!;
    expect(coin100k.price.current).toEqual(fromMajor(15)); // the launch ladder price
  });
});
