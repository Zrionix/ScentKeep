import { DateTime } from 'luxon';
import {
  bottleLevel,
  describeDays,
  LOW_THRESHOLD,
  mlUsed,
  projectRunOut,
  runningLow,
  SPRAYS_PER_ML,
  totalRemainingMl,
  wearsFromMl,
} from './bottleLevel';
import { makeEntry, makeFragrance } from './fixtures';

const NOW = DateTime.fromISO('2026-07-28T12:00:00', { zone: 'utc' });
const daysAgo = (n: number) => NOW.minus({ days: n }).toISODate()!;

/** n wears of one bottle, one per day going back from today. */
const wears = (fragranceId: string, n: number, startOffset = 0) =>
  Array.from({ length: n }, (_, i) =>
    makeEntry({
      id: `${fragranceId}-${i}`,
      fragranceId,
      date: daysAgo(i + startOffset),
      createdAt: NOW.minus({ days: i + startOffset }).toISO()!,
    }),
  );

describe('spray maths', () => {
  it('uses the community-standard 14.7 sprays per ml', () => {
    // Agreeing with the figure collectors already use by hand matters more
    // than picking a marginally different "more accurate" constant.
    expect(SPRAYS_PER_ML).toBe(14.7);
  });

  it('converts wears to millilitres', () => {
    // 100 wears x 2 sprays = 200 sprays / 14.7 = 13.6 ml
    expect(mlUsed(100, 2)).toBeCloseTo(13.6, 1);
    expect(mlUsed(0, 2)).toBe(0);
  });

  it('scales with sprays per wear', () => {
    expect(mlUsed(50, 4)).toBeCloseTo(mlUsed(100, 2), 1);
  });

  it('never returns negative usage for nonsense input', () => {
    expect(mlUsed(-5, 2)).toBe(0);
    expect(mlUsed(10, 0)).toBe(0);
    expect(mlUsed(10, -3)).toBe(0);
  });

  it('converts millilitres back to wears', () => {
    expect(wearsFromMl(10, 2)).toBe(Math.floor((10 * 14.7) / 2));
    expect(wearsFromMl(0, 2)).toBe(0);
    expect(wearsFromMl(-1, 2)).toBe(0);
  });
});

describe('bottleLevel', () => {
  it('reports a full bottle when nothing has been worn', () => {
    const f = makeFragrance({ id: 'a', sizeMl: 100 });
    const level = bottleLevel(f, [])!;
    expect(level.remainingMl).toBe(100);
    expect(level.fraction).toBe(1);
    expect(level.isLow).toBe(false);
    expect(level.isEmpty).toBe(false);
  });

  it('depletes with wears', () => {
    const f = makeFragrance({ id: 'a', sizeMl: 100, spraysPerWear: 2 });
    const level = bottleLevel(f, wears('a', 100))!;
    expect(level.usedMl).toBeCloseTo(13.6, 1);
    expect(level.remainingMl).toBeCloseTo(86.4, 1);
    expect(level.wearsCounted).toBe(100);
  });

  it('never goes below empty, however many wears are logged', () => {
    const f = makeFragrance({ id: 'a', sizeMl: 5, spraysPerWear: 2 });
    const level = bottleLevel(f, wears('a', 500))!;
    expect(level.remainingMl).toBe(0);
    expect(level.fraction).toBe(0);
    expect(level.isEmpty).toBe(true);
    expect(level.wearsLeft).toBe(0);
  });

  it('flags a bottle at or below the low threshold', () => {
    const f = makeFragrance({ id: 'a', sizeMl: 10, spraysPerWear: 2 });
    // 10ml holds 147 sprays = ~73 wears. 60 wears leaves ~1.8ml = 18%.
    const level = bottleLevel(f, wears('a', 60))!;
    expect(level.fraction).toBeLessThanOrEqual(LOW_THRESHOLD);
    expect(level.isLow).toBe(true);
  });

  it('ignores wears belonging to other bottles', () => {
    const f = makeFragrance({ id: 'a', sizeMl: 100 });
    const level = bottleLevel(f, wears('someone-else', 200))!;
    expect(level.remainingMl).toBe(100);
  });

  it('returns null when there is nothing meaningful to show', () => {
    expect(bottleLevel(makeFragrance({ id: 'a', sizeMl: null }), [])).toBeNull();
    expect(bottleLevel(makeFragrance({ id: 'a', sizeMl: 100, inWishlist: true }), [])).toBeNull();
    // Nobody tracks a 2ml sample by the millilitre.
    expect(bottleLevel(makeFragrance({ id: 'a', sizeMl: 2, type: 'sample' }), [])).toBeNull();
  });

  it('tracks decants, which people very much do ration', () => {
    const f = makeFragrance({ id: 'a', sizeMl: 10, type: 'decant' });
    expect(bottleLevel(f, [])).not.toBeNull();
  });

  it('marks the figure as an estimate until the user measures it', () => {
    expect(bottleLevel(makeFragrance({ id: 'a', sizeMl: 100 }), [])!.isEstimate).toBe(true);
  });
});

describe('manual level correction', () => {
  const baselineAt = NOW.minus({ days: 10 }).toISO()!;

  it('uses the measured level as the new baseline', () => {
    const f = makeFragrance({
      id: 'a',
      sizeMl: 100,
      remainingMl: 40,
      remainingMlAt: baselineAt,
      spraysPerWear: 2,
    });
    // 30 wears logged BEFORE the correction must not deplete it again.
    const level = bottleLevel(f, wears('a', 30, 11))!;
    expect(level.remainingMl).toBe(40);
    expect(level.wearsCounted).toBe(0);
    expect(level.isEstimate).toBe(false);
  });

  it('depletes only from wears logged after the correction', () => {
    const f = makeFragrance({
      id: 'a',
      sizeMl: 100,
      remainingMl: 40,
      remainingMlAt: baselineAt,
      spraysPerWear: 2,
    });
    // The baseline is 10 days old, so only wears inside that window count.
    // `wears(..., 10, 0)` spans days 0-9 — all after the correction.
    const before = wears('a', 30, 11);
    const after = wears('a', 10, 0);
    const level = bottleLevel(f, [...before, ...after])!;
    expect(level.wearsCounted).toBe(10);
    expect(level.remainingMl).toBeCloseTo(40 - mlUsed(10, 2), 1);
  });

  it('is not immediately undone by the history that preceded it', () => {
    // The failure this guards: a user corrects a bottle to 40ml, and the app
    // instantly re-subtracts a year of wears and shows it as empty.
    const f = makeFragrance({
      id: 'a',
      sizeMl: 100,
      remainingMl: 40,
      remainingMlAt: baselineAt,
    });
    const level = bottleLevel(f, wears('a', 400, 11))!;
    expect(level.remainingMl).toBe(40);
    expect(level.isEmpty).toBe(false);
  });

  it('still reports the fraction against the ORIGINAL bottle size', () => {
    const f = makeFragrance({ id: 'a', sizeMl: 100, remainingMl: 25, remainingMlAt: baselineAt });
    expect(bottleLevel(f, [])!.fraction).toBe(0.25);
  });
});

describe('projectRunOut', () => {
  it('projects from the observed wear rate', () => {
    // 8 wears over 28 days = 2/week. 100ml bottle barely touched.
    const f = makeFragrance({ id: 'a', sizeMl: 100, spraysPerWear: 2 });
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ id: `w${i}`, fragranceId: 'a', date: daysAgo(i * 4), createdAt: NOW.minus({ days: i * 4 }).toISO()! }),
    );
    const p = projectRunOut(f, entries, NOW)!;
    expect(p.wearsPerWeek).toBeCloseTo(2, 0);
    expect(p.daysLeft).toBeGreaterThan(365);
  });

  it('refuses to project from a single wear', () => {
    // A confident date derived from one data point is worse than no date.
    const f = makeFragrance({ id: 'a', sizeMl: 100 });
    const p = projectRunOut(f, wears('a', 1), NOW)!;
    expect(p.daysLeft).toBeNull();
    expect(p.label).toBe('Not enough wears yet');
  });

  it('refuses to project from no wears at all', () => {
    const p = projectRunOut(makeFragrance({ id: 'a', sizeMl: 100 }), [], NOW)!;
    expect(p.daysLeft).toBeNull();
  });

  it('reports an empty bottle as empty rather than projecting', () => {
    const f = makeFragrance({ id: 'a', sizeMl: 2, spraysPerWear: 2 });
    const p = projectRunOut(f, wears('a', 300), NOW)!;
    expect(p.label).toBe('Empty');
    expect(p.daysLeft).toBe(0);
  });

  it('returns null for something with no trackable level', () => {
    expect(projectRunOut(makeFragrance({ id: 'a', sizeMl: null }), [], NOW)).toBeNull();
  });

  it('gives a short runway for a small decant worn constantly', () => {
    const f = makeFragrance({ id: 'a', sizeMl: 5, type: 'decant', spraysPerWear: 3 });
    const p = projectRunOut(f, wears('a', 14), NOW)!;
    expect(p.daysLeft).not.toBeNull();
    expect(p.daysLeft!).toBeLessThan(200);
  });
});

describe('describeDays', () => {
  it('speaks like a person', () => {
    expect(describeDays(0)).toBe('Empty');
    expect(describeDays(3)).toBe('Under a week');
    expect(describeDays(10)).toBe('About a week');
    expect(describeDays(42)).toBe('About 6 weeks');
    expect(describeDays(90)).toBe('About 3 months');
    expect(describeDays(400)).toBe('Over a year');
    expect(describeDays(900)).toBe('Years at this rate');
  });

  it('treats a negative day count as empty rather than printing nonsense', () => {
    expect(describeDays(-5)).toBe('Empty');
  });
});

describe('runningLow', () => {
  it('lists low bottles emptiest first', () => {
    const frags = [
      makeFragrance({ id: 'full', sizeMl: 100 }),
      makeFragrance({ id: 'low', sizeMl: 10, spraysPerWear: 2 }),
      makeFragrance({ id: 'lower', sizeMl: 10, spraysPerWear: 2 }),
    ];
    const entries = [...wears('low', 60), ...wears('lower', 70)];
    const result = runningLow(frags, entries, NOW);
    expect(result.map((r) => r.fragrance.id)).toEqual(['lower', 'low']);
  });

  it('never lists a wishlist bottle you do not own', () => {
    const frags = [makeFragrance({ id: 'want', sizeMl: 10, inWishlist: true })];
    expect(runningLow(frags, wears('want', 70), NOW)).toEqual([]);
  });

  it('never lists a sample', () => {
    const frags = [makeFragrance({ id: 's', sizeMl: 2, type: 'sample' })];
    expect(runningLow(frags, wears('s', 50), NOW)).toEqual([]);
  });

  it('is empty for a well-stocked collection', () => {
    expect(runningLow([makeFragrance({ id: 'a', sizeMl: 100 })], [], NOW)).toEqual([]);
  });
});

describe('totalRemainingMl', () => {
  it('sums what is actually LEFT, not what was bought', () => {
    // The headline "775 ml on the shelf" is capacity; this is the truth after
    // a year of wearing it.
    const frags = [
      makeFragrance({ id: 'a', sizeMl: 100, spraysPerWear: 2 }),
      makeFragrance({ id: 'b', sizeMl: 50, spraysPerWear: 2 }),
    ];
    const total = totalRemainingMl(frags, wears('a', 147));
    expect(total).toBeLessThan(150);
    expect(total).toBeCloseTo(100 - mlUsed(147, 2) + 50, 0);
  });

  it('ignores items with no trackable level', () => {
    const frags = [
      makeFragrance({ id: 'a', sizeMl: 100 }),
      makeFragrance({ id: 'b', sizeMl: null }),
      makeFragrance({ id: 'c', sizeMl: 2, type: 'sample' }),
    ];
    expect(totalRemainingMl(frags, [])).toBe(100);
  });
});
