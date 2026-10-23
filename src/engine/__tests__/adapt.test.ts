import { acwrBand, acwrFromDailyKm, dailyLoads, ewma } from '../adapt/acwr';
import { computeReadiness } from '../adapt/readiness';
import { reviewWeek, shouldRecalibrate } from '../adapt/rules';
import type { WeekReview } from '../types';

const baseReview: WeekReview = {
  plannedKm: 40,
  completedKm: 38,
  plannedSessions: 3,
  completedSessions: 2,
  missedQuality: 0,
  easyRpeAvg: 6,
  easyRunsAboveHrZone: 0,
  acwr: 1.1,
  injuryFlag: false,
  isDownWeek: false,
};

describe('ACWR', () => {
  it('is 1.0 under constant load', () => {
    expect(acwrFromDailyKm(Array.from({ length: 28 }, () => 10))).toBeCloseTo(1, 5);
  });

  it('flags a spike', () => {
    const loads = [...Array.from({ length: 21 }, () => 8), ...Array.from({ length: 7 }, () => 25)];
    expect(acwrFromDailyKm(loads)).toBeGreaterThan(1.5);
  });

  it('smooths with EWMA', () => {
    expect(ewma([10, 10, 10], 7)).toBeCloseTo(10, 5);
    expect(ewma([], 7)).toBe(0);
  });

  it('builds a contiguous daily series', () => {
    const series = dailyLoads(
      [
        { date: '2026-01-11', km: 12 },
        { date: '2026-01-10', km: 8 },
      ],
      '2026-01-11',
      7,
    );
    expect(series).toHaveLength(7);
    expect(series[0]).toBe(0);
    expect(series[5]).toBe(8);
    expect(series[6]).toBe(12);
  });

  it('labels bands', () => {
    expect(acwrBand(0.5)).toBe('low');
    expect(acwrBand(1.1)).toBe('optimal');
    expect(acwrBand(1.4)).toBe('high');
    expect(acwrBand(1.7)).toBe('danger');
  });
});

describe('week review rules', () => {
  it('progresses normally when everything is fine', () => {
    const adjustment = reviewWeek(baseReview);
    expect(adjustment.action).toBe('proceed');
    expect(adjustment.volumeFactor).toBeGreaterThan(1);
  });

  it('never risks progression on a good week when load spiked', () => {
    const adjustment = reviewWeek({ ...baseReview, acwr: 1.6 });
    expect(adjustment.action).toBe('deload');
    expect(adjustment.volumeFactor).toBeLessThan(1);
    expect(adjustment.dropQualitySessions).toBe(1);
  });

  it('injury beats everything else, including perfect compliance', () => {
    const adjustment = reviewWeek({
      ...baseReview,
      injuryFlag: true,
      missedQuality: 0,
      acwr: 1,
    });
    expect(adjustment.action).toBe('medical');
    expect(adjustment.dropQualitySessions).toBe(99);
  });

  it('holds the week after missed sessions', () => {
    const adjustment = reviewWeek({
      ...baseReview,
      completedSessions: 1,
      missedQuality: 2,
    });
    expect(adjustment.action).toBe('hold');
    expect(adjustment.volumeFactor).toBe(1);
  });

  it('cuts volume when easy runs are too hard', () => {
    const adjustment = reviewWeek({
      ...baseReview,
      easyRpeAvg: 8.5,
      easyRunsAboveHrZone: 2,
    });
    expect(adjustment.action).toBe('reduce');
    expect(adjustment.volumeFactor).toBe(0.8);
  });

  it('rebuilds after a down week', () => {
    const adjustment = reviewWeek({ ...baseReview, isDownWeek: true, completedKm: 30 });
    expect(adjustment.action).toBe('proceed');
    expect(adjustment.volumeFactor).toBeGreaterThan(1.2);
  });

  it('rewards a strong, controlled week', () => {
    const adjustment = reviewWeek({
      ...baseReview,
      completedSessions: 4,
      plannedSessions: 4,
      easyRpeAvg: 5.5,
      acwr: 1.05,
    });
    expect(adjustment.action).toBe('increase');
    expect(adjustment.volumeFactor).toBe(1.1);
  });

  it('only recalibrates for a meaningful change outside race week', () => {
    expect(shouldRecalibrate(50, 49.5, 60)).toBe(false);
    expect(shouldRecalibrate(52, 49.8, 60)).toBe(true);
    expect(shouldRecalibrate(52, 49.8, 5)).toBe(false);
  });
});

describe('readiness', () => {
  it('is green after a good night', () => {
    const readiness = computeReadiness(
      { date: '2026-01-05', sleepHours: 8.5, soreness: 0, mood: 5 },
      { baselineRestingHr: 48, yesterdayHard: false },
    );
    expect(readiness.label).toBe('green');
    expect(readiness.score).toBeGreaterThanOrEqual(90);
  });

  it('goes red when everything stacks up', () => {
    const readiness = computeReadiness(
      { date: '2026-01-05', sleepHours: 4, soreness: 9, mood: 1, restingHr: 62 },
      { baselineRestingHr: 48, yesterdayHard: true },
    );
    expect(readiness.label).toBe('red');
    expect(readiness.score).toBeLessThan(50);
    expect(readiness.reasons.length).toBeGreaterThan(2);
  });

  it('never leaves the 5-100 range', () => {
    const worst = computeReadiness({
      date: '2026-01-05',
      sleepHours: 0,
      soreness: 10,
      mood: 1,
      restingHr: 200,
    });
    expect(worst.score).toBeGreaterThanOrEqual(5);
  });
});
