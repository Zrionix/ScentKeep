// ---------------------------------------------------------------------------
// The shareable shelf card.
//
// Fragrance communities post their collections constantly, and a card that is
// actually worth posting is the cheapest install driver this app has. That only
// works if the card is honest and safe to hand to strangers:
//
//   - NO PRICES, ever. Not as a toggle, not "off by default". A collection
//     photo circulating with what everything cost is a burglary shopping list,
//     and the insurance export already exists for the one legitimate use.
//   - No dates, no location, no account id, no diary text.
//   - Nothing the user did not type in themselves.
//
// What is left is the interesting part anyway: what you own and what you
// actually reach for.
//
// Pure functions. The rendering lives in components/ShelfCard.tsx.
// ---------------------------------------------------------------------------

import { ownedBottles, wearCounts } from './stats';
import type { Fragrance, SotdEntry } from './types';

/** Fewer than this and it is a list, not a shelf. */
export const MIN_BOTTLES_FOR_CARD = 3;

/** Six reads as a considered selection and still fits a 3x2 grid legibly at
 *  the size these get viewed on. */
export const CARD_SLOTS = 6;

export type ShelfCardMode = 'most-worn' | 'top-rated' | 'recent';

export const MODE_LABEL: Record<ShelfCardMode, string> = {
  'most-worn': 'Most worn',
  'top-rated': 'Top rated',
  recent: 'Latest additions',
};

export interface ShelfCardEntry {
  fragrance: Fragrance;
  /** The one line under the name. Empty when there is nothing true to say. */
  caption: string;
}

export interface ShelfCardData {
  mode: ShelfCardMode;
  /** Heading above the grid, e.g. "Most worn". */
  title: string;
  /** The honest count line, e.g. "24 bottles · 312 wears logged". */
  stat: string;
  entries: ShelfCardEntry[];
}

function statLine(bottles: number, wears: number): string {
  const b = `${bottles} ${bottles === 1 ? 'bottle' : 'bottles'}`;
  if (wears === 0) return b;
  return `${b} · ${wears} ${wears === 1 ? 'wear' : 'wears'} logged`;
}

/**
 * Builds the card, or returns null when the collection is too small to make one
 * worth sharing.
 *
 * `most-worn` silently degrades to `top-rated` when nothing has been logged yet:
 * a "most worn" card where every bottle shows zero wears is worse than not
 * offering the mode, and worse still than quietly showing an arbitrary six.
 */
export function buildShelfCard(
  fragrances: Fragrance[],
  entries: SotdEntry[],
  mode: ShelfCardMode = 'most-worn',
): ShelfCardData | null {
  const owned = ownedBottles(fragrances);
  if (owned.length < MIN_BOTTLES_FOR_CARD) return null;

  // Scoped to owned ids rather than to whatever `wearCounts` returns: that
  // includes a row for every fragranceId in the diary, INCLUDING bottles the
  // user has since deleted, which would quietly inflate the headline with wears
  // of things no longer on the shelf.
  const ownedIds = new Set(owned.map((f) => f.id));
  const wearsById = new Map(
    wearCounts(fragrances, entries)
      .filter((c) => ownedIds.has(c.fragranceId))
      .map((c) => [c.fragranceId, c.wears]),
  );
  const totalWears = entries.filter((e) => ownedIds.has(e.fragranceId)).length;

  const effective: ShelfCardMode = mode === 'most-worn' && totalWears === 0 ? 'top-rated' : mode;

  let ordered: Fragrance[];
  switch (effective) {
    case 'top-rated':
      ordered = [...owned].sort(
        (a, b) => b.rating - a.rating || a.name.localeCompare(b.name),
      );
      break;
    case 'recent':
      ordered = [...owned].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name),
      );
      break;
    case 'most-worn':
    default:
      ordered = [...owned].sort(
        (a, b) =>
          (wearsById.get(b.id) ?? 0) - (wearsById.get(a.id) ?? 0) ||
          b.rating - a.rating ||
          a.name.localeCompare(b.name),
      );
      break;
  }

  return {
    mode: effective,
    title: MODE_LABEL[effective],
    stat: statLine(owned.length, totalWears),
    entries: ordered.slice(0, CARD_SLOTS).map((fragrance) => ({
      fragrance,
      caption: captionFor(fragrance, effective, wearsById.get(fragrance.id) ?? 0),
    })),
  };
}

/**
 * The line under each bottle name.
 *
 * Returns '' rather than a placeholder when the chosen mode has nothing to
 * report for that bottle — an empty line is honest, "0 wears" on a card headed
 * "most worn" is embarrassing, and "—" is neither.
 */
function captionFor(f: Fragrance, mode: ShelfCardMode, wears: number): string {
  if (mode === 'most-worn') {
    return wears > 0 ? `${wears} ${wears === 1 ? 'wear' : 'wears'}` : f.brand;
  }
  if (mode === 'top-rated') {
    return f.rating > 0 ? '★'.repeat(f.rating) : f.brand;
  }
  return f.brand;
}
