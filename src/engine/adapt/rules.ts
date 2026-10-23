import type { Adjustment, WeekReview } from '../types';

/**
 * Rules are ordered by risk. The first rule that fires wins, so an injury flag
 * always beats a good compliance streak.
 *
 * `volumeFactor` is a multiplier on the week that was just completed, not on
 * the plan's next week. 1.08 is a normal progression week.
 */
export function reviewWeek(review: WeekReview): Adjustment {
  const injury = review.injuryFlag || (review.painNote?.trim().length ?? 0) > 0;

  if (injury) {
    return {
      action: 'medical',
      volumeFactor: 0.6,
      dropQualitySessions: 99,
      ruleId: 'injury',
      reason:
        'Pain or injury reported. Next week drops all quality work and cuts volume by 40%. ' +
        'If pain changes how you run, see a physio before continuing.',
    };
  }

  if (review.acwr > 1.5) {
    return {
      action: 'deload',
      volumeFactor: 0.7,
      dropQualitySessions: 1,
      ruleId: 'acwr-spike',
      reason: `Load spike (ACWR ${review.acwr.toFixed(2)}). Next week is a deload and one quality session is removed.`,
    };
  }

  const planned = Math.max(1, review.plannedSessions);
  const compliance = review.completedSessions / planned;

  if (review.missedQuality >= 2 || compliance < 0.6) {
    return {
      action: 'hold',
      volumeFactor: 1,
      dropQualitySessions: 0,
      ruleId: 'missed-sessions',
      reason:
        `Only ${review.completedSessions} of ${review.plannedSessions} key sessions completed. ` +
        'Repeat the week at the same volume before progressing.',
    };
  }

  if ((review.easyRpeAvg ?? 0) >= 8 || review.easyRunsAboveHrZone >= 2) {
    return {
      action: 'reduce',
      volumeFactor: 0.8,
      dropQualitySessions: 1,
      ruleId: 'easy-too-hard',
      reason:
        'Easy runs are costing too much (high RPE or HR). Volume drops 20% and one quality ' +
        'session is removed so the easy days can be easy.',
    };
  }

  if (review.isDownWeek) {
    return {
      action: 'proceed',
      volumeFactor: 1.35,
      dropQualitySessions: 0,
      ruleId: 'down-week-done',
      reason: 'Down week completed. Volume returns to the previous build level.',
    };
  }

  if (compliance >= 0.9 && (review.easyRpeAvg == null || review.easyRpeAvg <= 6) && review.acwr < 1.3) {
    return {
      action: 'increase',
      volumeFactor: 1.1,
      dropQualitySessions: 0,
      ruleId: 'ready-to-progress',
      reason:
        'All key sessions completed, easy runs felt controlled and load is stable. ' +
        'Next week can take a full 10% progression.',
    };
  }

  return {
    action: 'proceed',
    volumeFactor: 1.08,
    dropQualitySessions: 0,
    ruleId: 'normal-progression',
    reason: 'Plan is on track. Next week progresses normally (about 8%).',
  };
}

/** Whether a new race/time-trial result should trigger a pace recalibration. */
export function shouldRecalibrate(
  newVdot: number,
  currentVdot: number,
  daysUntilRace: number,
): boolean {
  const change = newVdot - currentVdot;
  if (Math.abs(change) < 0.8) return false;
  // Avoid re-writing paces in the last 10 days before a race.
  if (daysUntilRace >= 0 && daysUntilRace < 10) return false;
  return true;
}
