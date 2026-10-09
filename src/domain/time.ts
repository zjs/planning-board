// Times as each viewer sees them (Q63): history keeps instants in UTC, and
// every viewer reads them in their own time zone. "10:42" today, "Yesterday
// 16:05", then the date.

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(at: number, timeZone?: string, locale?: string) {
  const f = new Intl.DateTimeFormat(locale ?? 'en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const get = (type: string) => f.formatToParts(at).find((p) => p.type === type)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}`, year: get('year') };
}

/** The calendar day an instant falls on in a time zone, as "2026-10-09": for grouping by day. */
export function dayKey(at: number, timeZone?: string): string {
  return parts(at, timeZone).day;
}

/** "10:42" today, "Yesterday 16:05", "8 Oct 16:05" this year, "8 Oct 2025" before. */
export function formatWhen(at: number, now: number, timeZone?: string, locale?: string): string {
  const then = parts(at, timeZone, locale);
  if (then.day === dayKey(now, timeZone)) return then.time;
  if (then.day === dayKey(now - DAY_MS, timeZone)) return `Yesterday ${then.time}`;
  const date = new Intl.DateTimeFormat(locale ?? 'en-GB', { timeZone, day: 'numeric', month: 'short' }).format(at);
  return then.year === parts(now, timeZone).year ? `${date} ${then.time}` : `${date} ${then.year}`;
}

/** A day's heading: "Today", "Yesterday", or "Wednesday 8 October". */
export function dayHeading(at: number, now: number, timeZone?: string, locale?: string): string {
  const day = dayKey(at, timeZone);
  if (day === dayKey(now, timeZone)) return 'Today';
  if (day === dayKey(now - DAY_MS, timeZone)) return 'Yesterday';
  const sameYear = parts(at, timeZone).year === parts(now, timeZone).year;
  return new Intl.DateTimeFormat(locale ?? 'en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(at);
}

/** Just the time of day, "16:05", in a time zone. */
export function timeOfDay(at: number, timeZone?: string, locale?: string): string {
  return parts(at, timeZone, locale).time;
}
