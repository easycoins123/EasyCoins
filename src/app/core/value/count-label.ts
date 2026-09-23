/**
 * Hebrew count phrases for the storefront's few countable nouns.
 *
 * "1 פריטים" is the kind of detail a customer notices and a template forgets.
 * One place decides the singular, so the cart, the checkout ticket and the
 * order page agree.
 */
export function itemsLabel(count: number): string {
  return count === 1 ? 'פריט אחד' : `${count} פריטים`;
}

export function packagesLabel(count: number): string {
  return count === 1 ? 'חבילה אחת' : `${count} חבילות`;
}
