import { bottleLevel } from './bottleLevel';
import { summarise } from './stats';
import { DEFAULT_SETTINGS, settingsWithDefaults, withDefaults, type Fragrance, type Settings } from './types';
import { applyFilter, EMPTY_FILTER } from './wardrobe';

// ---------------------------------------------------------------------------
// Upgrade safety.
//
// A user who installed the earlier build has a collection on disk with none of
// the collector fields. Every one of these tests feeds the app a row shaped
// like THAT and checks nothing explodes — this is the path real users take on
// update, and it is invisible in normal testing because fresh installs always
// have complete data.
// ---------------------------------------------------------------------------

/** A row exactly as the previous version persisted it. */
const legacyRow = {
  id: 'legacy-1',
  name: 'Aventus',
  brand: 'Creed',
  photoUrl: null,
  notesTop: null,
  notesHeart: null,
  notesBase: null,
  family: 'Chypre',
  sizeMl: 100,
  price: 445,
  currency: 'USD',
  purchaseDate: null,
  seasons: [],
  occasions: [],
  longevity: 4,
  sillage: 5,
  rating: 5,
  inWishlist: false,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as unknown as Fragrance;

describe('withDefaults', () => {
  it('backfills every field added after the user first saved', () => {
    const f = withDefaults(legacyRow);
    expect(f.type).toBe('bottle');
    expect(f.wishlistKind).toBe('buy');
    expect(f.concentration).toBeNull();
    expect(f.houseTier).toBeNull();
    expect(f.spraysPerWear).toBe(2);
    expect(f.remainingMl).toBeNull();
    expect(f.remainingMlAt).toBeNull();
  });

  it('does not disturb what the user actually entered', () => {
    const f = withDefaults(legacyRow);
    expect(f.name).toBe('Aventus');
    expect(f.price).toBe(445);
    expect(f.rating).toBe(5);
    expect(f.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not overwrite a value that IS set', () => {
    const f = withDefaults({ ...legacyRow, type: 'decant', spraysPerWear: 5 } as Fragrance);
    expect(f.type).toBe('decant');
    expect(f.spraysPerWear).toBe(5);
  });

  it('survives a row with almost nothing on it', () => {
    const f = withDefaults({ id: 'bare' } as Fragrance);
    expect(f.type).toBe('bottle');
    expect(f.spraysPerWear).toBe(2);
    expect(f.seasons).toEqual([]);
  });
});

describe('legacy data flows through the new features', () => {
  it('computes a bottle level for a row that never had the fields', () => {
    const f = withDefaults(legacyRow);
    const level = bottleLevel(f, []);
    expect(level).not.toBeNull();
    expect(level!.remainingMl).toBe(100);
  });

  it('summarises without throwing', () => {
    const s = summarise([withDefaults(legacyRow)], [], 'USD');
    expect(s.bottles).toBe(1);
    expect(s.types).toEqual([{ label: 'bottle', count: 1, share: 1 }]);
    expect(s.concentrations).toEqual([]);
    expect(s.houseTiers).toEqual([]);
  });

  it('filters and sorts without throwing', () => {
    expect(applyFilter([withDefaults(legacyRow)], EMPTY_FILTER)).toHaveLength(1);
  });

  it('would crash on the RAW legacy row, which is why withDefaults exists', () => {
    // Documents the actual hazard: the un-migrated row has `type: undefined`,
    // so it is not excluded as a sample and reaches the level maths with
    // missing fields. This asserts the shape difference is real, not theoretical.
    expect((legacyRow as Partial<Fragrance>).type).toBeUndefined();
    expect((legacyRow as Partial<Fragrance>).spraysPerWear).toBeUndefined();
    expect(withDefaults(legacyRow).type).toBe('bottle');
  });
});

// ---------------------------------------------------------------------------
// Settings had no upgrade guard at all until reminderPromptedAt needed one.
//
// Fragrances have had `withDefaults` since the collector fields landed. Settings
// were persisted the same way and never backfilled, so every field added to
// Settings after 1.0 rehydrates as `undefined` for existing users. For a
// "have we asked yet" flag that is not cosmetic: undefined is falsy, so the
// answer is "never asked" forever and the user is offered reminders after every
// single log.
// ---------------------------------------------------------------------------
describe('settingsWithDefaults', () => {
  /** Settings exactly as 1.0 persisted them — no reminderPromptedAt. */
  const legacySettings = {
    reminderEnabled: true,
    reminderTime: '09:00',
    rediscoverEnabled: true,
    themePreference: 'system',
    currency: 'USD',
    favoriteFamilies: [],
    collectionSizeBand: null,
    onboardedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as Settings;

  it('fills in a field the stored settings predate', () => {
    expect((legacySettings as Partial<Settings>).reminderPromptedAt).toBeUndefined();
    expect(settingsWithDefaults(legacySettings).reminderPromptedAt).toBeNull();
  });

  it('keeps everything the user actually chose', () => {
    const s = settingsWithDefaults({ ...legacySettings, currency: 'GBP', reminderTime: '07:30' });
    expect(s.currency).toBe('GBP');
    expect(s.reminderTime).toBe('07:30');
    expect(s.onboardedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not resurrect a prompt that was already answered', () => {
    const answered = settingsWithDefaults({ ...legacySettings, reminderPromptedAt: '2026-02-02T09:00:00.000Z' });
    expect(answered.reminderPromptedAt).toBe('2026-02-02T09:00:00.000Z');
  });

  it('survives settings missing entirely', () => {
    expect(settingsWithDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(settingsWithDefaults({})).toEqual(DEFAULT_SETTINGS);
  });

  it('ships with reminders OFF, because the ask is earned elsewhere', () => {
    // Load-bearing. With this true, bootstrap() triggered the iOS permission
    // sheet on first launch, on top of onboarding, before the user had added a
    // single bottle — and iOS grants exactly one such sheet per install.
    expect(DEFAULT_SETTINGS.reminderEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.reminderPromptedAt).toBeNull();
  });
});
