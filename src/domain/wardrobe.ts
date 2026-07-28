import type { Fragrance } from './types';

// ---------------------------------------------------------------------------
// Search, filter and sort for the wardrobe grid. Pure and synchronous — the
// whole collection lives in memory (a big collector has hundreds of bottles,
// not millions), so filtering client-side keeps the grid instant and offline.
// ---------------------------------------------------------------------------

export type SortKey = 'recent' | 'name' | 'brand' | 'rating' | 'priceHigh' | 'priceLow';

export const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Recently added',
  name: 'Name A–Z',
  brand: 'House A–Z',
  rating: 'Highest rated',
  priceHigh: 'Price: high to low',
  priceLow: 'Price: low to high',
};

export interface WardrobeFilter {
  /** Free-text query matched against name, house and notes. */
  query: string;
  families: string[];
  seasons: string[];
  occasions: string[];
  /** Only bottles rated at least this. 0 = no filter. */
  minRating: number;
  sort: SortKey;
}

export const EMPTY_FILTER: WardrobeFilter = {
  query: '',
  families: [],
  seasons: [],
  occasions: [],
  minRating: 0,
  sort: 'recent',
};

/** True when the filter would change what the grid shows. */
export function isFilterActive(f: WardrobeFilter): boolean {
  return (
    f.query.trim().length > 0 ||
    f.families.length > 0 ||
    f.seasons.length > 0 ||
    f.occasions.length > 0 ||
    f.minRating > 0
  );
}

export function activeFilterCount(f: WardrobeFilter): number {
  return (
    f.families.length + f.seasons.length + f.occasions.length + (f.minRating > 0 ? 1 : 0)
  );
}

function normalise(s: string): string {
  // Fold diacritics so "Acqua di Gio" finds "Acqua di Giò" and "Fougere" finds
  // "Fougère" — fragrance names are full of accents and nobody types them on a
  // phone keyboard. U+0300-U+036F is the combining-diacritical-marks block that
  // NFD decomposition splits accents into.
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function matchesQuery(f: Fragrance, query: string): boolean {
  const q = normalise(query);
  if (!q) return true;
  // Every whitespace-separated term must appear somewhere, so "tom oud" finds
  // "Oud Wood" by Tom Ford without needing the words adjacent or in order.
  const haystack = normalise(
    [f.name, f.brand, f.family ?? '', f.notesTop ?? '', f.notesHeart ?? '', f.notesBase ?? '', f.notes ?? '']
      .join(' '),
  );
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

function compare(a: Fragrance, b: Fragrance, sort: SortKey): number {
  switch (sort) {
    case 'name':
      return a.name.localeCompare(b.name);
    case 'brand':
      // Within a house, keep the bottles alphabetical too.
      return a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name);
    case 'rating':
      return b.rating - a.rating || a.name.localeCompare(b.name);
    case 'priceHigh':
      // Unpriced bottles sink to the bottom of a price sort rather than
      // masquerading as free.
      return (b.price ?? -Infinity) - (a.price ?? -Infinity) || a.name.localeCompare(b.name);
    case 'priceLow':
      return (a.price ?? Infinity) - (b.price ?? Infinity) || a.name.localeCompare(b.name);
    case 'recent':
    default:
      return b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name);
  }
}

/** Applies a filter to a list of bottles. Does NOT split wardrobe vs wishlist —
 *  the caller passes whichever set it is showing. */
export function applyFilter(fragrances: Fragrance[], filter: WardrobeFilter): Fragrance[] {
  const out = fragrances.filter((f) => {
    if (!matchesQuery(f, filter.query)) return false;
    if (filter.families.length && !filter.families.includes(f.family ?? '')) return false;
    // Season / occasion filters are OR within a facet: picking Summer and Winter
    // means "wearable in either", which is what a wearer means by it.
    if (filter.seasons.length && !filter.seasons.some((s) => f.seasons.includes(s as never))) {
      return false;
    }
    if (filter.occasions.length && !filter.occasions.some((o) => f.occasions.includes(o as never))) {
      return false;
    }
    if (filter.minRating > 0 && f.rating < filter.minRating) return false;
    return true;
  });
  return out.sort((a, b) => compare(a, b, filter.sort));
}

/** Distinct houses in the collection, alphabetical — powers the filter sheet. */
export function distinctBrands(fragrances: Fragrance[]): string[] {
  return [...new Set(fragrances.map((f) => f.brand).filter((b) => b.trim().length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** Distinct families actually present, so the filter sheet only offers real options. */
export function distinctFamilies(fragrances: Fragrance[]): string[] {
  return [
    ...new Set(fragrances.map((f) => f.family).filter((f): f is string => Boolean(f && f.trim()))),
  ].sort((a, b) => a.localeCompare(b));
}

/**
 * Validation shared by the add and edit forms. Returns a field->message map;
 * empty means valid. Mirrors the database CHECK constraints so a user gets a
 * readable message instead of a Postgres error.
 */
export function validateFragrance(draft: {
  name: string;
  brand: string;
  sizeMl: number | null;
  price: number | null;
}): Record<string, string> {
  const errors: Record<string, string> = {};

  const name = draft.name.trim();
  if (!name) errors.name = 'Give the bottle a name.';
  else if (name.length > 120) errors.name = 'Keep the name under 120 characters.';

  if (draft.brand.length > 120) errors.brand = 'Keep the house under 120 characters.';

  if (draft.sizeMl !== null) {
    if (!Number.isFinite(draft.sizeMl) || draft.sizeMl <= 0) errors.sizeMl = 'Size must be above 0 ml.';
    else if (draft.sizeMl > 10000) errors.sizeMl = 'That is a lot of juice — 10,000 ml is the max.';
  }

  if (draft.price !== null) {
    if (!Number.isFinite(draft.price) || draft.price < 0) errors.price = 'Price cannot be negative.';
    else if (draft.price > 1000000) errors.price = 'Price is out of range.';
  }

  return errors;
}
