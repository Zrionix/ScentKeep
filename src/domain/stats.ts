import { DateTime } from 'luxon';
import { daysSince, seasonForDate } from '@/lib/dates';
import type { Fragrance, IsoDate, SotdEntry } from './types';

// ---------------------------------------------------------------------------
// Collection insights — the primary paid hook (brief §5 of the product spec).
//
// Pure functions over plain arrays: no store, no network, no React. Every
// number here is unit-tested, because a stats screen that quietly miscounts is
// worse than no stats screen at all.
//
// Money rule (Tips §10B): never show a figure we can't stand behind. Collection
// value sums ONLY bottles that actually carry a price, and reports how many were
// left out so the UI can say "based on 9 of 14 bottles" instead of implying the
// whole shelf is worth that.
// ---------------------------------------------------------------------------

/** Days without a wear before a bottle counts as neglected. */
export const NEGLECTED_AFTER_DAYS = 90;

/** Window used for the "rotation" figure. */
export const ROTATION_WINDOW_DAYS = 30;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function ownedBottles(fragrances: Fragrance[]): Fragrance[] {
  return fragrances.filter((f) => !f.inWishlist);
}

export function wishlistBottles(fragrances: Fragrance[]): Fragrance[] {
  return fragrances.filter((f) => f.inWishlist);
}

export interface CollectionValue {
  /** Summed price of every owned bottle that HAS a price. */
  total: number;
  /** How many owned bottles contributed. */
  pricedCount: number;
  /** How many owned bottles were skipped for lack of a price. */
  unpricedCount: number;
  /** Mean price across the priced bottles only. */
  average: number;
  currency: string;
}

export function collectionValue(fragrances: Fragrance[], fallbackCurrency = 'USD'): CollectionValue {
  const owned = ownedBottles(fragrances);
  const priced = owned.filter((f) => typeof f.price === 'number' && f.price !== null && f.price > 0);
  const total = priced.reduce((sum, f) => sum + (f.price ?? 0), 0);
  return {
    total: round2(total),
    pricedCount: priced.length,
    unpricedCount: owned.length - priced.length,
    average: priced.length ? round2(total / priced.length) : 0,
    // The collection's currency is whatever the priced bottles agree on; mixed
    // currencies fall back to the user's setting rather than silently adding
    // euros to dollars in the displayed symbol.
    currency: priced.length && priced.every((f) => f.currency === priced[0].currency)
      ? priced[0].currency
      : fallbackCurrency,
  };
}

/** Total millilitres of juice on the shelf — a collector vanity metric.
 *  This is CAPACITY bought, not what is left; see `totalRemainingMl`. */
export function totalVolumeMl(fragrances: Fragrance[]): number {
  return round2(ownedBottles(fragrances).reduce((sum, f) => sum + (f.sizeMl ?? 0), 0));
}

/** Owned items grouped by container type. Collectors want the decant count
 *  separately — "40 fragrances" reads very differently from "8 bottles and
 *  32 decants". */
export function typeBreakdown(fragrances: Fragrance[]): Breakdown[] {
  return tally(ownedBottles(fragrances).map((f) => f.type));
}

/** Owned bottles by concentration (EDT / EDP / Parfum …). */
export function concentrationBreakdown(fragrances: Fragrance[]): Breakdown[] {
  return tally(
    ownedBottles(fragrances)
      .filter((f) => Boolean(f.concentration))
      .map((f) => f.concentration as string),
  );
}

/** Owned bottles by how the house is positioned (designer / niche / indie …). */
export function houseTierBreakdown(fragrances: Fragrance[]): Breakdown[] {
  return tally(
    ownedBottles(fragrances)
      .filter((f) => Boolean(f.houseTier))
      .map((f) => f.houseTier as string),
  );
}

export interface WearCount {
  fragranceId: string;
  fragrance: Fragrance | undefined;
  wears: number;
  lastWorn: IsoDate | null;
  /** price / wears, when both are known. The honest "was it worth it" number. */
  costPerWear: number | null;
}

/** Wear counts for every fragrance that has ever been logged, most-worn first. */
export function wearCounts(fragrances: Fragrance[], entries: SotdEntry[]): WearCount[] {
  const byId = new Map<string, Fragrance>(fragrances.map((f) => [f.id, f]));
  const counts = new Map<string, { wears: number; lastWorn: IsoDate | null }>();

  for (const e of entries) {
    const prev = counts.get(e.fragranceId) ?? { wears: 0, lastWorn: null };
    counts.set(e.fragranceId, {
      wears: prev.wears + 1,
      lastWorn: !prev.lastWorn || e.date > prev.lastWorn ? e.date : prev.lastWorn,
    });
  }

  const out: WearCount[] = [];
  for (const [fragranceId, { wears, lastWorn }] of counts) {
    const fragrance = byId.get(fragranceId);
    const price = fragrance?.price ?? null;
    out.push({
      fragranceId,
      fragrance,
      wears,
      lastWorn,
      costPerWear: price !== null && price > 0 && wears > 0 ? round2(price / wears) : null,
    });
  }

  // Most-worn first; ties broken by the more recent wear so the list is stable
  // and the bottle you actually reached for last ranks above one you didn't.
  return out.sort((a, b) => b.wears - a.wears || (b.lastWorn ?? '').localeCompare(a.lastWorn ?? ''));
}

/** Wear counts including owned bottles that have NEVER been worn (wears: 0). */
export function wearCountsIncludingUnworn(
  fragrances: Fragrance[],
  entries: SotdEntry[],
): WearCount[] {
  const counted = wearCounts(fragrances, entries);
  const seen = new Set(counted.map((w) => w.fragranceId));
  const unworn: WearCount[] = ownedBottles(fragrances)
    .filter((f) => !seen.has(f.id))
    .map((f) => ({ fragranceId: f.id, fragrance: f, wears: 0, lastWorn: null, costPerWear: null }));
  return [...counted, ...unworn];
}

export interface NeglectedBottle {
  fragrance: Fragrance;
  lastWorn: IsoDate | null;
  daysSinceWorn: number | null;
}

/**
 * Owned bottles not worn in `afterDays`. Never-worn bottles are included — they
 * are the most neglected of all — and sort to the top with `daysSinceWorn: null`.
 */
export function neglectedBottles(
  fragrances: Fragrance[],
  entries: SotdEntry[],
  afterDays = NEGLECTED_AFTER_DAYS,
  now: DateTime = DateTime.local(),
): NeglectedBottle[] {
  const lastWornById = new Map<string, IsoDate>();
  for (const e of entries) {
    const prev = lastWornById.get(e.fragranceId);
    if (!prev || e.date > prev) lastWornById.set(e.fragranceId, e.date);
  }

  const out: NeglectedBottle[] = [];
  for (const f of ownedBottles(fragrances)) {
    const lastWorn = lastWornById.get(f.id) ?? null;
    if (lastWorn === null) {
      out.push({ fragrance: f, lastWorn: null, daysSinceWorn: null });
      continue;
    }
    const d = daysSince(lastWorn, now);
    if (d >= afterDays) out.push({ fragrance: f, lastWorn, daysSinceWorn: d });
  }

  // Never-worn first, then longest-neglected.
  return out.sort((a, b) => {
    if (a.daysSinceWorn === null && b.daysSinceWorn === null) return 0;
    if (a.daysSinceWorn === null) return -1;
    if (b.daysSinceWorn === null) return 1;
    return b.daysSinceWorn - a.daysSinceWorn;
  });
}

export interface Rotation {
  /** Distinct bottles worn inside the window. */
  distinctWorn: number;
  /** Owned bottles at the time of asking. */
  owned: number;
  /** distinctWorn / owned, 0..1. Zero when nothing is owned. */
  ratio: number;
  windowDays: number;
}

/** How much of the collection is actually in play, over the last N days. */
export function rotation(
  fragrances: Fragrance[],
  entries: SotdEntry[],
  windowDays = ROTATION_WINDOW_DAYS,
  now: DateTime = DateTime.local(),
): Rotation {
  const owned = ownedBottles(fragrances);
  const ownedIds = new Set(owned.map((f) => f.id));
  const distinct = new Set<string>();

  for (const e of entries) {
    if (!ownedIds.has(e.fragranceId)) continue; // a wishlist/deleted bottle isn't rotation
    if (daysSince(e.date, now) < windowDays) distinct.add(e.fragranceId);
  }

  return {
    distinctWorn: distinct.size,
    owned: owned.length,
    ratio: owned.length ? round2(distinct.size / owned.length) : 0,
    windowDays,
  };
}

export interface Breakdown {
  label: string;
  count: number;
  /** Share of the total, 0..1. */
  share: number;
}

function tally(labels: string[]): Breakdown[] {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  const total = labels.length;
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: total ? round2(count / total) : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Owned bottles grouped by olfactory family. Unset families are excluded. */
export function familyBreakdown(fragrances: Fragrance[]): Breakdown[] {
  return tally(
    ownedBottles(fragrances)
      .map((f) => f.family)
      .filter((f): f is string => Boolean(f && f.trim())),
  );
}

/** Owned bottles grouped by tagged season. A bottle tagged for two seasons
 *  counts once in each, so shares are of TAGS, not of bottles. */
export function seasonBreakdown(fragrances: Fragrance[]): Breakdown[] {
  return tally(ownedBottles(fragrances).flatMap((f) => f.seasons));
}

/** What you ACTUALLY wore, grouped by the season of the day you wore it. */
export function wearsBySeason(entries: SotdEntry[]): Breakdown[] {
  return tally(entries.map((e) => seasonForDate(e.date)));
}

/** Mean wears per week over the period the diary actually covers. */
export function averageWearsPerWeek(
  entries: SotdEntry[],
  now: DateTime = DateTime.local(),
): number {
  if (entries.length === 0) return 0;
  const earliest = entries.reduce((min, e) => (e.date < min ? e.date : min), entries[0].date);
  // At least one week, so a diary three days old doesn't report 40 wears/week.
  const spanDays = Math.max(7, daysSince(earliest, now) + 1);
  return round2((entries.length / spanDays) * 7);
}

export interface StatsSummary {
  bottles: number;
  wishlist: number;
  value: CollectionValue;
  volumeMl: number;
  totalWears: number;
  mostWorn: WearCount[];
  neglected: NeglectedBottle[];
  rotation: Rotation;
  families: Breakdown[];
  seasons: Breakdown[];
  types: Breakdown[];
  concentrations: Breakdown[];
  houseTiers: Breakdown[];
  wearsPerWeek: number;
  /** Best value-for-money bottle: lowest cost-per-wear, min 3 wears. */
  bestValue: WearCount | null;
}

export function summarise(
  fragrances: Fragrance[],
  entries: SotdEntry[],
  fallbackCurrency = 'USD',
  now: DateTime = DateTime.local(),
): StatsSummary {
  const worn = wearCounts(fragrances, entries);
  const withCpw = worn.filter((w) => w.costPerWear !== null && w.wears >= 3 && !w.fragrance?.inWishlist);

  return {
    bottles: ownedBottles(fragrances).length,
    wishlist: wishlistBottles(fragrances).length,
    value: collectionValue(fragrances, fallbackCurrency),
    volumeMl: totalVolumeMl(fragrances),
    totalWears: entries.length,
    mostWorn: worn.slice(0, 5),
    neglected: neglectedBottles(fragrances, entries, NEGLECTED_AFTER_DAYS, now),
    rotation: rotation(fragrances, entries, ROTATION_WINDOW_DAYS, now),
    families: familyBreakdown(fragrances),
    seasons: seasonBreakdown(fragrances),
    types: typeBreakdown(fragrances),
    concentrations: concentrationBreakdown(fragrances),
    houseTiers: houseTierBreakdown(fragrances),
    wearsPerWeek: averageWearsPerWeek(entries, now),
    bestValue: withCpw.length
      ? withCpw.reduce((best, w) => (w.costPerWear! < best.costPerWear! ? w : best))
      : null,
  };
}
