import { itemsLabel, packagesLabel } from './count-label';

describe('count labels', () => {
  it('uses the singular for one', () => {
    expect(itemsLabel(1)).toBe('פריט אחד');
    expect(packagesLabel(1)).toBe('חבילה אחת');
  });

  it('counts the plural', () => {
    expect(itemsLabel(3)).toBe('3 פריטים');
    expect(packagesLabel(11)).toBe('11 חבילות');
  });
});
