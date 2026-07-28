import { DateTime } from 'luxon';
import type { IsoDate } from '@/domain/types';

// ---------------------------------------------------------------------------
// All calendar maths runs in the user's LOCAL zone. "Today" for a scent diary
// means the day the wearer is living in, not UTC — logging at 8pm on the US west
// coast must not land on tomorrow's date.
//
// Every function takes an optional `now` so tests are deterministic without
// mocking the clock.
// ---------------------------------------------------------------------------

export function todayIso(now: DateTime = DateTime.local()): IsoDate {
  return now.toISODate()!;
}

export function isoToDateTime(iso: IsoDate): DateTime {
  return DateTime.fromISO(iso);
}

/**
 * A bare `YYYY-MM-DD` carries no zone, so it MUST be interpreted in the same
 * zone as the `now` it will be compared against. Parsing it in the system zone
 * while comparing against a UTC `now` (or vice versa) shifts the result by a
 * whole day for anyone west of Greenwich — which silently mis-dated "days since
 * worn" and pushed bottles in and out of the neglected list by one day.
 */
function atZoneOf(iso: IsoDate, now: DateTime): DateTime {
  return DateTime.fromISO(iso, { zone: now.zone });
}

/** Whole days from `iso` up to `now`. Same day = 0, yesterday = 1. */
export function daysSince(iso: IsoDate, now: DateTime = DateTime.local()): number {
  const then = atZoneOf(iso, now).startOf('day');
  if (!then.isValid) return 0;
  return Math.floor(now.startOf('day').diff(then, 'days').days);
}

/** "Today" / "Yesterday" / "Mon 4 Aug" — the diary's date label. */
export function friendlyDate(iso: IsoDate, now: DateTime = DateTime.local()): string {
  // Validity is checked BEFORE the day arithmetic: `daysSince` returns 0 for an
  // unparseable date, so testing it first would label corrupt data "Today" —
  // the one label a reader would never question.
  const dt = atZoneOf(iso, now);
  if (!dt.isValid) return iso;

  const d = daysSince(iso, now);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return dt.year === now.year ? dt.toFormat('ccc d LLL') : dt.toFormat('d LLL yyyy');
}

/** "3 days ago", "2 months ago" — for the neglected-bottles list. */
export function relativeSpan(iso: IsoDate | null, now: DateTime = DateTime.local()): string {
  if (!iso) return 'Never worn';
  const d = daysSince(iso, now);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  const months = Math.floor(d / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(d / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/** Northern-hemisphere meteorological season for a date. */
export function seasonForDate(iso: IsoDate): 'Spring' | 'Summer' | 'Autumn' | 'Winter' {
  const m = DateTime.fromISO(iso).month;
  if (m >= 3 && m <= 5) return 'Spring';
  if (m >= 6 && m <= 8) return 'Summer';
  if (m >= 9 && m <= 11) return 'Autumn';
  return 'Winter';
}

/** The last `count` ISO dates ending today, oldest first — the diary heatmap. */
export function recentDates(count: number, now: DateTime = DateTime.local()): IsoDate[] {
  const out: IsoDate[] = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(now.minus({ days: i }).toISODate()!);
  return out;
}

/** Parses "HH:mm" into parts; falls back to 09:00 on anything malformed. */
export function parseReminderTime(value: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return { hour: 9, minute: 0 };
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return { hour: 9, minute: 0 };
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return { hour: 9, minute: 0 };
  return { hour, minute };
}

/** "09:00" -> "9:00 AM" for display. */
export function formatReminderTime(value: string): string {
  const { hour, minute } = parseReminderTime(value);
  return DateTime.fromObject({ hour, minute }).toFormat('h:mm a');
}
