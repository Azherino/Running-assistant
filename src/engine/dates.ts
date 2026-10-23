/**
 * Date helpers. All plan dates are plain `YYYY-MM-DD` strings interpreted as UTC,
 * so a plan generated in any timezone has the same shape.
 */

export type ISODate = string;

export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function fromISODate(value: ISODate): Date {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) throw new Error(`Invalid ISO date: ${value}`);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = fromISODate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/** Whole days from `a` to `b`; positive when `b` is later. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86_400_000);
}

/** Monday = 1 ... Sunday = 7. */
export function dayOfWeek(date: ISODate): number {
  const day = fromISODate(date).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday on or before the given date. */
export function startOfWeek(date: ISODate): ISODate {
  return addDays(date, 1 - dayOfWeek(date));
}

export const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function weekdayName(date: ISODate): string {
  return WEEKDAY_NAMES[dayOfWeek(date) - 1] ?? '?';
}
