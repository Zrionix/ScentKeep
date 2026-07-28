import type { Fragrance, FragranceDraft, SotdEntry } from './types';
import { emptyDraft } from './types';

// ---------------------------------------------------------------------------
// Test + demo fixtures. Also used by the screenshot seeder so store screenshots
// show the same believable collection the tests reason about.
// ---------------------------------------------------------------------------

export function makeFragrance(overrides: Partial<Fragrance> & { id: string }): Fragrance {
  const draft: FragranceDraft = emptyDraft();
  return {
    ...draft,
    name: 'Test Bottle',
    brand: 'Test House',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Fragrance;
}

/** Convenience for the many tests that only care about a bottle's size. */
export function makeBottle(id: string, sizeMl: number, over: Partial<Fragrance> = {}): Fragrance {
  return makeFragrance({ id, sizeMl, ...over });
}

export function makeEntry(overrides: Partial<SotdEntry> & { id: string; fragranceId: string; date: string }): SotdEntry {
  return {
    occasion: null,
    weather: null,
    mood: null,
    note: null,
    rating: 0,
    createdAt: `${overrides.date}T09:00:00.000Z`,
    ...overrides,
  };
}

/** A believable starter collection used for demo mode and store screenshots. */
export const DEMO_FRAGRANCES: Fragrance[] = [
  makeFragrance({
    id: 'demo-1',
    name: 'Sauvage',
    brand: 'Dior',
    family: 'Fresh',
    sizeMl: 100,
    price: 118,
    seasons: ['Spring', 'Summer'],
    occasions: ['Daily', 'Work'],
    longevity: 4,
    sillage: 4,
    rating: 4,
    notesTop: 'Bergamot, Pepper',
    notesHeart: 'Lavender, Geranium',
    notesBase: 'Ambroxan, Cedar',
  }),
  makeFragrance({
    id: 'demo-2',
    name: 'Tobacco Vanille',
    brand: 'Tom Ford',
    family: 'Gourmand',
    sizeMl: 50,
    price: 285,
    seasons: ['Autumn', 'Winter'],
    occasions: ['Evening', 'Date'],
    longevity: 5,
    sillage: 5,
    rating: 5,
    notesTop: 'Tobacco Leaf, Spices',
    notesHeart: 'Vanilla, Cacao',
    notesBase: 'Dried Fruits, Woods',
  }),
  makeFragrance({
    id: 'demo-3',
    name: 'Bleu de Chanel',
    brand: 'Chanel',
    family: 'Woody',
    sizeMl: 100,
    price: 135,
    seasons: ['Autumn', 'Winter'],
    occasions: ['Work', 'Formal'],
    longevity: 4,
    sillage: 3,
    rating: 4,
  }),
  makeFragrance({
    id: 'demo-4',
    name: 'Light Blue',
    brand: 'Dolce & Gabbana',
    family: 'Citrus',
    sizeMl: 75,
    price: 92,
    seasons: ['Summer'],
    occasions: ['Daily', 'Travel'],
    longevity: 2,
    sillage: 3,
    rating: 3,
  }),
  makeFragrance({
    id: 'demo-5',
    name: 'Oud Wood',
    brand: 'Tom Ford',
    family: 'Woody',
    sizeMl: 50,
    price: 270,
    seasons: ['Autumn', 'Winter'],
    occasions: ['Evening', 'Special'],
    longevity: 4,
    sillage: 3,
    rating: 5,
  }),
  makeFragrance({
    id: 'demo-6',
    name: 'Aventus',
    brand: 'Creed',
    family: 'Chypre',
    sizeMl: 100,
    price: 445,
    seasons: ['Spring', 'Summer', 'Autumn'],
    occasions: ['Formal', 'Special'],
    longevity: 5,
    sillage: 5,
    rating: 5,
  }),
  makeFragrance({
    id: 'demo-7',
    name: 'Layton',
    brand: 'Parfums de Marly',
    family: 'Amber',
    sizeMl: 125,
    price: 355,
    seasons: ['Autumn', 'Winter'],
    occasions: ['Evening', 'Date'],
    longevity: 5,
    sillage: 4,
    rating: 5,
  }),
  makeFragrance({
    id: 'demo-8',
    name: 'Acqua di Giò Profumo',
    brand: 'Giorgio Armani',
    family: 'Aquatic',
    sizeMl: 75,
    price: 105,
    seasons: ['Summer'],
    occasions: ['Daily'],
    longevity: 3,
    sillage: 3,
    rating: 4,
  }),
  makeFragrance({
    id: 'demo-9',
    name: 'Baccarat Rouge 540',
    brand: 'Maison Francis Kurkdjian',
    family: 'Amber',
    sizeMl: 70,
    price: 325,
    inWishlist: true,
  }),
  makeFragrance({
    id: 'demo-10',
    name: 'Reflection Man',
    brand: 'Amouage',
    family: 'Floral',
    sizeMl: 100,
    price: 390,
    inWishlist: true,
  }),
];
