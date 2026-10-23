import { buildWeekReview } from '../adapt/review';
import { reviewWeek } from '../adapt/rules';
import { applyWeekAdjustment } from '../plan/adapt';
import { generateFitnessPlan, generateRacePlan, qualityCountFor } from '../plan/generator';
import { checkPlan } from '../plan/guards';
import type { Adjustment, AthleteProfile, Plan, PlanGoal, WeekReview } from '../types';

const PROFILE: AthleteProfile = {
  weeklyVolumeKm: 30,
  longestRecentKm: 12,
  daysPerWeek: 4,
  preferredLongDay: 7,
  experienced: true,
};

const HALF_GOAL: PlanGoal = {
  type: 'race',
  distanceKm: 21.0975,
  date: '2026-05-03',
};

function reviewFor(plan: Plan, weekIndex: number): WeekReview {
  const week = plan.weeks[weekIndex];
  return buildWeekReview(week, [], { injuryFlag: false });
}

describe('weekly adaptation', () => {
  it('leaves past weeks and race day untouched', () => {
    const plan = generateRacePlan(PROFILE, HALF_GOAL, 48, '2026-01-05');
    const from = 6;
    const review = reviewFor(plan, from - 1);
    const adjustment: Adjustment = {
      action: 'medical',
      volumeFactor: 0.6,
      dropQualitySessions: 99,
      ruleId: 'injury',
      reason: 'Pain reported.',
    };

    const adapted = applyWeekAdjustment(plan, PROFILE, from, adjustment, review);

    for (let i = 0; i < from; i += 1) {
      expect(adapted.weeks[i]).toEqual(plan.weeks[i]);
    }

    const raceIndex = plan.weeks.length - 1;
    expect(adapted.weeks[raceIndex]).toEqual(plan.weeks[raceIndex]);

    expect(adapted.weeks[from].targetVolumeKm).toBeLessThan(plan.weeks[from].targetVolumeKm);
    expect(adapted.weeks[from].workouts.some((workout) => workout.hard)).toBe(false);

    for (let i = from; i < raceIndex; i += 1) {
      expect(adapted.weeks[i].targetVolumeKm).toBeLessThanOrEqual(
        plan.weeks[i].targetVolumeKm,
      );
    }

    expect(adapted.notes?.some((note) => note.includes('injury'))).toBe(true);
    expect(checkPlan(adapted)).toEqual([]);
  });

  it('drops only the requested quality sessions in the first adapted week', () => {
    const plan = generateRacePlan(PROFILE, HALF_GOAL, 48, '2026-01-05');
    const from = 6;
    const review = reviewFor(plan, from - 1);
    const adjustment: Adjustment = {
      action: 'reduce',
      volumeFactor: 0.8,
      dropQualitySessions: 1,
      ruleId: 'easy-too-hard',
      reason: 'Easy days were too hard.',
    };

    const adapted = applyWeekAdjustment(plan, PROFILE, from, adjustment, review);
    const hardSessions = adapted.weeks[from].workouts.filter((workout) => workout.hard).length;
    expect(hardSessions).toBe(qualityCountFor(PROFILE.daysPerWeek) - 1);

    // Later weeks keep their quality work; only the volume is scaled.
    const nextHard = adapted.weeks[from + 1].workouts.filter((workout) => workout.hard).length;
    expect(nextHard).toBe(qualityCountFor(PROFILE.daysPerWeek));
  });

  it('does not rewrite a race week', () => {
    const plan = generateRacePlan(PROFILE, HALF_GOAL, 48, '2026-01-05');
    const raceIndex = plan.weeks.length - 1;
    const review = reviewFor(plan, raceIndex - 1);
    const adjustment = reviewWeek({ ...review, injuryFlag: true });

    const adapted = applyWeekAdjustment(plan, PROFILE, raceIndex, adjustment, review);
    expect(adapted.weeks[raceIndex]).toEqual(plan.weeks[raceIndex]);
    expect(adapted.notes).toBeUndefined();
  });

  it('adapts a fitness block from the review', () => {
    const plan = generateFitnessPlan(PROFILE, { type: 'fitness' }, 45, '2026-01-05', 12);
    const from = 4;
    const review = reviewFor(plan, from - 1);
    const adjustment: Adjustment = {
      action: 'increase',
      volumeFactor: 1.1,
      dropQualitySessions: 0,
      ruleId: 'ready-to-progress',
      reason: 'Ready.',
    };

    const adapted = applyWeekAdjustment(plan, PROFILE, from, adjustment, review);
    expect(adapted.weeks[0]).toEqual(plan.weeks[0]);
    expect(adapted.weeks[from].targetVolumeKm).toBeGreaterThan(0);
    expect(adapted.endDate).toBe(plan.endDate);
    expect(checkPlan(adapted).filter((violation) => violation.rule === 'volume-mismatch')).toEqual(
      [],
    );
  });

  it('uses the completed week plan as the anchor, not the actual distance run', () => {
    const plan = generateRacePlan(PROFILE, HALF_GOAL, 48, '2026-01-05');
    const from = 6;
    const planned = plan.weeks[from - 1].targetVolumeKm;
    const base = reviewFor(plan, from - 1);
    const review: WeekReview = { ...base, completedKm: planned * 0.3 };
    const adjustment: Adjustment = {
      action: 'hold',
      volumeFactor: 1,
      dropQualitySessions: 0,
      ruleId: 'missed-sessions',
      reason: 'Repeat the week.',
    };

    const adapted = applyWeekAdjustment(plan, PROFILE, from, adjustment, review);
    expect(adapted.weeks[from].targetVolumeKm).toBeGreaterThan(plan.weeks[from].targetVolumeKm * 0.8);
  });

  it('rebuilds safely after a down week without a ramp violation', () => {
    const plan = generateRacePlan(PROFILE, HALF_GOAL, 48, '2026-01-05');
    const downIndex = plan.weeks.findIndex(
      (week, index) => week.isDownWeek && index > 2 && index < plan.weeks.length - 2,
    );
    expect(downIndex).toBeGreaterThan(0);

    const from = downIndex + 1;
    const review = reviewFor(plan, downIndex);
    const adjustment: Adjustment = {
      action: 'proceed',
      volumeFactor: 1.35,
      dropQualitySessions: 0,
      ruleId: 'down-week-done',
      reason: 'Down week completed.',
    };

    const adapted = applyWeekAdjustment(plan, PROFILE, from, adjustment, review);
    expect(adapted.weeks[from - 1]).toEqual(plan.weeks[from - 1]);
    expect(adapted.weeks[from].targetVolumeKm).toBeGreaterThan(plan.weeks[downIndex].targetVolumeKm);
    expect(checkPlan(adapted)).toEqual([]);
  });

  it('keeps a low-volume fitness block valid when injury cuts the remainder', () => {
    const profile: AthleteProfile = {
      weeklyVolumeKm: 16,
      longestRecentKm: 6,
      daysPerWeek: 3,
      preferredLongDay: 6,
    };
    const plan = generateFitnessPlan(profile, { type: 'fitness' }, 38, '2026-01-05', 12);
    const from = 4;
    const review = reviewFor(plan, from - 1);
    const adjustment = reviewWeek({ ...review, injuryFlag: true, painNote: 'Sore knee' });

    const adapted = applyWeekAdjustment(plan, profile, from, adjustment, review);
    expect(adapted.weeks[from].targetVolumeKm).toBeGreaterThanOrEqual(5);
    expect(adapted.weeks[from].workouts.some((workout) => workout.hard)).toBe(false);
    expect(checkPlan(adapted)).toEqual([]);
  });

  it('is idempotent for the same reviewed week', () => {
    const plan = generateRacePlan(PROFILE, HALF_GOAL, 48, '2026-01-05');
    const from = 6;
    const review = reviewFor(plan, from - 1);
    const adjustment = reviewWeek({ ...review, injuryFlag: true });
    const once = applyWeekAdjustment(plan, PROFILE, from, adjustment, review);
    const twice = applyWeekAdjustment(once, PROFILE, from, adjustment, review);

    expect(twice).toBe(once);
    expect(twice.notes).toHaveLength(1);
  });

  it('records the reviewed week even when the rewrite starts later', () => {
    const plan = generateRacePlan(PROFILE, HALF_GOAL, 48, '2026-01-05');
    const reviewed = 5;
    const from = 7; // e.g. applied mid-week, so the next week is the target
    const review = reviewFor(plan, reviewed);
    const adjustment: Adjustment = {
      action: 'hold',
      volumeFactor: 1,
      dropQualitySessions: 0,
      ruleId: 'missed-sessions',
      reason: 'Repeat the week.',
    };

    const adapted = applyWeekAdjustment(plan, PROFILE, from, adjustment, review);
    expect(adapted.notes?.[0].startsWith(plan.weeks[reviewed].startDate)).toBe(true);
    expect(adapted.weeks[from - 1]).toEqual(plan.weeks[from - 1]);
  });
});
