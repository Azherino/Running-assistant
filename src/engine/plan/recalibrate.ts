import { diffDays, type ISODate } from '../dates';
import { buildPaceZones } from '../paces';
import type { Plan, Workout } from '../types';
import { withTotals } from './sessions';

/**
 * Re-derives pace targets for sessions on or after `fromDate`. Past sessions
 * are never touched; race day keeps its goal time.
 */
export function recalibratePlan(plan: Plan, newVdot: number, fromDate: ISODate): Plan {
  const paces = buildPaceZones(newVdot);
  let updatedSessions = 0;

  const weeks = plan.weeks.map((week) => ({
    ...week,
    workouts: week.workouts.map((workout) => {
      if (diffDays(fromDate, workout.date) < 0) return workout;
      if (workout.type === 'race' || workout.steps.length === 0) return workout;

      const steps = workout.steps.map((step) => {
        if (!step.zone) return step;
        const band = paces[step.zone];
        return {
          ...step,
          paceMinSPerKm: band.minSPerKm,
          paceMaxSPerKm: band.maxSPerKm,
        };
      });

      updatedSessions += 1;

      const next: Omit<Workout, 'targetDistanceM' | 'targetDurationS'> = {
        date: workout.date,
        type: workout.type,
        title: workout.title,
        purpose: workout.purpose,
        steps,
        hard: workout.hard,
        note: workout.note,
      };
      return withTotals(next, paces);
    }),
  }));

  return {
    ...plan,
    vdot: newVdot,
    paces,
    weeks,
    notes: [
      ...(plan.notes ?? []),
      `Paces recalibrated to VDOT ${newVdot.toFixed(1)} from ${fromDate}. ` +
        `${updatedSessions} future sessions updated; completed weeks were left alone.`,
    ],
  };
}
