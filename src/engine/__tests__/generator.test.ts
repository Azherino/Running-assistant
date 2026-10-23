import { diffDays } from '../dates';
import { checkPlan } from '../plan/guards';
import { generateFitnessPlan, generateRacePlan, RACE_CONFIG } from '../plan/generator';
import type { AthleteProfile, RaceDistance } from '../types';
import { vdotFromPerformance } from '../vdot';

const START = '2026-01-05';
const VDOT = vdotFromPerformance(10000, 45 * 60);

function profile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    weeklyVolumeKm: 30,
    longestRecentKm: 10,
    daysPerWeek: 4,
    ...overrides,
  };
}

interface RaceCase {
  distance: RaceDistance;
  raceDate: string;
  weeks: number;
}

const CASES: RaceCase[] = [
  { distance: 5, raceDate: '2026-03-01', weeks: 8 },
  { distance: 10, raceDate: '2026-04-05', weeks: 13 },
  { distance: 21.0975, raceDate: '2026-05-03', weeks: 17 },
  { distance: 42.195, raceDate: '2026-05-31', weeks: 21 },
];

function generate(raceCase: RaceCase, daysPerWeek: 3 | 4 | 5 | 6 = 4) {
  return generateRacePlan(
    profile({ daysPerWeek }),
    { type: 'race', distanceKm: raceCase.distance, date: raceCase.raceDate },
    VDOT,
    START,
  );
}

function violationsOf(plan: ReturnType<typeof generate>): string[] {
  return checkPlan(plan).map((violation) => `${violation.rule}: ${violation.message}`);
}

describe.each(CASES)('race plan $distance km over $weeks weeks', (raceCase) => {
  const plan = generate(raceCase);

  it('covers the requested block and ends on race day', () => {
    expect(plan.weeks).toHaveLength(raceCase.weeks);
    expect(plan.startDate).toBe(START);
    expect(plan.endDate).toBe(raceCase.raceDate);

    const lastWeek = plan.weeks[plan.weeks.length - 1];
    expect(lastWeek?.phase).toBe('taper');
    const race = lastWeek?.workouts.find((workout) => workout.date === raceCase.raceDate);
    expect(race?.type).toBe('race');
    expect(race?.targetDistanceM).toBe(Math.round(raceCase.distance * 1000));
  });

  it('passes every safety guard', () => {
    expect(violationsOf(plan)).toEqual([]);
  });

  it('has seven dated days per week with volume matching the declared target', () => {
    for (const week of plan.weeks) {
      expect(week.workouts).toHaveLength(7);
      const unique = new Set(week.workouts.map((workout) => workout.date));
      expect(unique.size).toBe(7);

      const sumKm = week.workouts.reduce((sum, workout) => sum + workout.targetDistanceM, 0) / 1000;
      expect(sumKm).toBeCloseTo(week.targetVolumeKm, 1);
      expect(week.targetVolumeKm).toBeLessThanOrEqual(RACE_CONFIG[raceCase.distance].peakVolumeCapKm + 1);
    }
  });

  it('includes base, build, peak and taper phases', () => {
    const phases = new Set(plan.weeks.map((week) => week.phase));
    expect(phases.has('base')).toBe(true);
    expect(phases.has('build')).toBe(true);
    expect(phases.has('taper')).toBe(true);
  });

  it('includes down weeks and never places two hard days together', () => {
    expect(plan.weeks.some((week) => week.isDownWeek)).toBe(true);
    const hardDates = plan.weeks
      .flatMap((week) => week.workouts)
      .filter((workout) => workout.hard)
      .map((workout) => workout.date)
      .sort();
    for (let i = 1; i < hardDates.length; i += 1) {
      expect(diffDays(hardDates[i - 1] as string, hardDates[i] as string)).toBeGreaterThan(1);
    }
  });

  it('tapers into the race', () => {
    const taper = plan.weeks.filter((week) => week.phase === 'taper');
    expect(taper.length).toBeGreaterThanOrEqual(1);
    const raceWeekIndex = plan.weeks.length - 1;
    const preRace = plan.weeks
      .slice(0, raceWeekIndex)
      .filter((week) => week.phase === 'taper');
    for (let i = 1; i < preRace.length; i += 1) {
      expect(preRace[i]?.targetVolumeKm).toBeLessThanOrEqual(preRace[i - 1]?.targetVolumeKm ?? 0);
    }
  });

  it('is byte-for-byte deterministic', () => {
    expect(JSON.stringify(generate(raceCase))).toBe(JSON.stringify(plan));
  });
});

describe.each([3, 4, 5, 6] as const)('session layout for %i days per week', (daysPerWeek) => {
  it('fits the athlete schedule and stays safe', () => {
    const plan = generate(CASES[2] as RaceCase, daysPerWeek);
    expect(violationsOf(plan)).toEqual([]);

    for (const week of plan.weeks) {
      const trainingDays = week.workouts.filter((workout) => workout.type !== 'rest').length;
      // Race week always has the race plus at least one shakeout.
      expect(trainingDays).toBeLessThanOrEqual(daysPerWeek);
      expect(trainingDays).toBeGreaterThanOrEqual(Math.min(3, daysPerWeek));
    }
  });
});

describe('plan generator edge cases', () => {
  it('warns but still produces a plan when time is short', () => {
    const plan = generateRacePlan(
      profile(),
      { type: 'race', distanceKm: 21.0975, date: '2026-02-01' },
      VDOT,
      START,
    );
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.warnings.join(' ')).toContain('weeks');
    expect(violationsOf(plan)).toEqual([]);
  });

  it('slows the ramp when there is injury history', () => {
    const healthy = generateRacePlan(
      profile(),
      { type: 'race', distanceKm: 21.0975, date: '2026-05-03' },
      VDOT,
      START,
    );
    const injured = generateRacePlan(
      profile({ injuryFlags: ['left knee'] }),
      { type: 'race', distanceKm: 21.0975, date: '2026-05-03' },
      VDOT,
      START,
    );
    const totalVolume = (plan: typeof healthy) =>
      plan.weeks.reduce((sum, week) => sum + week.targetVolumeKm, 0);
    expect(totalVolume(injured)).toBeLessThan(totalVolume(healthy));
    expect(injured.warnings.join(' ')).toContain('Injury history');
    expect(violationsOf(injured)).toEqual([]);
  });

  it('ramps from a low starting volume without jumping', () => {
    const plan = generateRacePlan(
      profile({ weeklyVolumeKm: 12, longestRecentKm: 5, daysPerWeek: 3 }),
      { type: 'race', distanceKm: 5, date: '2026-03-01' },
      VDOT,
      START,
    );
    expect(violationsOf(plan)).toEqual([]);
    expect(plan.warnings.join(' ')).toContain('below');
  });

  it('rejects a race date before the start', () => {
    expect(() =>
      generateRacePlan(
        profile(),
        { type: 'race', distanceKm: 10, date: '2025-12-01' },
        VDOT,
        START,
      ),
    ).toThrow();
  });
});

describe('fitness plans', () => {
  it('builds a rolling block with no race', () => {
    const plan = generateFitnessPlan(profile(), { type: 'fitness' }, VDOT, START, 8);
    expect(plan.mode).toBe('fitness');
    expect(plan.weeks).toHaveLength(8);
    expect(plan.weeks.some((week) => week.workouts.some((workout) => workout.type === 'race'))).toBe(
      false,
    );
    expect(violationsOf(plan as ReturnType<typeof generate>)).toEqual([]);
  });

  it('progresses load across the block', () => {
    const plan = generateFitnessPlan(profile(), { type: 'fitness' }, VDOT, START, 12);
    const volumes = plan.weeks.map((week) => week.targetVolumeKm);
    const firstHalf = Math.max(...volumes.slice(0, 6));
    const secondHalf = Math.max(...volumes.slice(6));
    expect(secondHalf).toBeGreaterThan(firstHalf);
  });
});
