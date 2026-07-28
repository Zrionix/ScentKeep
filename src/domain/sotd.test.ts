import { DateTime } from 'luxon';
import { FREE_LIMITS } from './entitlements';
import { makeEntry, makeFragrance } from './fixtures';
import {
  alreadyLogged,
  currentStreak,
  daysLogged,
  entriesForDate,
  groupByDay,
  hasLoggedToday,
  hiddenHistoryCount,
  longestStreak,
  rediscoverSuggestion,
  visibleHistory,
} from './sotd';

const NOW = DateTime.fromISO('2026-07-28T12:00:00', { zone: 'utc' });
const daysAgo = (n: number) => NOW.minus({ days: n }).toISODate()!;

describe('entriesForDate / hasLoggedToday', () => {
  const entries = [
    makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(0), createdAt: '2026-07-28T08:00:00Z' }),
    makeEntry({ id: '2', fragranceId: 'b', date: daysAgo(0), createdAt: '2026-07-28T19:00:00Z' }),
    makeEntry({ id: '3', fragranceId: 'a', date: daysAgo(1) }),
  ];

  it('returns a day’s entries newest-logged first', () => {
    expect(entriesForDate(entries, daysAgo(0)).map((e) => e.id)).toEqual(['2', '1']);
  });

  it('returns nothing for an unlogged day', () => {
    expect(entriesForDate(entries, daysAgo(5))).toEqual([]);
  });

  it('detects whether today has been logged', () => {
    expect(hasLoggedToday(entries, NOW)).toBe(true);
    expect(hasLoggedToday([makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(1) })], NOW)).toBe(false);
    expect(hasLoggedToday([], NOW)).toBe(false);
  });
});

describe('groupByDay', () => {
  it('groups into days, most recent first', () => {
    const grouped = groupByDay([
      makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(2) }),
      makeEntry({ id: '2', fragranceId: 'b', date: daysAgo(0) }),
      makeEntry({ id: '3', fragranceId: 'c', date: daysAgo(0) }),
    ]);
    expect(grouped.map((d) => d.date)).toEqual([daysAgo(0), daysAgo(2)]);
    expect(grouped[0].entries).toHaveLength(2);
  });

  it('omits days with nothing logged rather than emitting gaps', () => {
    expect(groupByDay([makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(5) })])).toHaveLength(1);
  });

  it('handles an empty diary', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('visibleHistory', () => {
  const entries = [
    makeEntry({ id: 'new', fragranceId: 'a', date: daysAgo(1) }),
    makeEntry({ id: 'edge', fragranceId: 'a', date: daysAgo(FREE_LIMITS.sotdHistoryDays - 1) }),
    makeEntry({ id: 'old', fragranceId: 'a', date: daysAgo(FREE_LIMITS.sotdHistoryDays) }),
    makeEntry({ id: 'ancient', fragranceId: 'a', date: daysAgo(400) }),
  ];

  it('caps free history at the rolling window', () => {
    expect(visibleHistory(entries, false, NOW).map((e) => e.id)).toEqual(['new', 'edge']);
  });

  it('shows everything to premium', () => {
    expect(visibleHistory(entries, true, NOW)).toHaveLength(4);
  });

  it('counts what free is hiding, so the upsell can be specific', () => {
    expect(hiddenHistoryCount(entries, false, NOW)).toBe(2);
    expect(hiddenHistoryCount(entries, true, NOW)).toBe(0);
  });

  it('never deletes the hidden entries — upgrading restores the back-catalogue', () => {
    // The free view is a READ filter. The same array still holds every entry, so
    // a user who subscribes gets their whole diary back rather than a stub.
    const freeView = visibleHistory(entries, false, NOW);
    expect(freeView.length).toBeLessThan(entries.length);
    expect(visibleHistory(entries, true, NOW)).toHaveLength(entries.length);
  });
});

describe('currentStreak', () => {
  it('counts consecutive days ending today', () => {
    const entries = [0, 1, 2, 3].map((n) =>
      makeEntry({ id: String(n), fragranceId: 'a', date: daysAgo(n) }),
    );
    expect(currentStreak(entries, NOW)).toBe(4);
  });

  it('does not break the streak just because today is not logged yet', () => {
    // At 9am you have not sprayed yet; yesterday's streak should still stand.
    const entries = [1, 2, 3].map((n) =>
      makeEntry({ id: String(n), fragranceId: 'a', date: daysAgo(n) }),
    );
    expect(currentStreak(entries, NOW)).toBe(3);
  });

  it('ends the streak at a gap', () => {
    const entries = [0, 1, 3, 4].map((n) =>
      makeEntry({ id: String(n), fragranceId: 'a', date: daysAgo(n) }),
    );
    expect(currentStreak(entries, NOW)).toBe(2);
  });

  it('counts a day once even when two bottles were logged', () => {
    const entries = [
      makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(0) }),
      makeEntry({ id: '2', fragranceId: 'b', date: daysAgo(0) }),
      makeEntry({ id: '3', fragranceId: 'a', date: daysAgo(1) }),
    ];
    expect(currentStreak(entries, NOW)).toBe(2);
  });

  it('is zero for an empty diary and for a stale one', () => {
    expect(currentStreak([], NOW)).toBe(0);
    expect(currentStreak([makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(10) })], NOW)).toBe(0);
  });
});

describe('longestStreak / daysLogged', () => {
  it('finds the best run anywhere in history', () => {
    const dates = [30, 29, 28, 27, 26, 20, 19, 1];
    const entries = dates.map((n) => makeEntry({ id: String(n), fragranceId: 'a', date: daysAgo(n) }));
    expect(longestStreak(entries)).toBe(5);
  });

  it('is 1 for a single logged day and 0 for none', () => {
    expect(longestStreak([makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(3) })])).toBe(1);
    expect(longestStreak([])).toBe(0);
  });

  it('counts distinct days logged', () => {
    const entries = [
      makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(0) }),
      makeEntry({ id: '2', fragranceId: 'b', date: daysAgo(0) }),
      makeEntry({ id: '3', fragranceId: 'a', date: daysAgo(4) }),
    ];
    expect(daysLogged(entries)).toBe(2);
  });
});

describe('rediscoverSuggestion', () => {
  const shelf = [
    makeFragrance({ id: 'a', name: 'Alpha' }),
    makeFragrance({ id: 'b', name: 'Bravo' }),
    makeFragrance({ id: 'c', name: 'Charlie' }),
    makeFragrance({ id: 'd', name: 'Delta' }),
  ];

  it('prefers a bottle that has never been worn', () => {
    const entries = [
      makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(30) }),
      makeEntry({ id: '2', fragranceId: 'b', date: daysAgo(60) }),
      makeEntry({ id: '3', fragranceId: 'c', date: daysAgo(90) }),
    ];
    expect(rediscoverSuggestion(shelf, entries, NOW)?.id).toBe('d');
  });

  it('otherwise picks the longest-neglected bottle', () => {
    const entries = shelf.map((f, i) =>
      makeEntry({ id: String(i), fragranceId: f.id, date: daysAgo(10 + i * 10) }),
    );
    expect(rediscoverSuggestion(shelf, entries, NOW)?.id).toBe('d');
  });

  it('never suggests something worn in the last week', () => {
    const entries = shelf.map((f) => makeEntry({ id: f.id, fragranceId: f.id, date: daysAgo(1) }));
    expect(rediscoverSuggestion(shelf, entries, NOW)).toBeNull();
  });

  it('stays quiet for a collection too small to have anything to rediscover', () => {
    expect(rediscoverSuggestion([makeFragrance({ id: 'a' })], [], NOW)).toBeNull();
  });

  it('never suggests a wishlist bottle you do not own', () => {
    const withWishlist = [
      ...shelf.map((f) => makeFragrance({ ...f, id: f.id })),
      makeFragrance({ id: 'want', name: 'AAA Wishlist', inWishlist: true }),
    ];
    const entries = shelf.map((f) => makeEntry({ id: f.id, fragranceId: f.id, date: daysAgo(1) }));
    // Every owned bottle is in rotation; the wishlist bottle must not fill the gap.
    expect(rediscoverSuggestion(withWishlist, entries, NOW)).toBeNull();
  });

  it('is deterministic across calls with the same data', () => {
    const entries = [makeEntry({ id: '1', fragranceId: 'a', date: daysAgo(30) })];
    const first = rediscoverSuggestion(shelf, entries, NOW)?.id;
    expect(rediscoverSuggestion(shelf, entries, NOW)?.id).toBe(first);
  });
});

describe('alreadyLogged', () => {
  const entries = [makeEntry({ id: '1', fragranceId: 'a', date: '2026-07-28' })];

  it('detects a same-bottle same-day duplicate', () => {
    expect(alreadyLogged(entries, 'a', '2026-07-28')).toBe(true);
  });

  it('allows the same bottle on a different day', () => {
    expect(alreadyLogged(entries, 'a', '2026-07-27')).toBe(false);
  });

  it('allows a different bottle on the same day', () => {
    expect(alreadyLogged(entries, 'b', '2026-07-28')).toBe(false);
  });
});
