// ---------------------------------------------------------------------------
// Core domain types. Deliberately free of any Supabase / React Native import so
// the pure logic in src/domain stays unit-testable with no native modules.
// ---------------------------------------------------------------------------

import type { Occasion, ScentFamily, Season } from '@/theme';

/**
 * Default sprays per wear. Lives here rather than in bottleLevel.ts because it
 * is the default for a FIELD on Fragrance — putting it in the depletion module
 * would make types.ts and bottleLevel.ts import each other.
 */
export const DEFAULT_SPRAYS_PER_WEAR = 2;

/** ISO-8601 calendar date, `YYYY-MM-DD`, in the user's local zone. */
export type IsoDate = string;

/** A 1–5 user rating. 0 means "not rated". */
export type Rating = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * What the container actually is. Collectors buy far more decants than full
 * bottles, and lumping them together wrecks both collection value and any
 * sense of what is really on the shelf.
 */
export const ITEM_TYPES = ['bottle', 'decant', 'sample'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  bottle: 'Full bottle',
  decant: 'Decant',
  sample: 'Sample',
};

/** Concentration. Appears in every collector spreadsheet schema. */
export const CONCENTRATIONS = ['EDC', 'EDT', 'EDP', 'Parfum', 'Extrait', 'Oil'] as const;
export type Concentration = (typeof CONCENTRATIONS)[number];

/** How the house is positioned. The other universal collector field. */
export const HOUSE_TIERS = ['Designer', 'Niche', 'Indie', 'Celebrity', 'Clone'] as const;
export type HouseTier = (typeof HOUSE_TIERS)[number];

/**
 * Collectors keep two separate lists: things they intend to BUY, and things
 * they want to SMELL first. Conflating them makes the wishlist useless as a
 * shopping list.
 */
export const WISHLIST_KINDS = ['buy', 'sniff'] as const;
export type WishlistKind = (typeof WISHLIST_KINDS)[number];

export const WISHLIST_KIND_LABELS: Record<WishlistKind, string> = {
  buy: 'To buy',
  sniff: 'To try',
};

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
  /** Which wishlist it is on. Only meaningful when `inWishlist` is true. */
  wishlistKind: WishlistKind;
  notes: string | null;

  /** Full bottle, decant, or sample. */
  type: ItemType;
  concentration: Concentration | null;
  houseTier: HouseTier | null;

  /** Sprays used per wear — the input to the depletion estimate. */
  spraysPerWear: number;
  /**
   * A level the user has MEASURED, in ml, overriding the estimate. Depletion
   * then counts only wears logged after `remainingMlAt`, so a correction is
   * not immediately undone by the wear history that preceded it.
   */
  remainingMl: number | null;
  remainingMlAt: string | null;

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
  /**
   * When we last offered to turn on the daily reminder, or null if never.
   *
   * Exists so the offer is made ONCE. iOS only shows its permission sheet once
   * per install, so a second ask is either a no-op or nagging — and nagging for
   * notifications is a well-earned uninstall.
   *
   * Deliberately NOT synced (sync.ts maps settings columns explicitly and this
   * is not among them). It describes THIS install's permission state, and a new
   * phone has never been asked — syncing it would suppress the ask on the one
   * device where it still has something to gain.
   */
  reminderPromptedAt: string | null;
  themePreference: 'system' | 'dark' | 'light';
  currency: string;
  /** Onboarding answers, kept for personalisation. */
  favoriteFamilies: string[];
  collectionSizeBand: string | null;
  onboardedAt: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  /**
   * OFF on a fresh install, and this is load-bearing.
   *
   * It used to default true, which meant bootstrap() called syncReminders() on
   * the very first launch, which called requestPermission(), which put the iOS
   * system alert on screen ON TOP of the welcome screen — before the user had
   * added a single bottle or had any reason to want a reminder.
   *
   * iOS shows that alert ONCE PER INSTALL. A user who taps "Don't Allow" can
   * never be asked again: requestPermission() sees 'denied' and returns early
   * forever. Spending the one prompt a habit app gets, unprimed, in the first
   * three seconds, is the worst possible use of it.
   *
   * The ask now happens after the first Scent of the Day is logged — the moment
   * the user has demonstrated the exact habit the reminder reinforces.
   */
  reminderEnabled: false,
  reminderTime: '09:00',
  rediscoverEnabled: true,
  reminderPromptedAt: null,
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
    wishlistKind: 'buy',
    notes: null,
    type: 'bottle',
    concentration: null,
    houseTier: null,
    spraysPerWear: DEFAULT_SPRAYS_PER_WEAR,
    remainingMl: null,
    remainingMlAt: null,
    ...overrides,
  };
}

/**
 * Fills in settings fields added after a user's data was first written.
 *
 * The fragrance equivalent (`withDefaults`) has existed since the collector
 * fields landed; settings had no such guard, so `reminderPromptedAt` would have
 * rehydrated as `undefined` for every existing user and the "have we asked yet"
 * check would have read as a falsy never-asked forever.
 */
export function settingsWithDefaults(s: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

/**
 * Fills in fields added after a user's data was first written. Anything loaded
 * from disk or from the cloud goes through this, so a collection saved by an
 * older build doesn't arrive with `undefined` where the code expects a value.
 */
export function withDefaults(f: Partial<Fragrance> & { id: string }): Fragrance {
  return {
    ...emptyDraft(),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...f,
    // Explicitly defaulted because a spread of `undefined` still overwrites.
    type: f.type ?? 'bottle',
    wishlistKind: f.wishlistKind ?? 'buy',
    concentration: f.concentration ?? null,
    houseTier: f.houseTier ?? null,
    spraysPerWear: f.spraysPerWear ?? DEFAULT_SPRAYS_PER_WEAR,
    remainingMl: f.remainingMl ?? null,
    remainingMlAt: f.remainingMlAt ?? null,
  } as Fragrance;
}
