import { DateTime } from 'luxon';
import { DEFAULT_SPRAYS_PER_WEAR, type Fragrance, type SotdEntry } from './types';

export { DEFAULT_SPRAYS_PER_WEAR };

// ---------------------------------------------------------------------------
// How much is left in the bottle, and when it will run out.
//
// This is the feature no other fragrance app has, because it needs two things
// together: the bottle's size AND a dated wear history. Collectors currently
// solve it by weighing bottles on kitchen scales or shining torches through
// them; ScentKeep can just work it out.
//
// The maths is deliberately simple and honest:
//   ml used = wears x sprays-per-wear / SPRAYS_PER_ML
// It is an ESTIMATE, and the UI must say so. A user who knows better can set
// the true level, which becomes a new baseline that later wears deplete from.
// ---------------------------------------------------------------------------

/**
 * Sprays per millilitre. 14.7 is the figure the fragrance community converged
 * on (a spray is ~0.068 ml) and is what the standalone perfume calculators
 * use, so ScentKeep's numbers agree with what a collector would work out by
 * hand rather than inventing a private constant.
 */
export const SPRAYS_PER_ML = 14.7;

/** At or below this fraction, a bottle is "running low" and worth reordering. */
export const LOW_THRESHOLD = 0.2;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Millilitres consumed by a number of wears. */
export function mlUsed(wears: number, spraysPerWear: number = DEFAULT_SPRAYS_PER_WEAR): number {
  if (wears <= 0 || spraysPerWear <= 0) return 0;
  return round1((wears * spraysPerWear) / SPRAYS_PER_ML);
}

/** How many wears a given volume supports. */
export function wearsFromMl(ml: number, spraysPerWear: number = DEFAULT_SPRAYS_PER_WEAR): number {
  if (ml <= 0 || spraysPerWear <= 0) return 0;
  return Math.floor((ml * SPRAYS_PER_ML) / spraysPerWear);
}

export interface BottleLevel {
  /** Estimated millilitres left. */
  remainingMl: number;
  /** Fraction of the bottle left, 0..1. */
  fraction: number;
  /** Millilitres consumed since the baseline. */
  usedMl: number;
  /** Wears counted against the current baseline. */
  wearsCounted: number;
  /** Estimated wears still available. */
  wearsLeft: number;
  /** True once at or below LOW_THRESHOLD. */
  isLow: boolean;
  /** True when the estimate says the bottle is finished. */
  isEmpty: boolean;
  /** False when the user has set a true level — then it is measured-from, not guessed. */
  isEstimate: boolean;
}

/**
 * Current level for one bottle.
 *
 * Baseline rules: if the user has recorded a true level (`remainingMl` +
 * `remainingMlAt`), depletion counts only wears logged AFTER that moment.
 * Otherwise the baseline is a full bottle and every wear counts. Without this,
 * correcting the level would be pointless — the old wears would immediately
 * re-consume the correction.
 *
 * Returns null when there is nothing meaningful to show: no size recorded, or
 * a sample (which nobody tracks by the millilitre).
 */
export function bottleLevel(fragrance: Fragrance, entries: SotdEntry[]): BottleLevel | null {
  if (fragrance.inWishlist) return null;
  if (fragrance.type === 'sample') return null;
  if (!fragrance.sizeMl || fragrance.sizeMl <= 0) return null;

  const spraysPerWear = fragrance.spraysPerWear || DEFAULT_SPRAYS_PER_WEAR;
  const hasBaseline = fragrance.remainingMl !== null && fragrance.remainingMlAt !== null;
  const baselineMl = hasBaseline ? fragrance.remainingMl! : fragrance.sizeMl;

  const relevant = entries.filter((e) => {
    if (e.fragranceId !== fragrance.id) return false;
    if (!hasBaseline) return true;
    // `createdAt` is when the wear was recorded, which is the same clock the
    // level correction is stamped on — comparing against the wear's `date`
    // would mis-count a backdated entry.
    return e.createdAt > fragrance.remainingMlAt!;
  });

  const wearsCounted = relevant.length;
  const usedMl = mlUsed(wearsCounted, spraysPerWear);
  const remainingMl = Math.max(0, round1(baselineMl - usedMl));
  const fraction = fragrance.sizeMl > 0 ? Math.min(1, Math.max(0, remainingMl / fragrance.sizeMl)) : 0;

  return {
    remainingMl,
    fraction: Math.round(fraction * 100) / 100,
    usedMl,
    wearsCounted,
    wearsLeft: wearsFromMl(remainingMl, spraysPerWear),
    isLow: fraction <= LOW_THRESHOLD,
    isEmpty: remainingMl <= 0,
    isEstimate: !hasBaseline,
  };
}

export interface Projection {
  /** Wears per week for THIS bottle, over the observed period. */
  wearsPerWeek: number;
  /** Days until empty at the observed rate, or null when it can't be projected. */
  daysLeft: number | null;
  /** Human phrase: "about 6 weeks", "under a week", "over a year". */
  label: string;
}

/**
 * Projects when a bottle runs out, from how often it is ACTUALLY worn.
 *
 * Returns `daysLeft: null` — and says so — when the rate can't be trusted:
 * fewer than two wears, or a bottle already empty. A confident-looking date
 * derived from one wear would be worse than no date at all.
 */
export function projectRunOut(
  fragrance: Fragrance,
  entries: SotdEntry[],
  now: DateTime = DateTime.local(),
): Projection | null {
  const level = bottleLevel(fragrance, entries);
  if (!level) return null;

  const mine = entries
    .filter((e) => e.fragranceId === fragrance.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (level.isEmpty) return { wearsPerWeek: 0, daysLeft: 0, label: 'Empty' };
  if (mine.length < 2) {
    return { wearsPerWeek: 0, daysLeft: null, label: 'Not enough wears yet' };
  }

  const first = DateTime.fromISO(mine[0].date, { zone: now.zone }).startOf('day');
  const spanDays = Math.max(7, Math.floor(now.startOf('day').diff(first, 'days').days) + 1);
  const wearsPerWeek = (mine.length / spanDays) * 7;
  if (wearsPerWeek <= 0) return { wearsPerWeek: 0, daysLeft: null, label: 'Not enough wears yet' };

  const daysLeft = Math.round((level.wearsLeft / wearsPerWeek) * 7);

  return {
    wearsPerWeek: Math.round(wearsPerWeek * 10) / 10,
    daysLeft,
    label: describeDays(daysLeft),
  };
}

/** Turns a day count into something a person would actually say. */
export function describeDays(days: number): string {
  if (days <= 0) return 'Empty';
  if (days < 7) return 'Under a week';
  if (days < 14) return 'About a week';
  if (days < 60) return `About ${Math.round(days / 7)} weeks`;
  if (days < 365) return `About ${Math.round(days / 30)} months`;
  if (days < 730) return 'Over a year';
  return 'Years at this rate';
}

export interface LowBottle {
  fragrance: Fragrance;
  level: BottleLevel;
  projection: Projection | null;
}

/**
 * Bottles worth reordering, emptiest first. Samples and wishlist rows are
 * excluded — you cannot run low on something you do not own.
 */
export function runningLow(
  fragrances: Fragrance[],
  entries: SotdEntry[],
  now: DateTime = DateTime.local(),
): LowBottle[] {
  const out: LowBottle[] = [];
  for (const f of fragrances) {
    const level = bottleLevel(f, entries);
    if (!level || !level.isLow) continue;
    out.push({ fragrance: f, level, projection: projectRunOut(f, entries, now) });
  }
  return out.sort((a, b) => a.level.fraction - b.level.fraction);
}

/**
 * Total juice actually left across the collection, as opposed to the total
 * capacity of the bottles owned. Two very different numbers once a shelf has
 * been in use for a year.
 */
export function totalRemainingMl(fragrances: Fragrance[], entries: SotdEntry[]): number {
  let total = 0;
  for (const f of fragrances) {
    const level = bottleLevel(f, entries);
    if (level) total += level.remainingMl;
  }
  return round1(total);
}
