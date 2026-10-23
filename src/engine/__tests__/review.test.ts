import { buildWeekReview, weekForDate } from '../adapt/review';
import { addDays } from '../dates';
import { generateFitnessPlan } from '../plan/generator';
import type { AthleteProfile, LoggedRun } from '../types';
import { vdotFromPerformance } from '../vdot';

const START = '2026-01-05';
const VDOT = vdotFromPerformance(10000, 45 * 60);
const profile: AthleteProfile = { weeklyVolumeKm: 30, longestRecentKm: 10, daysPerWeek: 4 };

const plan = generateFitnessPlan(profile, { type: 'fitness' }, VDOT, START, 8);
const week = plan.weeks[0]!;

function runsFor(weekIndex: number, overrides: Partial<LoggedRun> = {}): LoggedRun[] {
  const target = plan.weeks[weekIndex]!;
  return target.workouts
    .filter((workout) => workout.type !== 'rest')
    .map((workout) => ({
      date: workout.date,
      distanceM: workout.targetDistanceM,
      durationS: workout.targetDurationS,
      rpe: workout.hard ? 8 : 4,
      ...overrides,
    }));
}

describe('week review builder', () => {
  it('counts every planned session as complete when the runs match', () => {
    const review = buildWeekReview(week, runsFor(0));
    expect(review.plannedSessions).toBeGreaterThan(0);
    expect(review.completedSessions).toBe(review.plannedSessions);
    expect(review.missedQuality).toBe(0);
    expect(review.completedKm).toBeCloseTo(week.targetVolumeKm, 1);
    expect(review.acwr).toBeGreaterThan(0);
  });

  it('detects missed quality sessions', () => {
    const runs = runsFor(0).filter((run) => {
      const workout = week.workouts.find((candidate) => candidate.date === run.date);
      return !workout?.hard;
    });
    const review = buildWeekReview(week, runs);
    const qualityCount = week.workouts.filter((workout) => workout.hard).length;
    expect(review.missedQuality).toBe(qualityCount);
    expect(review.completedSessions).toBeLessThan(review.plannedSessions);
  });

  it('averages RPE only over easy and long runs', () => {
    const review = buildWeekReview(
      week,
      runsFor(0).map((run) => {
        const workout = week.workouts.find((candidate) => candidate.date === run.date);
        return { ...run, rpe: workout?.hard ? 10 : 5 };
      }),
    );
    expect(review.easyRpeAvg).toBe(5);
  });

  it('flags easy runs above the HR ceiling', () => {
    const review = buildWeekReview(
      week,
      runsFor(0).map((run) => ({ ...run, avgHr: 168 })),
      { easyHrCeiling: 145 },
    );
    const easyCount = week.workouts.filter(
      (workout) => workout.type === 'easy' || workout.type === 'long',
    ).length;
    expect(review.easyRunsAboveHrZone).toBe(easyCount);
  });

  it('ignores runs outside the week for compliance but keeps them for load', () => {
    const runs = [
      ...runsFor(0),
      { date: addDays(week.startDate, -3), distanceM: 8000, rpe: 4 },
    ];
    const review = buildWeekReview(week, runs);
    expect(review.completedKm).toBeCloseTo(week.targetVolumeKm, 1);
    expect(review.acwr).toBeGreaterThan(0);
  });

  it('does not count cross-training as running volume or sessions', () => {
    const crossTraining = runsFor(0).map((run) => ({ ...run, type: 'cross' as const }));
    const review = buildWeekReview(week, crossTraining);
    expect(review.completedSessions).toBe(0);
    expect(review.completedKm).toBe(0);
    expect(review.easyRpeAvg).toBeUndefined();
  });

  it('passes injury context straight through', () => {
    const review = buildWeekReview(week, runsFor(0), {
      injuryFlag: true,
      painNote: 'left knee',
    });
    expect(review.injuryFlag).toBe(true);
    expect(review.painNote).toBe('left knee');
  });

  it('finds the week containing a date', () => {
    expect(weekForDate(plan.weeks, week.startDate)?.index).toBe(0);
    expect(weekForDate(plan.weeks, addDays(week.startDate, 6))?.index).toBe(0);
    expect(weekForDate(plan.weeks, addDays(week.startDate, 7))?.index).toBe(1);
    expect(weekForDate(plan.weeks, '2025-01-01')).toBeUndefined();
  });
});
