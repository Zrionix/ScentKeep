// ---------------------------------------------------------------------------
// Core domain types. Deliberately free of any Supabase / React Native import so
// the pure logic in src/domain stays unit-testable with no native modules.
// ---------------------------------------------------------------------------

import type { Occasion, ScentFamily, Season } from '@/theme';

/** ISO-8601 calendar date, `YYYY-MM-DD`, in the user's local zone. */
export type IsoDate = string;

/** A 1–5 user rating. 0 means "not rated". */
export type Rating = 0 | 1 | 2 | 3 | 4 | 5;

export interface Fragrance {
  id: string;
  /** Bottle name, e.g. "Bleu de Chanel". Required. */
  name: string;
  /** House / brand, e.g. "Chanel". */
  brand: string;
  /** Local URI or Supabase storage URL for the bottle photo. */
  photoUrl: string | null;
  /** Free-text or comma-tagged note pyramid. */
  notesTop: string | null;
  notesHeart: string | null;
  notesBase: string | null;
  /** Olfactory family. Free text is allowed; known values get a themed color. */
  family: ScentFamily | string | null;
  sizeMl: number | null;
  /** Purchase price in `currency` minor-unit-free decimal (e.g. 129.5). */
  price: number | null;
  currency: string;
  purchaseDate: IsoDate | null;
  seasons: Season[];
  occasions: Occasion[];
  longevity: Rating;
  sillage: Rating;
  /** Overall personal rating. */
  rating: Rating;
  /** True while the bottle lives on the wishlist rather than the shelf. */
  inWishlist: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SotdEntry {
  id: string;
  fragranceId: string;
  /** The calendar day this wear is logged against. */
  date: IsoDate;
  occasion: Occasion | string | null;
  weather: string | null;
  mood: string | null;
  note: string | null;
  /** How the wear actually went, rated after the fact. Optional. */
  rating: Rating;
  createdAt: string;
}

export interface Settings {
  reminderEnabled: boolean;
  /** Local time of the daily SOTD nudge, `HH:mm` 24h. */
  reminderTime: string;
  rediscoverEnabled: boolean;
  themePreference: 'system' | 'dark' | 'light';
  currency: string;
  /** Onboarding answers, kept for personalisation. */
  favoriteFamilies: string[];
  collectionSizeBand: string | null;
  onboardedAt: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  reminderEnabled: true,
  reminderTime: '09:00',
  rediscoverEnabled: true,
  themePreference: 'system',
  currency: 'USD',
  favoriteFamilies: [],
  collectionSizeBand: null,
  onboardedAt: null,
};

/** Shape used by the add/edit form before an id exists. */
export type FragranceDraft = Omit<Fragrance, 'id' | 'createdAt' | 'updatedAt'>;

export function emptyDraft(overrides: Partial<FragranceDraft> = {}): FragranceDraft {
  return {
    name: '',
    brand: '',
    photoUrl: null,
    notesTop: null,
    notesHeart: null,
    notesBase: null,
    family: null,
    sizeMl: null,
    price: null,
    currency: 'USD',
    purchaseDate: null,
    seasons: [],
    occasions: [],
    longevity: 0,
    sillage: 0,
    rating: 0,
    inWishlist: false,
    notes: null,
    ...overrides,
  };
}
