import { describe, expect, it } from 'vitest';
import { dayHeading, dayKey, formatWhen, timeOfDay } from './time.ts';

// 2026-10-09 09:42 UTC: 11:42 in Berlin, 10:42 in London, 05:42 in New York.
const at = Date.UTC(2026, 9, 9, 9, 42);
const hours = (n: number) => n * 60 * 60 * 1000;

describe('times in each viewer’s time zone (Q63)', () => {
  it('shows one instant as each time zone’s own time', () => {
    expect(timeOfDay(at, 'Europe/Berlin')).toBe('11:42');
    expect(timeOfDay(at, 'Europe/London')).toBe('10:42');
    expect(timeOfDay(at, 'America/New_York')).toBe('05:42');
  });

  it('says today, yesterday, then the date, by the viewer’s calendar', () => {
    const now = at + hours(3);
    expect(formatWhen(at, now, 'Europe/Berlin')).toBe('11:42');
    expect(formatWhen(at - hours(24), now, 'Europe/Berlin')).toBe('Yesterday 11:42');
    expect(formatWhen(at - hours(72), now, 'Europe/Berlin')).toBe('6 Oct 11:42');
    expect(formatWhen(at - hours(24 * 365), now, 'Europe/Berlin')).toBe('9 Oct 2025');
  });

  it('groups by the viewer’s day, which can differ between time zones', () => {
    // 23:30 UTC on the 8th is already the 9th in Berlin.
    const late = Date.UTC(2026, 9, 8, 23, 30);
    expect(dayKey(late, 'Europe/Berlin')).toBe('2026-10-09');
    expect(dayKey(late, 'America/New_York')).toBe('2026-10-08');
    expect(dayHeading(late, at, 'Europe/Berlin')).toBe('Today');
    expect(dayHeading(late, at, 'America/New_York')).toBe('Yesterday');
    expect(dayHeading(at - hours(72), at, 'Europe/Berlin')).toBe('Tuesday 6 October');
  });
});
