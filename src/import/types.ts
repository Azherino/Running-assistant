import type { WorkoutType } from '../engine/types';

export type ActivityFormat = 'tcx' | 'fit';

/** A run read from an exported activity file, before it becomes a logged run. */
export interface ImportedActivity {
  /** Local calendar date of the start, YYYY-MM-DD. */
  date: string;
  /** ISO timestamp of the start, when the file provides one. */
  startTime?: string;
  distanceM: number;
  durationS?: number;
  avgHr?: number;
  type?: WorkoutType;
  /** Original workout title, when the file has one. */
  name?: string;
  source: ActivityFormat;
  /** Stable-ish identifier from the file, used to spot re-imports. */
  externalId?: string;
}

export interface ParseOutcome {
  activities: ImportedActivity[];
  warnings: string[];
}
