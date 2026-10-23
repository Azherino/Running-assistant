import { equivalentTimeS, vdotFromPerformance } from './vdot';
import { RACE_DISTANCE_LABELS } from './paces';
import type { RaceDistance } from './types';

export interface RacePrediction {
  distanceKm: RaceDistance;
  label: string;
  timeS: number;
  paceSPerKm: number;
  /** Marathon-equivalents need a fatigue allowance, flagged for the UI. */
  optimistic: boolean;
}

const DISTANCES: RaceDistance[] = [5, 10, 21.0975, 42.195];

/**
 * Equivalent race times from a single VDOT. Equivalent performance assumes
 * training appropriate to the distance, so the marathon is flagged as
 * optimistic unless the plan has marathon-specific work.
 */
export function predictRaces(vdot: number, marathonFadeFactor = 1.03): RacePrediction[] {
  return DISTANCES.map((distanceKm) => {
    const raw = equivalentTimeS(vdot, distanceKm * 1000);
    const timeS = distanceKm === 42.195 ? raw * marathonFadeFactor : raw;
    return {
      distanceKm,
      label: RACE_DISTANCE_LABELS[distanceKm],
      timeS,
      paceSPerKm: timeS / distanceKm,
      optimistic: distanceKm === 42.195,
    };
  });
}

export function predictFromPerformance(
  distanceM: number,
  timeS: number,
  marathonFadeFactor = 1.03,
): RacePrediction[] {
  return predictRaces(vdotFromPerformance(distanceM, timeS), marathonFadeFactor);
}

/**
 * Is a goal time realistic? Compares the required VDOT to current fitness and
 * returns the gap in VDOT points. Roughly 1 VDOT point per 6-8 weeks of good
 * training for a developing runner.
 */
export function assessGoal(
  currentVdot: number,
  distanceKm: RaceDistance,
  targetTimeS: number,
): { requiredVdot: number; gap: number; verdict: 'realistic' | 'ambitious' | 'unrealistic' } {
  const requiredVdot = vdotFromPerformance(distanceKm * 1000, targetTimeS);
  const gap = requiredVdot - currentVdot;
  const verdict = gap <= 1 ? 'realistic' : gap <= 3 ? 'ambitious' : 'unrealistic';
  return { requiredVdot, gap, verdict };
}
