import { diffDays } from '../dates';
import type { Plan, PlanWeek } from '../types';
import { hardWorkSeconds, marathonWorkKm } from './sessions';

export interface GuardViolation {
  rule: string;
  weekIndex?: number;
  message: string;
}

const MAX_WEEKLY_RAMP = 0.1;
const RAMP_EPSILON_KM = 0.6;
const MAX_LONG_SHARE = 0.42;
const MIN_LONG_SHARE = 0.15;
const MAX_HARD_TIME_SHARE = 0.25;
const MAX_MARATHON_SHARE = 0.32;

/** Hard safety limits. The generator must never produce a plan that fails these. */
export function checkPlan(plan: Plan): GuardViolation[] {
  const violations: GuardViolation[] = [];
  const paces = plan.paces;
  const weeks = plan.weeks;

  if (weeks.length === 0) {
    return [{ rule: 'empty-plan', message: 'Plan has no weeks' }];
  }

  const raceWeekIndex = plan.mode === 'race' ? weeks.length - 1 : -1;

  weeks.forEach((week, index) => {
    checkWeekShape(week, index, violations);

    const plannedKm = week.workouts.reduce((sum, w) => sum + w.targetDistanceM, 0) / 1000;
    if (Number.isNaN(plannedKm) || plannedKm < 0) {
      violations.push({
        rule: 'bad-distance',
        weekIndex: index,
        message: `Week ${index} has an invalid planned distance`,
      });
    }
    if (Math.abs(plannedKm - week.targetVolumeKm) > Math.max(1, week.targetVolumeKm * 0.08)) {
      violations.push({
        rule: 'volume-mismatch',
        weekIndex: index,
        message: `Week ${index} plans ${plannedKm.toFixed(1)} km but declares ${week.targetVolumeKm} km`,
      });
    }

    // Long-run share
    const long = week.workouts.find((workout) => workout.type === 'long');
    const isRaceWeek = index === raceWeekIndex;
    if (long && week.targetVolumeKm > 0 && !isRaceWeek) {
      const share = long.targetDistanceM / 1000 / week.targetVolumeKm;
      if (share < MIN_LONG_SHARE || share > MAX_LONG_SHARE) {
        violations.push({
          rule: 'long-run-share',
          weekIndex: index,
          message: `Week ${index} long run is ${(share * 100).toFixed(0)}% of volume`,
        });
      }
    }

    // 80/20 by time, not distance. Marathon-pace work is capped separately.
    if (!isRaceWeek) {
      const totalSeconds = week.workouts.reduce((sum, w) => sum + w.targetDurationS, 0);
      const hardSeconds = week.workouts
        .filter((workout) => workout.hard)
        .reduce((sum, workout) => sum + hardWorkSeconds(workout, paces), 0);
      if (totalSeconds > 0 && hardSeconds / totalSeconds > MAX_HARD_TIME_SHARE) {
        violations.push({
          rule: 'hard-time-share',
          weekIndex: index,
          message: `Week ${index} is ${((hardSeconds / totalSeconds) * 100).toFixed(0)}% hard by time`,
        });
      }

      const marathonKm = week.workouts.reduce(
        (sum, workout) => sum + marathonWorkKm(workout, paces),
        0,
      );
      if (week.targetVolumeKm > 0 && marathonKm / week.targetVolumeKm > MAX_MARATHON_SHARE) {
        violations.push({
          rule: 'marathon-pace-share',
          weekIndex: index,
          message: `Week ${index} has ${marathonKm.toFixed(1)} km at marathon pace ` +
            `(${((marathonKm / week.targetVolumeKm) * 100).toFixed(0)}% of volume)`,
        });
      }
    }

    // Weekly ramp vs the best of the previous three non-taper weeks.
    if (index > 0 && week.phase !== 'taper' && !week.isDownWeek) {
      const prior = weeks
        .slice(Math.max(0, index - 3), index)
        .filter((candidate) => candidate.phase !== 'taper');
      if (prior.length > 0) {
        const priorMax = Math.max(...prior.map((candidate) => candidate.targetVolumeKm));
        if (week.targetVolumeKm > priorMax * (1 + MAX_WEEKLY_RAMP) + RAMP_EPSILON_KM) {
          violations.push({
            rule: 'weekly-ramp',
            weekIndex: index,
            message: `Week ${index} jumps from ${priorMax} km to ${week.targetVolumeKm} km`,
          });
        }
      }
    }

    // Taper must not go back up (race week is allowed to sit above the last easy taper week).
    if (week.phase === 'taper' && index > 0 && index !== raceWeekIndex) {
      const previous = weeks[index - 1];
      if (previous && previous.phase === 'taper' && week.targetVolumeKm > previous.targetVolumeKm + 0.5) {
        violations.push({
          rule: 'taper-monotonic',
          weekIndex: index,
          message: `Week ${index} increases volume during the taper`,
        });
      }
    }
  });

  // No back-to-back hard days anywhere in the plan.
  const hardDays = weeks
    .flatMap((week) => week.workouts)
    .filter((workout) => workout.hard)
    .map((workout) => workout.date)
    .sort();

  for (let i = 1; i < hardDays.length; i += 1) {
    const previous = hardDays[i - 1] as string;
    const current = hardDays[i] as string;
    if (diffDays(previous, current) === 1) {
      violations.push({
        rule: 'consecutive-hard-days',
        message: `Hard sessions on ${previous} and ${current}`,
      });
    }
  }

  if (raceWeekIndex >= 0) {
    const hasRace = weeks[raceWeekIndex]?.workouts.some((workout) => workout.type === 'race');
    if (!hasRace) {
      violations.push({ rule: 'missing-race', message: 'Race week has no race workout' });
    }
  }

  return violations;
}

function checkWeekShape(week: PlanWeek, index: number, violations: GuardViolation[]): void {
  if (week.workouts.length !== 7) {
    violations.push({
      rule: 'week-length',
      weekIndex: index,
      message: `Week ${index} has ${week.workouts.length} days, expected 7`,
    });
    return;
  }

  const dates = new Set(week.workouts.map((workout) => workout.date));
  if (dates.size !== 7) {
    violations.push({
      rule: 'duplicate-dates',
      weekIndex: index,
      message: `Week ${index} has duplicate workout dates`,
    });
  }

  for (const workout of week.workouts) {
    if (!Number.isFinite(workout.targetDistanceM) || !Number.isFinite(workout.targetDurationS)) {
      violations.push({
        rule: 'non-finite',
        weekIndex: index,
        message: `Week ${index} has a non-finite target`,
      });
    }
    if (workout.type === 'rest' && workout.targetDistanceM !== 0) {
      violations.push({
        rule: 'rest-with-distance',
        weekIndex: index,
        message: `Week ${index} rest day has distance`,
      });
    }
  }
}
