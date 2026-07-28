import { DateTime } from 'luxon';
import { makeEntry, makeFragrance } from './fixtures';
import {
  averageWearsPerWeek,
  collectionValue,
  familyBreakdown,
  neglectedBottles,
  rotation,
  seasonBreakdown,
  summarise,
  totalVolumeMl,
  wearCounts,
  wearCountsIncludingUnworn,
} from './stats';

// A fixed "now" keeps every day-arithmetic assertion deterministic.
const NOW = DateTime.fromISO('2026-07-28T12:00:00', { zone: 'utc' });
const daysAgo = (n: number) => NOW.minus({ days: n }).toISODate()!;

describe('collectionValue', () => {
  it('sums only priced, owned bottles and reports what it left out', () => {
    const v = collectionValue([
      makeFragrance({ id: 'a', price: 100 }),
      makeFragrance({ id: 'b', price: 29.99 }),
      makeFragrance({ id: 'c', price: null }), // unpriced — must not be counted
      makeFragrance({ id: 'd', price: 500, inWishlist: true }), // wishlist — not owned
    ]);
    expect(v.total).toBe(129.99);
    expect(v.pricedCount).toBe(2);
    expect(v.unpricedCount).toBe(1);
    expect(v.average).toBe(65);
  });

  it('avoids float drift when summing decimal prices', () => {
    const v = collectionValue([
      makeFragrance({ id: 'a', price: 0.1 }),
      makeFragrance({ id: 'b', price: 0.2 }),
    ]);
    expect(v.total).toBe(0.3); // not 0.30000000000000004
  });

  it('falls back to the settings currency when bottles disagree', () => {
    const v = collectionValue(
      [
        makeFragrance({ id: 'a', price: 100, currency: 'USD' }),
        makeFragrance({ id: 'b', price: 100, currency: 'EUR' }),
      ],
      'GBP',
    );
    expect(v.currency).toBe('GBP');
  });

  it('uses the shared currency when every priced bottle agrees', () => {
    const v = collectionValue(
      [
        makeFragrance({ id: 'a', price: 100, currency: 'EUR' }),
        makeFragrance({ id: 'b', price: 50, currency: 'EUR' }),
      ],
      'USD',
    );
    expect(v.currency).toBe('EUR');
  });

  it('returns a zeroed summary for an empty collection', () => {
    const v = collectionValue([]);
    expect(v).toMatchObject({ total: 0, pricedCount: 0, unpricedCount: 0, average: 0 });
  });

  it('ignores a zero or negative price rather than counting it as priced', () => {
    const v = collectionValue([makeFragrance({ id: 'a', price: 0 })]);
    expect(v.pricedCount).toBe(0);
    expect(v.unpricedCount).toBe(1);
  });
});

describe('totalVolumeMl', () => {
  it('adds owned bottle sizes and skips the wishlist', () => {
    expect(
      totalVolumeMl([
        makeFragrance({ id: 'a', sizeMl: 100 }),
        makeFragrance({ id: 'b', sizeMl: 50 }),
        makeFragrance({ id: 'c', sizeMl: 200, inWishlist: true }),
        makeFragrance({ id: 'd', sizeMl: null }),
      ]),
    ).toBe(150);
  });
});

describe('wearCounts', () => {
  const frags = [makeFragrance({ id: 'a', price: 100 }), makeFragrance({ id: 'b' })];
  const entries = [
    makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(1) }),
    makeEntry({ id: '2', fragranceId: 'a', date: daysAgo(5) }),
    makeEntry({ id: '3', fragranceId: 'a', date: daysAgo(9) }),
    makeEntry({ id: '4', fragranceId: 'b', date: daysAgo(2) }),
  ];

  it('counts wears and tracks the most recent date', () => {
    const [top, second] = wearCounts(frags, entries);
    expect(top.fragranceId).toBe('a');
    expect(top.wears).toBe(3);
    expect(top.lastWorn).toBe(daysAgo(1));
    expect(second.fragranceId).toBe('b');
    expect(second.wears).toBe(1);
  });

  it('computes cost-per-wear only when a price exists', () => {
    const [a, b] = wearCounts(frags, entries);
    expect(a.costPerWear).toBeCloseTo(33.33, 2);
    expect(b.costPerWear).toBeNull();
  });

  it('breaks a tie by the more recent wear', () => {
    const tied = wearCounts(
      [makeFragrance({ id: 'x' }), makeFragrance({ id: 'y' })],
      [
        makeEntry({ id: '1', fragranceId: 'x', date: daysAgo(10) }),
        makeEntry({ id: '2', fragranceId: 'y', date: daysAgo(1) }),
      ],
    );
    expect(tied[0].fragranceId).toBe('y');
  });

  it('omits bottles that were never worn', () => {
    expect(wearCounts([makeFragrance({ id: 'never' })], [])).toEqual([]);
  });

  it('includes never-worn owned bottles when asked to', () => {
    const all = wearCountsIncludingUnworn(
      [makeFragrance({ id: 'a' }), makeFragrance({ id: 'never' })],
      [makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(1) })],
    );
    expect(all).toHaveLength(2);
    expect(all.find((w) => w.fragranceId === 'never')).toMatchObject({ wears: 0, lastWorn: null });
  });

  it('still counts wears for a bottle that has since been deleted', () => {
    // The diary is history: a wear logged against a bottle no longer in the
    // wardrobe must not silently vanish from the totals.
    const orphaned = wearCounts([], [makeEntry({ id: '1', fragranceId: 'gone', date: daysAgo(3) })]);
    expect(orphaned).toHaveLength(1);
    expect(orphaned[0].fragrance).toBeUndefined();
    expect(orphaned[0].wears).toBe(1);
  });
});

describe('neglectedBottles', () => {
  it('lists never-worn bottles first, then longest-neglected', () => {
    const frags = [
      makeFragrance({ id: 'fresh' }),
      makeFragrance({ id: 'stale' }),
      makeFragrance({ id: 'ancient' }),
      makeFragrance({ id: 'never' }),
    ];
    const entries = [
      makeEntry({ id: '1', fragranceId: 'fresh', date: daysAgo(3) }),
      makeEntry({ id: '2', fragranceId: 'stale', date: daysAgo(100) }),
      makeEntry({ id: '3', fragranceId: 'ancient', date: daysAgo(400) }),
    ];
    const result = neglectedBottles(frags, entries, 90, NOW);
    expect(result.map((n) => n.fragrance.id)).toEqual(['never', 'ancient', 'stale']);
    expect(result[0].daysSinceWorn).toBeNull();
    expect(result[1].daysSinceWorn).toBe(400);
  });

  it('treats exactly the threshold as neglected', () => {
    const result = neglectedBottles(
      [makeFragrance({ id: 'edge' })],
      [makeEntry({ id: '1', fragranceId: 'edge', date: daysAgo(90) })],
      90,
      NOW,
    );
    expect(result).toHaveLength(1);
  });

  it('does not flag a bottle worn one day inside the threshold', () => {
    const result = neglectedBottles(
      [makeFragrance({ id: 'edge' })],
      [makeEntry({ id: '1', fragranceId: 'edge', date: daysAgo(89) })],
      90,
      NOW,
    );
    expect(result).toEqual([]);
  });

  it('never nags about a wishlist bottle — you do not own it yet', () => {
    const result = neglectedBottles([makeFragrance({ id: 'want', inWishlist: true })], [], 90, NOW);
    expect(result).toEqual([]);
  });
});

describe('rotation', () => {
  it('counts distinct owned bottles worn inside the window', () => {
    const frags = [
      makeFragrance({ id: 'a' }),
      makeFragrance({ id: 'b' }),
      makeFragrance({ id: 'c' }),
      makeFragrance({ id: 'd' }),
    ];
    const entries = [
      makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(1) }),
      makeEntry({ id: '2', fragranceId: 'a', date: daysAgo(2) }), // same bottle, not distinct
      makeEntry({ id: '3', fragranceId: 'b', date: daysAgo(10) }),
      makeEntry({ id: '4', fragranceId: 'c', date: daysAgo(45) }), // outside window
    ];
    const r = rotation(frags, entries, 30, NOW);
    expect(r.distinctWorn).toBe(2);
    expect(r.owned).toBe(4);
    expect(r.ratio).toBe(0.5);
  });

  it('excludes wishlist bottles from both sides of the ratio', () => {
    const r = rotation(
      [makeFragrance({ id: 'a' }), makeFragrance({ id: 'w', inWishlist: true })],
      [
        makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(1) }),
        makeEntry({ id: '2', fragranceId: 'w', date: daysAgo(1) }),
      ],
      30,
      NOW,
    );
    expect(r).toMatchObject({ distinctWorn: 1, owned: 1, ratio: 1 });
  });

  it('does not divide by zero on an empty shelf', () => {
    expect(rotation([], [], 30, NOW).ratio).toBe(0);
  });
});

describe('breakdowns', () => {
  it('groups owned bottles by family, ignoring blanks and the wishlist', () => {
    const b = familyBreakdown([
      makeFragrance({ id: 'a', family: 'Woody' }),
      makeFragrance({ id: 'b', family: 'Woody' }),
      makeFragrance({ id: 'c', family: 'Floral' }),
      makeFragrance({ id: 'd', family: '   ' }),
      makeFragrance({ id: 'e', family: null }),
      makeFragrance({ id: 'f', family: 'Amber', inWishlist: true }),
    ]);
    expect(b).toEqual([
      { label: 'Woody', count: 2, share: 0.67 },
      { label: 'Floral', count: 1, share: 0.33 },
    ]);
  });

  it('counts a multi-season bottle once per season tag', () => {
    const b = seasonBreakdown([
      makeFragrance({ id: 'a', seasons: ['Summer', 'Spring'] }),
      makeFragrance({ id: 'b', seasons: ['Summer'] }),
    ]);
    expect(b.find((x) => x.label === 'Summer')?.count).toBe(2);
    expect(b.find((x) => x.label === 'Spring')?.count).toBe(1);
  });
});

describe('averageWearsPerWeek', () => {
  it('returns zero for an empty diary', () => {
    expect(averageWearsPerWeek([], NOW)).toBe(0);
  });

  it('uses a one-week floor so a brand-new diary is not wildly extrapolated', () => {
    // 3 wears over 2 days would be 10.5/week if measured literally.
    const entries = [
      makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(0) }),
      makeEntry({ id: '2', fragranceId: 'b', date: daysAgo(1) }),
      makeEntry({ id: '3', fragranceId: 'c', date: daysAgo(1) }),
    ];
    expect(averageWearsPerWeek(entries, NOW)).toBe(3);
  });

  it('averages correctly over a longer span', () => {
    // Earliest wear is 27 days ago, so the span is 28 days: 14 / 28 * 7 = 3.5.
    const entries = Array.from({ length: 14 }, (_, i) =>
      makeEntry({ id: String(i), fragranceId: 'a', date: daysAgo(i * 2 + 1) }),
    );
    expect(averageWearsPerWeek(entries, NOW)).toBe(3.5);
  });
});

describe('summarise', () => {
  it('assembles a full summary and picks the best cost-per-wear bottle', () => {
    const frags = [
      makeFragrance({ id: 'cheap', price: 30, family: 'Fresh', seasons: ['Summer'] }),
      makeFragrance({ id: 'lux', price: 400, family: 'Amber', seasons: ['Winter'] }),
      makeFragrance({ id: 'want', price: 900, inWishlist: true }),
    ];
    const entries = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeEntry({ id: `c${i}`, fragranceId: 'cheap', date: daysAgo(i) }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makeEntry({ id: `l${i}`, fragranceId: 'lux', date: daysAgo(i + 20) }),
      ),
    ];

    const s = summarise(frags, entries, 'USD', NOW);
    expect(s.bottles).toBe(2);
    expect(s.wishlist).toBe(1);
    expect(s.value.total).toBe(430); // wishlist bottle excluded
    expect(s.totalWears).toBe(14);
    expect(s.mostWorn[0].fragranceId).toBe('cheap');
    expect(s.bestValue?.fragranceId).toBe('cheap'); // $3/wear vs $100/wear
  });

  it('requires at least 3 wears before crowning a best-value bottle', () => {
    const s = summarise(
      [makeFragrance({ id: 'a', price: 10 })],
      [
        makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(1) }),
        makeEntry({ id: '2', fragranceId: 'a', date: daysAgo(2) }),
      ],
      'USD',
      NOW,
    );
    expect(s.bestValue).toBeNull();
  });

  it('survives a completely empty collection without throwing', () => {
    const s = summarise([], [], 'USD', NOW);
    expect(s).toMatchObject({ bottles: 0, wishlist: 0, totalWears: 0, bestValue: null });
    expect(s.mostWorn).toEqual([]);
    expect(s.neglected).toEqual([]);
  });
});
