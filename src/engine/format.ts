import { formatDuration, formatPace } from './paces';
import type { Workout, WorkoutStep } from './types';

function distanceLabel(meters: number): string {
  if (meters >= 1000) {
    const km = meters / 1000;
    const rounded = Math.round(km);
    // Keep the decimals that matter: 21.1 km, 42.2 km, but 6 km and 35 km.
    const text = Math.abs(km - rounded) < 0.05 ? rounded.toFixed(0) : km.toFixed(1);
    return `${text} km`;
  }
  return `${Math.round(meters)} m`;
}

function paceLabel(step: WorkoutStep): string {
  if (step.paceMinSPerKm == null || step.paceMaxSPerKm == null) return '';
  const min = formatPace(step.paceMinSPerKm);
  const max = formatPace(step.paceMaxSPerKm);
  return min === max ? `@ ${min}/km` : `@ ${min}-${max}/km`;
}

/** One human-readable line per step, e.g. "6 x 800 m @ 3:52-3:58/km". */
export function describeStep(step: WorkoutStep): string {
  const reps = step.reps ?? 1;
  const prefix = reps > 1 ? `${reps} x ` : '';
  const pace = paceLabel(step);

  if (step.distanceM != null) {
    return `${prefix}${distanceLabel(step.distanceM)} ${pace}`.trim();
  }
  if (step.durationS != null) {
    const duration =
      step.durationS < 60 ? `${Math.round(step.durationS)} s` : formatDuration(step.durationS);
    return `${prefix}${duration} ${pace}`.trim();
  }
  return step.label;
}

export function describeWorkout(workout: Workout): string[] {
  return workout.steps.map((step) => `${step.label}: ${describeStep(step)}`);
}

/** Total time as "52 min" or "1 h 12 min". */
export function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
