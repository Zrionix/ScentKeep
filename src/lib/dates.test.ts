import { DateTime } from 'luxon';
import {
  daysSince,
  formatReminderTime,
  friendlyDate,
  parseReminderTime,
  recentDates,
  relativeSpan,
  seasonForDate,
  todayIso,
} from './dates';

describe('daysSince', () => {
  const now = DateTime.fromISO('2026-07-28T12:00:00', { zone: 'utc' });

  it('counts today as 0 and yesterday as 1', () => {
    expect(daysSince('2026-07-28', now)).toBe(0);
    expect(daysSince('2026-07-27', now)).toBe(1);
  });

  it('counts a long gap exactly', () => {
    expect(daysSince('2026-04-29', now)).toBe(90);
    expect(daysSince('2025-06-23', now)).toBe(400);
  });

  it('returns 0 rather than NaN for a malformed date', () => {
    expect(daysSince('not-a-date', now)).toBe(0);
  });

  // Regression: a bare YYYY-MM-DD has no zone. Parsing it in the system zone
  // while `now` was UTC-zoned shifted every result by a day for anyone west of
  // Greenwich, which moved bottles in and out of the 90-day neglected list.
  it('is zone-coherent: the same gap measures the same from any zone', () => {
    const zones = ['utc', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati'];
    for (const zone of zones) {
      const localNow = DateTime.fromISO('2026-07-28T12:00:00', { zone });
      expect(daysSince('2026-04-29', localNow)).toBe(90);
      expect(daysSince(localNow.toISODate()!, localNow)).toBe(0);
    }
  });

  it('treats a date late in the local evening as still being today', () => {
    // 23:30 in Los Angeles is already tomorrow in UTC — the diary must follow
    // the wearer's calendar, not UTC's.
    const lateNight = DateTime.fromISO('2026-07-28T23:30:00', { zone: 'America/Los_Angeles' });
    expect(daysSince('2026-07-28', lateNight)).toBe(0);
    expect(todayIso(lateNight)).toBe('2026-07-28');
  });
});

describe('friendlyDate', () => {
  const now = DateTime.fromISO('2026-07-28T12:00:00', { zone: 'utc' });

  it('labels the recent days in words', () => {
    expect(friendlyDate('2026-07-28', now)).toBe('Today');
    expect(friendlyDate('2026-07-27', now)).toBe('Yesterday');
  });

  it('omits the year inside the current year and includes it otherwise', () => {
    expect(friendlyDate('2026-03-04', now)).toBe('Wed 4 Mar');
    expect(friendlyDate('2025-03-04', now)).toBe('4 Mar 2025');
  });

  it('echoes an unparseable value instead of rendering "Invalid DateTime"', () => {
    expect(friendlyDate('nonsense', now)).toBe('nonsense');
  });
});

describe('relativeSpan', () => {
  const now = DateTime.fromISO('2026-07-28T12:00:00', { zone: 'utc' });

  it('says so plainly when a bottle has never been worn', () => {
    expect(relativeSpan(null, now)).toBe('Never worn');
  });

  it('scales the unit with the gap', () => {
    expect(relativeSpan('2026-07-28', now)).toBe('Today');
    expect(relativeSpan('2026-07-27', now)).toBe('Yesterday');
    expect(relativeSpan('2026-07-18', now)).toBe('10 days ago');
    expect(relativeSpan('2026-06-20', now)).toBe('1 month ago');
    expect(relativeSpan('2026-01-28', now)).toBe('6 months ago');
    expect(relativeSpan('2024-07-28', now)).toBe('2 years ago');
  });
});

describe('seasonForDate', () => {
  it('maps months to northern-hemisphere seasons', () => {
    expect(seasonForDate('2026-04-15')).toBe('Spring');
    expect(seasonForDate('2026-07-15')).toBe('Summer');
    expect(seasonForDate('2026-10-15')).toBe('Autumn');
    expect(seasonForDate('2026-01-15')).toBe('Winter');
    expect(seasonForDate('2026-12-15')).toBe('Winter');
  });
});

describe('recentDates', () => {
  it('returns N consecutive dates ending today, oldest first', () => {
    const now = DateTime.fromISO('2026-07-28T12:00:00', { zone: 'utc' });
    expect(recentDates(3, now)).toEqual(['2026-07-26', '2026-07-27', '2026-07-28']);
  });

  it('returns an empty list for a zero count', () => {
    expect(recentDates(0, DateTime.fromISO('2026-07-28T12:00:00', { zone: 'utc' }))).toEqual([]);
  });
});

describe('reminder time', () => {
  it('parses a valid 24h time', () => {
    expect(parseReminderTime('07:30')).toEqual({ hour: 7, minute: 30 });
    expect(parseReminderTime('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('falls back to 09:00 on anything malformed or out of range', () => {
    for (const bad of ['', 'nope', '25:00', '12:99', '9', '09:0', '-1:00']) {
      expect(parseReminderTime(bad)).toEqual({ hour: 9, minute: 0 });
    }
  });

  it('formats for display', () => {
    expect(formatReminderTime('09:00')).toBe('9:00 AM');
    expect(formatReminderTime('18:05')).toBe('6:05 PM');
    expect(formatReminderTime('00:00')).toBe('12:00 AM');
  });
});
