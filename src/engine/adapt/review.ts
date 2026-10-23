import { addDays, diffDays } from '../dates';
import type { LoggedRun, PlanWeek, WeekReview } from '../types';
import { acwrFor } from './acwr';

export interface ReviewOptions {
  /** Top of the easy heart-rate band; easy runs above this are counted. */
  easyHrCeiling?: number;
  injuryFlag?: boolean;
  painNote?: string;
}

/**
 * Turns a planned week plus the athlete's logs into the input for `reviewWeek`.
 *
 * Matching is by date: a run on a planned training day completes that session.
 * Extra runs on rest days add volume but do not inflate compliance.
 */
export function buildWeekReview(
  week: PlanWeek,
  runs: LoggedRun[],
  options: ReviewOptions = {},
): WeekReview {
  const weekEnd = addDays(week.startDate, 6);
  const weekRuns = runs.filter(
    (run) =>
      run.type !== 'cross' &&
      diffDays(week.startDate, run.date) >= 0 &&
      diffDays(run.date, weekEnd) >= 0,
  );

  const planned = week.workouts.filter((workout) => workout.type !== 'rest');
  const plannedDates = new Set(planned.map((workout) => workout.date));
  const runDates = new Set(weekRuns.map((run) => run.date));

  const completedSessions = [...plannedDates].filter((date) => runDates.has(date)).length;
  const missedQuality = planned.filter(
    (workout) => workout.hard && !runDates.has(workout.date),
  ).length;

  // RPE and HR only make sense on aerobic days; quality RPE is expected to be high.
  const easyDates = new Set(
    week.workouts
      .filter((workout) => workout.type === 'easy' || workout.type === 'long')
      .map((workout) => workout.date),
  );
  const easyRuns = weekRuns.filter((run) => easyDates.has(run.date));
  const easyRpes = easyRuns
    .map((run) => run.rpe)
    .filter((rpe): rpe is number => rpe != null);
  const easyRpeAvg =
    easyRpes.length > 0
      ? easyRpes.reduce((sum, rpe) => sum + rpe, 0) / easyRpes.length
      : undefined;

  const easyRunsAboveHrZone =
    options.easyHrCeiling == null
      ? 0
      : easyRuns.filter((run) => run.avgHr != null && run.avgHr > options.easyHrCeiling!).length;

  const allRuns = runs.filter(
    (run) => run.type !== 'cross' && diffDays(run.date, weekEnd) >= 0,
  );
  const acwr = acwrFor(
    allRuns.map((run) => ({ date: run.date, km: run.distanceM / 1000 })),
    weekEnd,
  );

  const review: WeekReview = {
    weekStart: week.startDate,
    plannedKm: week.targetVolumeKm,
    completedKm: weekRuns.reduce((sum, run) => sum + run.distanceM / 1000, 0),
    plannedSessions: planned.length,
    completedSessions,
    missedQuality,
    easyRunsAboveHrZone,
    acwr,
    injuryFlag: options.injuryFlag ?? false,
    isDownWeek: week.isDownWeek,
  };

  if (easyRpeAvg != null) review.easyRpeAvg = Math.round(easyRpeAvg * 10) / 10;
  if (options.painNote != null) review.painNote = options.painNote;
  return review;
}

/** The plan week containing `date`, if any. */
export function weekForDate(weeks: PlanWeek[], date: string): PlanWeek | undefined {
  return weeks.find(
    (week) => diffDays(week.startDate, date) >= 0 && diffDays(date, addDays(week.startDate, 6)) >= 0,
  );
}
