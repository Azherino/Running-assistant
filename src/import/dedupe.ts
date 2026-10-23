import type { ImportedActivity } from './types';

export interface ComparableRun {
  date: string;
  distanceM: number;
  durationS?: number | null;
}

function closeEnough(activity: number, existing: number, relative: number, minimum: number): boolean {
  return Math.abs(activity - existing) <= Math.max(minimum, Math.abs(activity) * relative);
}

/**
 * Imports are meant to fill gaps, not to double-count. A run on the same day
 * within 2% (or 200 m) of the same distance is treated as already logged.
 * Duration only breaks the tie when both sides have one.
 */
export function isDuplicate(activity: ImportedActivity, runs: ComparableRun[]): boolean {
  return runs.some((run) => {
    if (run.date !== activity.date) return false;
    if (!closeEnough(activity.distanceM, run.distanceM, 0.02, 200)) return false;

    if (activity.durationS != null && run.durationS != null) {
      return closeEnough(activity.durationS, run.durationS, 0.02, 120);
    }
    return true;
  });
}
