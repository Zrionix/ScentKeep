import { makeFragrance } from './fixtures';
import {
  activeFilterCount,
  applyFilter,
  distinctBrands,
  distinctFamilies,
  EMPTY_FILTER,
  isFilterActive,
  validateFragrance,
  type WardrobeFilter,
} from './wardrobe';

const filter = (over: Partial<WardrobeFilter> = {}): WardrobeFilter => ({ ...EMPTY_FILTER, ...over });

const COLLECTION = [
  makeFragrance({
    id: 'a',
    name: 'Oud Wood',
    brand: 'Tom Ford',
    family: 'Woody',
    seasons: ['Winter'],
    occasions: ['Evening'],
    rating: 5,
    price: 270,
    createdAt: '2026-01-03T00:00:00.000Z',
  }),
  makeFragrance({
    id: 'b',
    name: 'Acqua di Giò',
    brand: 'Giorgio Armani',
    family: 'Aquatic',
    seasons: ['Summer'],
    occasions: ['Daily'],
    rating: 3,
    price: 105,
    createdAt: '2026-01-02T00:00:00.000Z',
  }),
  makeFragrance({
    id: 'c',
    name: 'Tobacco Vanille',
    brand: 'Tom Ford',
    family: 'Gourmand',
    seasons: ['Winter', 'Autumn'],
    occasions: ['Evening', 'Date'],
    rating: 5,
    price: null,
    notesTop: 'Tobacco Leaf',
    createdAt: '2026-01-01T00:00:00.000Z',
  }),
];

describe('search', () => {
  it('returns everything for an empty query', () => {
    expect(applyFilter(COLLECTION, filter())).toHaveLength(3);
  });

  it('matches on name and on house', () => {
    expect(applyFilter(COLLECTION, filter({ query: 'oud' })).map((f) => f.id)).toEqual(['a']);
    expect(applyFilter(COLLECTION, filter({ query: 'armani' })).map((f) => f.id)).toEqual(['b']);
  });

  it('matches terms in any order, across fields', () => {
    // "tom oud" spans house and name, out of order.
    expect(applyFilter(COLLECTION, filter({ query: 'tom oud' })).map((f) => f.id)).toEqual(['a']);
  });

  it('finds an accented name typed without accents', () => {
    expect(applyFilter(COLLECTION, filter({ query: 'acqua di gio' })).map((f) => f.id)).toEqual(['b']);
  });

  it('searches the note pyramid too', () => {
    expect(applyFilter(COLLECTION, filter({ query: 'tobacco leaf' })).map((f) => f.id)).toEqual(['c']);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(applyFilter(COLLECTION, filter({ query: 'zzzz' }))).toEqual([]);
  });

  it('ignores surrounding whitespace', () => {
    expect(applyFilter(COLLECTION, filter({ query: '   oud   ' })).map((f) => f.id)).toEqual(['a']);
  });
});

describe('facet filters', () => {
  it('filters by family', () => {
    expect(applyFilter(COLLECTION, filter({ families: ['Woody'] })).map((f) => f.id)).toEqual(['a']);
  });

  it('treats multiple seasons as OR', () => {
    const ids = applyFilter(COLLECTION, filter({ seasons: ['Summer', 'Autumn'] })).map((f) => f.id);
    expect(new Set(ids)).toEqual(new Set(['b', 'c']));
  });

  it('treats multiple occasions as OR', () => {
    const ids = applyFilter(COLLECTION, filter({ occasions: ['Daily', 'Date'] })).map((f) => f.id);
    expect(new Set(ids)).toEqual(new Set(['b', 'c']));
  });

  it('combines facets as AND across different facets', () => {
    // Woody AND Summer matches nothing — the Woody bottle is a winter bottle.
    expect(applyFilter(COLLECTION, filter({ families: ['Woody'], seasons: ['Summer'] }))).toEqual([]);
  });

  it('filters by minimum rating', () => {
    expect(applyFilter(COLLECTION, filter({ minRating: 5 })).map((f) => f.id).sort()).toEqual(['a', 'c']);
  });
});

describe('sorting', () => {
  it('defaults to most recently added first', () => {
    expect(applyFilter(COLLECTION, filter({ sort: 'recent' })).map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by name and by house', () => {
    expect(applyFilter(COLLECTION, filter({ sort: 'name' })).map((f) => f.name)).toEqual([
      'Acqua di Giò',
      'Oud Wood',
      'Tobacco Vanille',
    ]);
    expect(applyFilter(COLLECTION, filter({ sort: 'brand' })).map((f) => f.id)).toEqual(['b', 'a', 'c']);
  });

  it('sinks unpriced bottles to the bottom of a high-to-low price sort', () => {
    // An unpriced bottle must never rank as the most expensive OR pose as free.
    expect(applyFilter(COLLECTION, filter({ sort: 'priceHigh' })).map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  it('sinks unpriced bottles to the bottom of a low-to-high price sort too', () => {
    expect(applyFilter(COLLECTION, filter({ sort: 'priceLow' })).map((f) => f.id)).toEqual(['b', 'a', 'c']);
  });

  it('breaks rating ties by name for a stable order', () => {
    expect(applyFilter(COLLECTION, filter({ sort: 'rating' })).map((f) => f.id)).toEqual(['a', 'c', 'b']);
  });

  it('does not mutate the caller’s array', () => {
    const original = [...COLLECTION];
    applyFilter(COLLECTION, filter({ sort: 'name' }));
    expect(COLLECTION).toEqual(original);
  });
});

describe('filter state helpers', () => {
  it('knows when a filter is inert', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    // Sort alone is not a "filter" — it never hides anything.
    expect(isFilterActive(filter({ sort: 'name' }))).toBe(false);
  });

  it('knows when a filter would hide something', () => {
    expect(isFilterActive(filter({ query: 'x' }))).toBe(true);
    expect(isFilterActive(filter({ families: ['Woody'] }))).toBe(true);
    expect(isFilterActive(filter({ minRating: 3 }))).toBe(true);
  });

  it('counts active facets for the filter badge, excluding the text query', () => {
    expect(activeFilterCount(filter({ families: ['Woody'], seasons: ['Summer'], minRating: 4 }))).toBe(3);
    expect(activeFilterCount(filter({ query: 'oud' }))).toBe(0);
  });
});

describe('distinct values', () => {
  it('lists houses alphabetically without duplicates', () => {
    expect(distinctBrands(COLLECTION)).toEqual(['Giorgio Armani', 'Tom Ford']);
  });

  it('lists only families that are actually present', () => {
    expect(distinctFamilies(COLLECTION)).toEqual(['Aquatic', 'Gourmand', 'Woody']);
  });

  it('skips blank houses and families', () => {
    const messy = [makeFragrance({ id: 'x', brand: '', family: null })];
    expect(distinctBrands(messy)).toEqual([]);
    expect(distinctFamilies(messy)).toEqual([]);
  });
});

describe('validateFragrance', () => {
  const valid = { name: 'Aventus', brand: 'Creed', sizeMl: 100, price: 445 };

  it('accepts a well-formed bottle', () => {
    expect(validateFragrance(valid)).toEqual({});
  });

  it('requires a name and rejects a whitespace-only one', () => {
    expect(validateFragrance({ ...valid, name: '' }).name).toBeDefined();
    expect(validateFragrance({ ...valid, name: '   ' }).name).toBeDefined();
  });

  it('mirrors the database length and range limits', () => {
    expect(validateFragrance({ ...valid, name: 'x'.repeat(121) }).name).toBeDefined();
    expect(validateFragrance({ ...valid, brand: 'x'.repeat(121) }).brand).toBeDefined();
    expect(validateFragrance({ ...valid, sizeMl: 0 }).sizeMl).toBeDefined();
    expect(validateFragrance({ ...valid, sizeMl: 10001 }).sizeMl).toBeDefined();
    expect(validateFragrance({ ...valid, price: -1 }).price).toBeDefined();
    expect(validateFragrance({ ...valid, price: 1000001 }).price).toBeDefined();
  });

  it('allows optional numbers to be omitted entirely', () => {
    expect(validateFragrance({ ...valid, sizeMl: null, price: null })).toEqual({});
  });

  it('rejects NaN, which is what an unparsed numeric text field produces', () => {
    expect(validateFragrance({ ...valid, price: Number.NaN }).price).toBeDefined();
    expect(validateFragrance({ ...valid, sizeMl: Number.NaN }).sizeMl).toBeDefined();
  });

  it('accepts a free bottle at exactly zero', () => {
    expect(validateFragrance({ ...valid, price: 0 })).toEqual({});
  });
});
