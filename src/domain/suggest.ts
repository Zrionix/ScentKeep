// ---------------------------------------------------------------------------
// "What should I wear today?"
//
// The one screen that turns ScentKeep from something you remember to update into
// something you open. It answers a question a collector genuinely asks every
// morning, using only what is already on the shelf and in the diary.
//
// Two rules govern everything here:
//
//   1. It suggests, it never decides. The user picks; the app offers a shortlist.
//   2. Every suggestion says WHY, in words, from the signal that actually moved
//      it. A ranked list with no explanation is indistinguishable from a random
//      one, and the user will treat it as such the first time it picks oddly.
//
// Pure functions. No store, no React, no network — in particular no weather
// lookup: the season is derived from the date, and a real weather signal can be
// passed in later without changing the shape of anything.
// ---------------------------------------------------------------------------

import { DateTime } from 'luxon';
import type { Occasion, Season } from '@/theme';
import { daysSince, seasonForDate, todayIso } from '@/lib/dates';
import { bottleLevel } from './bottleLevel';
import type { Fragrance, IsoDate, SotdEntry } from './types';

/**
 * Wears inside this window are treated as "just wore it". Two days, because
 * wearing the same thing two mornings running is a choice and three is a rut.
 */
export const REPEAT_WINDOW_DAYS = 2;

/** Beyond this, a bottle counts as fully rested and gets no further boost for
 *  being neglected — otherwise the shelf's most ignored bottle would win every
 *  single day and the list would never move. */
export const FULLY_RESTED_DAYS = 21;

/**
 * A bottle at or below this fraction is being saved, not spent — nobody wants
 * the last 5 ml recommended for a Tuesday. The wider "running low" band is
 * `LOW_THRESHOLD` in bottleLevel.ts and is read from the level itself, so the
 * two definitions cannot drift.
 */
const NEARLY_GONE = 0.05;

/** How much each signal counts. Season leads because it is the constraint a
 *  wearer actually feels; rating is deliberately last, or the same five-star
 *  bottle wins forever. */
const WEIGHTS = {
  season: 0.3,
  occasion: 0.2,
  rest: 0.25,
  rating: 0.15,
  level: 0.1,
} as const;

/** Value used for a signal the bottle says nothing about. Deliberately neither
 *  reward nor punishment — an untagged bottle should not be ranked as if it had
 *  been tagged badly. */
const NO_CLAIM = 0.5;

export interface SuggestContext {
  /** Defaults to the season of `now`. */
  season?: Season;
  /** What the day is for. Omit and the signal drops out entirely rather than
   *  quietly nudging the ranking. */
  occasion?: Occasion | string | null;
  now?: DateTime;
}

export interface Suggestion {
  fragrance: Fragrance;
  /** 0..1. Comparable within one call only — it is a ranking, not a rating. */
  score: number;
  /** Why this one, strongest signal first. Never empty. */
  reasons: string[];
  daysSinceWorn: number | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function lastWornMap(entries: SotdEntry[]): Map<string, IsoDate> {
  const out = new Map<string, IsoDate>();
  for (const e of entries) {
    const prev = out.get(e.fragranceId);
    if (!prev || e.date > prev) out.set(e.fragranceId, e.date);
  }
  return out;
}

/**
 * A shortlist for today, best first.
 *
 * Excluded outright rather than ranked low:
 *   - wishlist rows (you do not own them)
 *   - anything already logged today (the question is already answered)
 *   - bottles the level estimate says are empty (recommending one is a tease)
 *
 * Everything else competes. Returns an empty list when the shelf is empty or
 * every bottle was excluded — the caller shows its own empty state rather than
 * this module inventing a filler suggestion.
 */
export function suggestToday(
  fragrances: Fragrance[],
  entries: SotdEntry[],
  { season, occasion = null, now = DateTime.local() }: SuggestContext = {},
): Suggestion[] {
  const today = todayIso(now);
  const currentSeason = season ?? seasonForDate(today);
  const wantedOccasion = typeof occasion === 'string' ? occasion.trim() : '';
  const useOccasion = wantedOccasion.length > 0;

  const lastWorn = lastWornMap(entries);
  const wornToday = new Set(entries.filter((e) => e.date === today).map((e) => e.fragranceId));

  // With the occasion signal switched off its weight is redistributed rather
  // than left as dead space, so scores stay on the same 0..1 scale either way.
  const activeWeight = useOccasion
    ? 1
    : 1 - WEIGHTS.occasion;

  const out: Suggestion[] = [];

  for (const f of fragrances) {
    if (f.inWishlist) continue;
    if (wornToday.has(f.id)) continue;

    const level = bottleLevel(f, entries);
    if (level?.isEmpty) continue;

    const reasons: { text: string; strength: number }[] = [];

    // --- season ------------------------------------------------------------
    let seasonScore = NO_CLAIM;
    if (f.seasons.length > 0) {
      if (f.seasons.includes(currentSeason)) {
        seasonScore = 1;
        reasons.push({ text: `You tagged this for ${currentSeason.toLowerCase()}.`, strength: 1 });
      } else {
        seasonScore = 0.15;
      }
    }

    // --- occasion ----------------------------------------------------------
    let occasionScore = NO_CLAIM;
    if (useOccasion && f.occasions.length > 0) {
      const match = f.occasions.some((o) => o.toLowerCase() === wantedOccasion.toLowerCase());
      occasionScore = match ? 1 : 0.1;
      if (match) {
        reasons.push({ text: `Tagged for ${wantedOccasion.toLowerCase()}.`, strength: 0.95 });
      }
    }

    // --- rest ---------------------------------------------------------------
    const worn = lastWorn.get(f.id) ?? null;
    const daysSinceWorn = worn ? daysSince(worn, now) : null;
    let restScore: number;
    if (daysSinceWorn === null) {
      restScore = 1;
      reasons.push({ text: 'You have never worn this one.', strength: 0.9 });
    } else if (daysSinceWorn <= REPEAT_WINDOW_DAYS) {
      restScore = 0;
    } else if (daysSinceWorn >= FULLY_RESTED_DAYS) {
      restScore = 1;
      reasons.push({
        text:
          daysSinceWorn >= 90
            ? `Untouched for ${Math.round(daysSinceWorn / 30)} months.`
            : `Rested ${daysSinceWorn} days.`,
        strength: 0.8,
      });
    } else {
      restScore =
        (daysSinceWorn - REPEAT_WINDOW_DAYS) / (FULLY_RESTED_DAYS - REPEAT_WINDOW_DAYS);
    }

    // --- rating -------------------------------------------------------------
    const ratingScore = f.rating > 0 ? f.rating / 5 : NO_CLAIM;
    if (f.rating === 5) reasons.push({ text: 'One of your five-star bottles.', strength: 0.7 });

    // --- level --------------------------------------------------------------
    let levelScore = 1;
    if (level && level.fraction <= NEARLY_GONE) {
      levelScore = 0.15;
      reasons.push({ text: 'Nearly gone — you may be saving this.', strength: 0.6 });
    } else if (level?.isLow) {
      levelScore = 0.6;
      reasons.push({
        text: `About ${Math.round(level.fraction * 100)}% left.`,
        strength: 0.4,
      });
    }

    const raw =
      WEIGHTS.season * seasonScore +
      (useOccasion ? WEIGHTS.occasion * occasionScore : 0) +
      WEIGHTS.rest * restScore +
      WEIGHTS.rating * ratingScore +
      WEIGHTS.level * levelScore;

    // Something is always said, even for a bottle whose every signal was
    // neutral — a suggestion with no explanation never reaches the screen.
    if (reasons.length === 0) {
      reasons.push({
        text:
          daysSinceWorn === null
            ? 'On your shelf and unworn.'
            : `Last worn ${daysSinceWorn} days ago.`,
        strength: 0.2,
      });
    }

    out.push({
      fragrance: f,
      score: round2(raw / activeWeight),
      daysSinceWorn,
      reasons: reasons.sort((a, b) => b.strength - a.strength).map((r) => r.text),
    });
  }

  return out.sort(
    (a, b) => b.score - a.score || a.fragrance.name.localeCompare(b.fragrance.name),
  );
}

/** The single bottle to lead with, or null when there is nothing to suggest. */
export function pickForToday(
  fragrances: Fragrance[],
  entries: SotdEntry[],
  ctx: SuggestContext = {},
): Suggestion | null {
  return suggestToday(fragrances, entries, ctx)[0] ?? null;
}
