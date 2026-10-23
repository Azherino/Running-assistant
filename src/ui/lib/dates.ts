import { fromISODate, weekdayName } from '../../engine/dates';
import { formatDuration } from '../../engine/paces';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local calendar date as YYYY-MM-DD. Plans are calendar-based, not UTC-based. */
export function todayISO(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftISO(iso: string, days: number): string {
  const date = fromISODate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "Mon 12 Jan" */
export function dateLabel(iso: string): string {
  const date = fromISODate(iso);
  return `${weekdayName(iso)} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** "12 January 2026" */
export function longDateLabel(iso: string): string {
  const date = fromISODate(iso);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function rangeLabel(startISO: string, endISO: string): string {
  const start = fromISODate(startISO);
  const end = fromISODate(endISO);
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`;
  }
  return `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]} – ${end.getUTCDate()} ${
    MONTHS[end.getUTCMonth()]
  }`;
}

/**
 * Parses "45:00", "1:40:00", "20" (minutes) into seconds.
 * Two fields are minutes:seconds, which is the common way to write a 5K time.
 */
export function parseTimeToSeconds(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, '.');
  if (cleaned.length === 0) return null;

  const parts = cleaned.split(':');
  if (parts.some((part) => part.length === 0 || !/^\d+$/.test(part))) return null;

  let seconds: number;
  if (parts.length === 1) {
    seconds = Number(parts[0]) * 60;
  } else if (parts.length === 2) {
    seconds = Number(parts[0]) * 60 + Number(parts[1]);
    if (Number(parts[1]) > 59) return null;
  } else if (parts.length === 3) {
    seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
    if (Number(parts[1]) > 59 || Number(parts[2]) > 59) return null;
  } else {
    return null;
  }

  return seconds > 0 ? seconds : null;
}

export function secondsToClock(seconds: number): string {
  return formatDuration(seconds);
}

export function kmLabel(meters: number): string {
  const km = meters / 1000;
  const rounded = Math.round(km);
  return Math.abs(km - rounded) < 0.05 ? `${rounded}` : km.toFixed(1);
}

/** Parses "5,4" or "5.4" into a positive number. */
export function parseNumber(input: string): number | null {
  const value = Number(input.trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isoIsValid(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = fromISODate(iso);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso;
}
