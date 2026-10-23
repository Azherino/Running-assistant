import { addDays } from '../dates';
import { generateRacePlan } from '../plan/generator';
import { recalibratePlan } from '../plan/recalibrate';
import type { AthleteProfile } from '../types';
import { vdotFromPerformance } from '../vdot';

const START = '2026-01-05';
const VDOT = vdotFromPerformance(10000, 45 * 60);

const profile: AthleteProfile = {
  weeklyVolumeKm: 30,
  longestRecentKm: 10,
  daysPerWeek: 4,
};

function buildPlan() {
  return generateRacePlan(
    profile,
    { type: 'race', distanceKm: 21.0975, date: '2026-05-03' },
    VDOT,
    START,
  );
}

describe('pace recalibration', () => {
  it('re-derives paces for future sessions only', () => {
    const plan = buildPlan();
    const fromDate = addDays(START, 7 * 9);

    const futureIndex = plan.weeks.findIndex((week) => week.startDate === fromDate);
    expect(futureIndex).toBeGreaterThan(0);

    const before = plan.weeks[futureIndex]?.workouts.find((workout) => workout.hard);
    expect(before).toBeDefined();

    const recalibrated = recalibratePlan(plan, VDOT + 2, fromDate);

    const after = recalibrated.weeks[futureIndex]?.workouts.find((workout) => workout.hard);
    expect(after).toBeDefined();
    expect(after?.steps.find((step) => step.zone)?.paceMinSPerKm).toBeLessThan(
      before?.steps.find((step) => step.zone)?.paceMinSPerKm as number,
    );

    // Completed weeks are untouched.
    expect(JSON.stringify(recalibrated.weeks[0])).toBe(JSON.stringify(plan.weeks[0]));
  });

  it('keeps the race goal time intact', () => {
    const plan = buildPlan();
    const raceBefore = plan.weeks[plan.weeks.length - 1]?.workouts.find(
      (workout) => workout.type === 'race',
    );
    const recalibrated = recalibratePlan(plan, VDOT + 3, plan.startDate);
    const raceAfter = recalibrated.weeks[recalibrated.weeks.length - 1]?.workouts.find(
      (workout) => workout.type === 'race',
    );
    expect(raceAfter?.steps).toEqual(raceBefore?.steps);
  });

  it('records what changed and why', () => {
    const plan = buildPlan();
    const recalibrated = recalibratePlan(plan, VDOT + 2, addDays(START, 14));
    expect(recalibrated.vdot).toBe(VDOT + 2);
    expect(recalibrated.notes?.[0]).toContain('recalibrated');
    expect(recalibrated.paces.threshold.minSPerKm).toBeLessThan(plan.paces.threshold.minSPerKm);
  });
});
