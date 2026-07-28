import { DateTime } from 'luxon';
import { daysSince, todayIso } from '@/lib/dates';
import { historyCutoffDays } from './entitlements';
import type { Fragrance, IsoDate, SotdEntry } from './types';

// ---------------------------------------------------------------------------
// The Scent of the Day diary — the app's daily loop.
//
// Everything here is a pure derivation over the entry list. The diary is
// append-mostly history, so these functions never mutate; they group, count and
// slice.
// ---------------------------------------------------------------------------

/** Entries for a given day, newest-logged first. */
export function entriesForDate(entries: SotdEntry[], date: IsoDate): SotdEntry[] {
  return entries
    .filter((e) => e.date === date)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Has anything been logged today? Drives the home screen's primary call to action. */
export function hasLoggedToday(entries: SotdEntry[], now: DateTime = DateTime.local()): boolean {
  return entries.some((e) => e.date === todayIso(now));
}

export interface DiaryDay {
  date: IsoDate;
  entries: SotdEntry[];
}

/** Entries grouped into days, most recent day first. Empty days are omitted. */
export function groupByDay(entries: SotdEntry[]): DiaryDay[] {
  const byDate = new Map<IsoDate, SotdEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  return [...byDate.entries()]
    .map(([date, list]) => ({
      date,
      entries: list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * The slice of history a user is entitled to read. Free keeps a rolling window;
 * premium sees everything.
 *
 * Note this only limits READING. Logging is never capped, so a free user who
 * upgrades gets their full back-catalogue — we never threw the data away.
 */
export function visibleHistory(
  entries: SotdEntry[],
  isPremium: boolean,
  now: DateTime = DateTime.local(),
): SotdEntry[] {
  const cutoff = historyCutoffDays(isPremium);
  if (cutoff === null) return entries;
  return entries.filter((e) => daysSince(e.date, now) < cutoff);
}

/** How many entries the free tier is currently hiding — powers the upsell row. */
export function hiddenHistoryCount(
  entries: SotdEntry[],
  isPremium: boolean,
  now: DateTime = DateTime.local(),
): number {
  if (isPremium) return 0;
  return entries.length - visibleHistory(entries, false, now).length;
}

/**
 * Consecutive days logged, counting back from today. A gap ends the streak.
 * Today not yet logged does NOT break it — the day isn't over — so the streak
 * counts back from yesterday in that case.
 */
export function currentStreak(entries: SotdEntry[], now: DateTime = DateTime.local()): number {
  if (entries.length === 0) return 0;
  const logged = new Set(entries.map((e) => e.date));

  let cursor = now.startOf('day');
  // Grace for today: if nothing is logged yet today, start counting at yesterday
  // rather than reporting a broken streak at breakfast.
  if (!logged.has(cursor.toISODate()!)) cursor = cursor.minus({ days: 1 });

  let streak = 0;
  while (logged.has(cursor.toISODate()!)) {
    streak += 1;
    cursor = cursor.minus({ days: 1 });
  }
  return streak;
}

/** Longest run of consecutive logged days, ever. */
export function longestStreak(entries: SotdEntry[]): number {
  if (entries.length === 0) return 0;
  const dates = [...new Set(entries.map((e) => e.date))].sort();

  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i += 1) {
    const prev = DateTime.fromISO(dates[i - 1]);
    const curr = DateTime.fromISO(dates[i]);
    const gap = curr.diff(prev, 'days').days;
    if (gap === 1) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

/** Distinct days on which anything was logged. */
export function daysLogged(entries: SotdEntry[]): number {
  return new Set(entries.map((e) => e.date)).size;
}

/**
 * A bottle worth re-discovering: owned, and either never worn or untouched the
 * longest. Powers the optional "rediscover" nudge. Returns null when the shelf
 * is too small for the suggestion to be interesting.
 */
export function rediscoverSuggestion(
  fragrances: Fragrance[],
  entries: SotdEntry[],
  now: DateTime = DateTime.local(),
  minCollectionSize = 3,
): Fragrance | null {
  const owned = fragrances.filter((f) => !f.inWishlist);
  if (owned.length < minCollectionSize) return null;

  const lastWorn = new Map<string, IsoDate>();
  for (const e of entries) {
    const prev = lastWorn.get(e.fragranceId);
    if (!prev || e.date > prev) lastWorn.set(e.fragranceId, e.date);
  }

  // Don't suggest what is already in rotation this week.
  const candidates = owned.filter((f) => {
    const worn = lastWorn.get(f.id);
    return !worn || daysSince(worn, now) >= 7;
  });
  if (candidates.length === 0) return null;

  // Never-worn wins; otherwise the longest-neglected. Ties resolve by name so
  // the suggestion is stable across renders rather than flickering.
  return candidates.sort((a, b) => {
    const aWorn = lastWorn.get(a.id);
    const bWorn = lastWorn.get(b.id);
    if (!aWorn && !bWorn) return a.name.localeCompare(b.name);
    if (!aWorn) return -1;
    if (!bWorn) return 1;
    return aWorn.localeCompare(bWorn) || a.name.localeCompare(b.name);
  })[0];
}

/**
 * Whether logging `fragranceId` today would duplicate an existing entry. The DB
 * enforces this with a unique constraint; checking here lets the UI say "already
 * logged" instead of surfacing a constraint violation.
 */
export function alreadyLogged(
  entries: SotdEntry[],
  fragranceId: string,
  date: IsoDate,
): boolean {
  return entries.some((e) => e.fragranceId === fragranceId && e.date === date);
}
