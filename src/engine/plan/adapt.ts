import type { Adjustment, AthleteProfile, Plan, PlanWeek, WeekReview } from '../types';
import { checkPlan } from './guards';
import {
  FITNESS_CONFIG,
  RACE_CONFIG,
  qualityCountFor,
  rebuildPlanWeek,
} from './generator';

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function isRaceWeek(week: PlanWeek): boolean {
  return week.workouts.some((workout) => workout.type === 'race');
}

/**
 * Applies a weekly-review adjustment to the future of a plan.
 *
 * The reviewed week's planned volume is the anchor: `volumeFactor` is applied
 * to it to get the new starting level. That level scales all remaining training
 * weeks proportionally, so down weeks and taper keep their shape. Weeks before
 * `fromWeekIndex` are returned untouched, and race day is never rewritten.
 *
 * The immediate week also drops the quality sessions demanded by the rule; the
 * following weeks keep their quality work at the adapted volume.
 */
export function applyWeekAdjustment(
  plan: Plan,
  profile: AthleteProfile,
  fromWeekIndex: number,
  adjustment: Adjustment,
  review: WeekReview,
): Plan {
  const firstWeek = plan.weeks[fromWeekIndex];
  if (firstWeek == null || isRaceWeek(firstWeek)) return plan;
  if (firstWeek.targetVolumeKm <= 0) return plan;
  // Applying the same review twice must not compound the scaling.
  const reviewKey = review.weekStart;
  if (reviewKey != null && (plan.notes ?? []).some((note) => note.startsWith(reviewKey))) {
    return plan;
  }

  const config =
    plan.mode === 'race' && plan.goal.distanceKm != null
      ? RACE_CONFIG[plan.goal.distanceKm]
      : FITNESS_CONFIG;
  const maxVolume = Math.min(config.peakVolumeCapKm, profile.daysPerWeek * 13);

  // Scale the rest of the block from the reviewed week's planned volume. The
  // clamp stops one rule from producing an extreme jump if the plan's next
  // week was already a down or taper week.
  const desiredFirst = Math.max(1, review.plannedKm) * adjustment.volumeFactor;
  const scale = clamp(desiredFirst / firstWeek.targetVolumeKm, 0.5, 1.15);

  const weeks = plan.weeks.map((week, index) => {
    if (index < fromWeekIndex) return week;
    if (isRaceWeek(week)) return week;

    const volumeKm = clamp(week.targetVolumeKm * scale, 5, maxVolume);
    const qualityCount =
      index === fromWeekIndex
        ? Math.max(0, qualityCountFor(profile.daysPerWeek) - adjustment.dropQualitySessions)
        : undefined;

    return (
      rebuildPlanWeek(plan, profile, index, volumeKm, { qualityCount }) ?? week
    );
  });

  const reviewedWeek = plan.weeks[fromWeekIndex - 1];
  const noteStart = reviewKey ?? reviewedWeek?.startDate ?? firstWeek.startDate;
  const note = `${noteStart}: ${adjustment.ruleId} — ${adjustment.reason}`;
  const next: Plan = {
    ...plan,
    weeks,
    notes: [...(plan.notes ?? []), note],
  };

  // Keep deterministic safety checks after the rewrite. Past weeks are
  // unchanged, so anything new here comes from the adjustment.
  const warnings = [...plan.warnings];
  for (const violation of checkPlan(next)) {
    const message = `After adjustment (${violation.rule}): ${violation.message}`;
    if (!warnings.includes(message)) warnings.push(message);
  }

  return { ...next, warnings };
}
