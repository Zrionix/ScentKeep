import { bottleLevel } from './bottleLevel';
import { summarise } from './stats';
import { withDefaults, type Fragrance } from './types';
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
