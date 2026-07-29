import { DateTime } from 'luxon';
import { makeEntry, makeFragrance } from './fixtures';
import { FULLY_RESTED_DAYS, pickForToday, REPEAT_WINDOW_DAYS, suggestToday } from './suggest';

// A fixed winter morning. Every expectation below is relative to this, so the
// suite does not quietly change meaning in July.
const NOW = DateTime.fromISO('2026-01-15T08:00:00', { zone: 'utc' });
const TODAY = '2026-01-15';

const daysAgo = (n: number) => NOW.minus({ days: n }).toISODate()!;

const bottle = (id: string, over = {}) => makeFragrance({ id, name: id, ...over });

describe('suggestToday', () => {
  it('returns nothing for an empty shelf', () => {
    expect(suggestToday([], [], { now: NOW })).toEqual([]);
    expect(pickForToday([], [], { now: NOW })).toBeNull();
  });

  it('never suggests a wishlist bottle', () => {
    const list = [bottle('wish', { inWishlist: true })];
    expect(suggestToday(list, [], { now: NOW })).toEqual([]);
  });

  it('never suggests something already logged today', () => {
    const list = [bottle('a'), bottle('b')];
    const entries = [makeEntry({ id: 'e', fragranceId: 'a', date: TODAY })];
    const ids = suggestToday(list, entries, { now: NOW }).map((s) => s.fragrance.id);
    expect(ids).toEqual(['b']);
  });

  it('never suggests a bottle the estimate says is empty', () => {
    // 100 ml at 2 sprays a wear is ~735 wears; 800 logged wears empties it.
    const empty = bottle('empty', { sizeMl: 5, spraysPerWear: 10 });
    const entries = Array.from({ length: 200 }, (_, i) =>
      makeEntry({ id: `e${i}`, fragranceId: 'empty', date: daysAgo(300 + i) }),
    );
    expect(suggestToday([empty], entries, { now: NOW })).toEqual([]);
  });

  it('always explains itself', () => {
    const list = [bottle('a'), bottle('b', { rating: 5 })];
    for (const s of suggestToday(list, [], { now: NOW })) {
      expect(s.reasons.length).toBeGreaterThan(0);
      expect(s.reasons.every((r) => r.trim().length > 0)).toBe(true);
    }
  });

  describe('season', () => {
    it('favours a bottle tagged for the current season', () => {
      const list = [
        bottle('summer', { seasons: ['Summer'] }),
        bottle('winter', { seasons: ['Winter'] }),
      ];
      expect(suggestToday(list, [], { now: NOW })[0].fragrance.id).toBe('winter');
    });

    it('honours an explicitly requested season over the calendar', () => {
      const list = [
        bottle('summer', { seasons: ['Summer'] }),
        bottle('winter', { seasons: ['Winter'] }),
      ];
      const top = suggestToday(list, [], { now: NOW, season: 'Summer' })[0];
      expect(top.fragrance.id).toBe('summer');
    });

    it('does not punish an untagged bottle as if it were tagged wrong', () => {
      const list = [bottle('untagged'), bottle('wrong', { seasons: ['Summer'] })];
      const byId = new Map(suggestToday(list, [], { now: NOW }).map((s) => [s.fragrance.id, s]));
      expect(byId.get('untagged')!.score).toBeGreaterThan(byId.get('wrong')!.score);
    });

    it('names the season in its reasoning', () => {
      const list = [bottle('winter', { seasons: ['Winter'] })];
      expect(suggestToday(list, [], { now: NOW })[0].reasons.join(' ')).toMatch(/winter/i);
    });
  });

  describe('occasion', () => {
    it('is ignored entirely when none is asked for', () => {
      const list = [bottle('gym', { occasions: ['Gym'] }), bottle('plain')];
      const withNone = suggestToday(list, [], { now: NOW });
      // Both bottles are otherwise identical, so neither may be pushed ahead
      // by a signal the caller never asked about.
      expect(withNone[0].score).toBe(withNone[1].score);
    });

    it('favours a bottle tagged for the requested occasion', () => {
      const list = [bottle('gym', { occasions: ['Gym'] }), bottle('formal', { occasions: ['Formal'] })];
      const top = suggestToday(list, [], { now: NOW, occasion: 'Formal' })[0];
      expect(top.fragrance.id).toBe('formal');
      expect(top.reasons.join(' ')).toMatch(/formal/i);
    });

    it('matches an occasion case-insensitively', () => {
      const list = [bottle('formal', { occasions: ['Formal'] })];
      expect(suggestToday(list, [], { now: NOW, occasion: 'formal' })[0].reasons.join(' ')).toMatch(
        /formal/i,
      );
    });

    it('keeps scores on the same scale whether or not an occasion is given', () => {
      // The occasion weight is redistributed rather than left as dead space, so
      // a perfect bottle scores 1 either way.
      const perfect = bottle('perfect', {
        seasons: ['Winter'],
        occasions: ['Formal'],
        rating: 5,
      });
      const withoutOccasion = suggestToday([perfect], [], { now: NOW })[0].score;
      const withOccasion = suggestToday([perfect], [], { now: NOW, occasion: 'Formal' })[0].score;
      expect(withoutOccasion).toBe(1);
      expect(withOccasion).toBe(1);
    });
  });

  describe('rest', () => {
    it('pushes down something worn in the last couple of days', () => {
      const list = [bottle('fresh'), bottle('stale')];
      const entries = [
        makeEntry({ id: 'e', fragranceId: 'stale', date: daysAgo(REPEAT_WINDOW_DAYS) }),
      ];
      expect(suggestToday(list, entries, { now: NOW })[0].fragrance.id).toBe('fresh');
    });

    it('stops rewarding neglect once a bottle is fully rested', () => {
      // Otherwise the shelf's most ignored bottle wins every morning forever.
      const list = [bottle('rested'), bottle('ancient')];
      const entries = [
        makeEntry({ id: 'a', fragranceId: 'rested', date: daysAgo(FULLY_RESTED_DAYS) }),
        makeEntry({ id: 'b', fragranceId: 'ancient', date: daysAgo(400) }),
      ];
      const byId = new Map(suggestToday(list, entries, { now: NOW }).map((s) => [s.fragrance.id, s]));
      expect(byId.get('rested')!.score).toBe(byId.get('ancient')!.score);
    });

    it('reports how long it has been', () => {
      const list = [bottle('old')];
      const entries = [makeEntry({ id: 'e', fragranceId: 'old', date: daysAgo(120) })];
      const [s] = suggestToday(list, entries, { now: NOW });
      expect(s.daysSinceWorn).toBe(120);
      expect(s.reasons.join(' ')).toMatch(/months/i);
    });

    it('calls out a bottle that has never been worn', () => {
      const list = [bottle('virgin')];
      const [s] = suggestToday(list, [], { now: NOW });
      expect(s.daysSinceWorn).toBeNull();
      expect(s.reasons.join(' ')).toMatch(/never worn/i);
    });
  });

  describe('rating', () => {
    it('prefers a bottle you rated higher, all else equal', () => {
      const list = [bottle('meh', { rating: 2 }), bottle('great', { rating: 5 })];
      expect(suggestToday(list, [], { now: NOW })[0].fragrance.id).toBe('great');
    });

    it('does not treat unrated as badly rated', () => {
      const list = [bottle('unrated'), bottle('poor', { rating: 1 })];
      expect(suggestToday(list, [], { now: NOW })[0].fragrance.id).toBe('unrated');
    });
  });

  describe('level', () => {
    it('holds back a bottle that is nearly gone, and says why', () => {
      const full = bottle('full', { sizeMl: 100 });
      const dregs = bottle('dregs', { sizeMl: 100, remainingMl: 2, remainingMlAt: '2026-01-01T00:00:00.000Z' });
      const ranked = suggestToday([full, dregs], [], { now: NOW });
      expect(ranked[0].fragrance.id).toBe('full');
      expect(ranked[1].reasons.join(' ')).toMatch(/nearly gone/i);
    });

    it('mentions a low bottle without burying it', () => {
      const low = bottle('low', {
        sizeMl: 100,
        remainingMl: 15,
        remainingMlAt: '2026-01-01T00:00:00.000Z',
      });
      const [s] = suggestToday([low], [], { now: NOW });
      expect(s.reasons.join(' ')).toMatch(/% left/);
    });

    it('says nothing about level for a bottle with no size recorded', () => {
      const [s] = suggestToday([bottle('sizeless')], [], { now: NOW });
      expect(s.reasons.join(' ')).not.toMatch(/left|gone/i);
    });
  });

  it('breaks ties by name so the order is stable between renders', () => {
    const list = [bottle('b', { name: 'Beta' }), bottle('a', { name: 'Alpha' })];
    const ids = suggestToday(list, [], { now: NOW }).map((s) => s.fragrance.name);
    expect(ids).toEqual(['Alpha', 'Beta']);
  });

  it('keeps every score inside 0..1', () => {
    const list = [
      bottle('a', { seasons: ['Winter'], occasions: ['Formal'], rating: 5 }),
      bottle('b', { seasons: ['Summer'], rating: 1, sizeMl: 100, remainingMl: 1, remainingMlAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const entries = [makeEntry({ id: 'e', fragranceId: 'b', date: daysAgo(1) })];
    for (const s of suggestToday(list, entries, { now: NOW, occasion: 'Formal' })) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });
});

describe('pickForToday', () => {
  it('returns the top suggestion', () => {
    const list = [bottle('summer', { seasons: ['Summer'] }), bottle('winter', { seasons: ['Winter'] })];
    expect(pickForToday(list, [], { now: NOW })!.fragrance.id).toBe('winter');
  });
});
