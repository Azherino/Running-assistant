/** Local calendar date, matching how the app logs runs. */
export function localISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses a timestamp, keeping local calendar semantics for offset-less values. */
export function parseStartTime(value: unknown): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Sport names differ between TCX (`Sport="Running"`) and FIT (numeric enum).
 * Anything that is not running is imported as cross-training.
 */
export function workoutTypeForSport(sport: string | number | undefined): {
  type: import('../engine/types').WorkoutType;
  running: boolean;
} {
  if (typeof sport === 'number') {
    // FIT sport enum: 1 running, 2 cycling, 3 transition, 4 fitness equipment, 5 swimming.
    if (sport === 1) return { type: 'easy', running: true };
    return { type: 'cross', running: false };
  }

  const text = (sport ?? '').toLowerCase();
  if (text.includes('run') || text.includes('jog')) return { type: 'easy', running: true };
  return { type: 'cross', running: false };
}

/** Runs under 200 m are almost always accidental laps or test files. */
export const MIN_IMPORT_DISTANCE_M = 200;
