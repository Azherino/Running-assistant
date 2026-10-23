import { addDays, diffDays, startOfWeek, type ISODate } from '../dates';
import { buildPaceZones } from '../paces';
import type {
  AthleteProfile,
  PaceZones,
  Phase,
  Plan,
  PlanGoal,
  PlanWeek,
  RaceDistance,
  Workout,
} from '../types';
import { parseAthleteProfile, parsePlanGoal } from '../validation';
import { checkPlan } from './guards';
import {
  buildQualitySession,
  easyRun,
  longRun,
  pickQualityTemplate,
  raceDay,
  restDay,
  shakeout,
  workDistanceKm,
  type QualitySession,
} from './sessions';

export interface RaceConfig {
  label: string;
  minWeeks: number;
  minVolumeKm: number;
  maxLongKm: number;
  peakVolumeCapKm: number;
  maxWorkKm: number;
  taperWeeks: number;
}

export const RACE_CONFIG: Record<RaceDistance, RaceConfig> = {
  5: {
    label: '5K',
    minWeeks: 4,
    minVolumeKm: 15,
    maxLongKm: 8,
    peakVolumeCapKm: 60,
    maxWorkKm: 8,
    taperWeeks: 1,
  },
  10: {
    label: '10K',
    minWeeks: 6,
    minVolumeKm: 20,
    maxLongKm: 12,
    peakVolumeCapKm: 75,
    maxWorkKm: 10,
    taperWeeks: 1,
  },
  21.0975: {
    label: 'Half marathon',
    minWeeks: 8,
    minVolumeKm: 28,
    maxLongKm: 18,
    peakVolumeCapKm: 90,
    maxWorkKm: 14,
    taperWeeks: 2,
  },
  42.195: {
    label: 'Marathon',
    minWeeks: 10,
    minVolumeKm: 35,
    maxLongKm: 32,
    peakVolumeCapKm: 110,
    maxWorkKm: 16,
    taperWeeks: 3,
  },
};

export const FITNESS_CONFIG: RaceConfig = {
  label: 'General fitness',
  minWeeks: 4,
  minVolumeKm: 20,
  maxLongKm: 22,
  peakVolumeCapKm: 80,
  maxWorkKm: 12,
  taperWeeks: 0,
};

const MIN_EASY_KM = 3;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function buildPhases(weeksTotal: number, taperWeeks: number): Phase[] {
  const nonTaper = Math.max(1, weeksTotal - taperWeeks);
  let peak = Math.max(0, Math.round(nonTaper * 0.25));
  let build = Math.max(1, Math.round(nonTaper * 0.35));
  let base = Math.max(0, nonTaper - peak - build);

  while (base + build + peak < nonTaper) build += 1;
  while (base + build + peak > nonTaper) {
    if (peak > 0) peak -= 1;
    else if (build > 1) build -= 1;
    else base -= 1;
  }
  if (base === 0 && build > 1) {
    base = 1;
    build -= 1;
  }

  const phases: Phase[] = [];
  for (let i = 0; i < base; i += 1) phases.push('base');
  for (let i = 0; i < build; i += 1) phases.push('build');
  for (let i = 0; i < peak; i += 1) phases.push('peak');
  for (let i = 0; i < taperWeeks; i += 1) phases.push('taper');
  return phases;
}

export function taperFactors(weeks: number): number[] {
  if (weeks >= 3) return [0.8, 0.6, 0.45];
  if (weeks === 2) return [0.75, 0.55];
  return [0.65];
}

export function qualityCountFor(daysPerWeek: number): 1 | 2 {
  return daysPerWeek >= 4 ? 2 : 1;
}

export function isDownWeekFor(phase: Phase, weekIndex: number): boolean {
  return (phase === 'base' || phase === 'build') && weekIndex > 0 && weekIndex % 4 === 3;
}

function rampFor(
  phase: Phase,
  profile: AthleteProfile,
): number {
  if (phase === 'peak') return 1.04;
  const base = profile.experienced ? 1.1 : 1.08;
  // Injury history buys a slower ramp.
  return (profile.injuryFlags?.length ?? 0) > 0 ? Math.min(base, 1.05) : base;
}

interface VolumePlan {
  volumes: number[];
  longs: number[];
  peakVolume: number;
}

function buildVolumes(
  profile: AthleteProfile,
  weeksTotal: number,
  phases: Phase[],
  config: RaceConfig,
  raceKm?: number,
): VolumePlan {
  const startVolume = Math.max(8, profile.weeklyVolumeKm, config.minVolumeKm * 0.7);
  // More running days support more volume; this is the real ceiling for most athletes.
  const cap = Math.min(config.peakVolumeCapKm, profile.daysPerWeek * 13);
  let level = Math.min(startVolume, cap);
  let peakVolume = level;
  let prevLong = clamp(profile.longestRecentKm, 4, config.maxLongKm);

  const volumes: number[] = [];
  const longs: number[] = [];
  const taperStart = weeksTotal - config.taperWeeks;

  for (let i = 0; i < weeksTotal; i += 1) {
    const phase = phases[i] as Phase;
    let volume: number;

    if (phase === 'taper') {
      const taperIndex = i - taperStart;
      if (taperIndex === config.taperWeeks - 1 && raceKm != null) {
        volume = round1(raceKm + 10);
      } else {
        const factors = taperFactors(config.taperWeeks);
        volume = round1(peakVolume * (factors[taperIndex] ?? 0.5));
      }
    } else if (isDownWeekFor(phase, i)) {
      volume = round1(level * 0.75);
    } else {
      if (i > 0) level = round1(Math.min(level * rampFor(phase, profile), cap));
      peakVolume = Math.max(peakVolume, level);
      volume = level;
    }

    let long: number;
    if (phase === 'taper' && i === weeksTotal - 1 && raceKm != null) {
      long = raceKm;
    } else {
      long = clamp(volume * (profile.daysPerWeek <= 3 ? 0.4 : 0.3), 3, config.maxLongKm);
      if (i > 0) long = Math.min(long, prevLong + 2.5);
      if (i === 0) long = Math.min(long, Math.max(prevLong + 2, 5), config.maxLongKm);
      long = Math.max(long, Math.min(volume * 0.2, config.maxLongKm));
      long = round1(long);
    }

    volumes.push(volume);
    longs.push(long);
    prevLong = long;
  }

  return { volumes, longs, peakVolume };
}

type SlotKind = 'quality' | 'easy' | 'long';

const DAY_PATTERNS: Record<number, Array<{ day: number; slot: SlotKind }>> = {
  3: [
    { day: 2, slot: 'quality' },
    { day: 4, slot: 'easy' },
    { day: 7, slot: 'long' },
  ],
  4: [
    { day: 2, slot: 'quality' },
    { day: 3, slot: 'easy' },
    { day: 4, slot: 'quality' },
    { day: 7, slot: 'long' },
  ],
  5: [
    { day: 1, slot: 'easy' },
    { day: 2, slot: 'quality' },
    { day: 3, slot: 'easy' },
    { day: 4, slot: 'quality' },
    { day: 7, slot: 'long' },
  ],
  6: [
    { day: 1, slot: 'easy' },
    { day: 2, slot: 'quality' },
    { day: 3, slot: 'easy' },
    { day: 4, slot: 'quality' },
    { day: 6, slot: 'easy' },
    { day: 7, slot: 'long' },
  ],
};

export function dayPatternFor(
  daysPerWeek: number,
  longDay: 6 | 7,
): Array<{ day: number; slot: SlotKind }> {
  const pattern = DAY_PATTERNS[daysPerWeek];
  if (!pattern) throw new Error(`Unsupported daysPerWeek: ${daysPerWeek}`);
  if (longDay === 7) return pattern;
  return pattern.map((entry) => {
    if (entry.slot === 'long') return { day: 6, slot: 'long' as SlotKind };
    if (entry.day === 6 && entry.slot === 'easy') return { day: 7, slot: 'easy' as SlotKind };
    return entry;
  });
}

interface WeekContext {
  weekStart: ISODate;
  weekIndex: number;
  phase: Phase;
  volumeKm: number;
  longKm: number;
  qualityCount: number;
  profile: AthleteProfile;
  distance: RaceDistance;
  paces: PaceZones;
  isDownWeek: boolean;
  maxWorkKm: number;
  maxLongKm: number;
}

function buildTrainingWeek(ctx: WeekContext): PlanWeek {
  const { profile, paces, distance, phase, weekIndex } = ctx;
  const days = profile.daysPerWeek;

  let qualityCount = ctx.qualityCount;
  let sessions: QualitySession[] = [];
  let longKm = ctx.longKm;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const easyDays = Math.max(1, days - 1 - qualityCount);
    const qualityBudget = Math.max(
      0,
      ctx.volumeKm - longKm - MIN_EASY_KM * easyDays,
    );
    const perSession = qualityCount > 0 ? qualityBudget / qualityCount : 0;

    sessions = [];
    let remainingWorkKm = ctx.volumeKm * 0.22;
    for (let q = 0; q < qualityCount; q += 1) {
      const template = pickQualityTemplate(phase, distance, weekIndex + q);
      const workCap = Math.min(
        ctx.maxWorkKm,
        ctx.volumeKm * 0.15,
        Math.max(0, remainingWorkKm),
      );
      const session = buildQualitySession(template, perSession, paces, workCap);
      if (session) {
        sessions.push(session);
        remainingWorkKm -= workDistanceKm(session.workout, paces);
      }
    }

    if (sessions.length === qualityCount) break;

    // Not enough room: first shrink the long run, then drop a quality session.
    if (longKm > ctx.volumeKm * 0.22) {
      longKm = round1(Math.max(ctx.volumeKm * 0.2, longKm - 2));
      continue;
    }
    qualityCount = Math.max(0, sessions.length);
    if (qualityCount === 0) break;
  }

  const qualityTotalKm = sessions.reduce((sum, session) => sum + session.totalKm, 0);
  const easyDays = Math.max(1, days - 1 - sessions.length);

  let easyKm =
    easyDays > 0
      ? Math.max(
          1.5,
          Math.round(((ctx.volumeKm - longKm - qualityTotalKm) / easyDays) * 10) / 10,
        )
      : 0;

  // Absorb rounding error in the long run so the week hits its target exactly.
  let longFinal = round1(ctx.volumeKm - qualityTotalKm - easyKm * easyDays);

  // A single easy day should never turn into a second long run. Any distance
  // that no longer fits is dropped from the week rather than pushed into the
  // long run, which would break the long-run share limit.
  const easyCap = 15;
  const longCeiling = Math.min(ctx.maxLongKm, ctx.volumeKm * 0.42);

  if (easyDays > 0 && easyKm > easyCap) {
    easyKm = easyCap;
    longFinal = round1(
      Math.min(ctx.volumeKm - qualityTotalKm - easyKm * easyDays, longKm),
    );
  }

  // If the long run is over its ceiling, move the surplus to the easy days,
  // but never past the easy-day cap.
  if (easyDays > 0 && longFinal > longCeiling) {
    const surplus = longFinal - longCeiling;
    const room = Math.max(0, easyCap - easyKm);
    const moved = Math.min(surplus, room);
    easyKm = round1(easyKm + moved);
    longFinal = round1(longFinal - moved);
  }
  if (longFinal > longCeiling) longFinal = round1(longCeiling);

  if (longFinal < 2) {
    const deficit = 2 - longFinal;
    easyKm = Math.max(1.5, round1(easyKm - deficit / easyDays));
    longFinal = round1(ctx.volumeKm - qualityTotalKm - easyKm * easyDays);
  }
  longFinal = Math.max(0, longFinal);

  const marathonFinishKm =
    phase === 'peak' && distance >= 21.0975 && longFinal >= 14
      ? Math.min(8, round1(longFinal * 0.2))
      : 0;

  const longWorkout = longRun(longFinal, paces, {
    marathonFinishKm: marathonFinishKm >= 1 ? marathonFinishKm : undefined,
  });

  const easyWorkouts: Workout[] = [];
  for (let i = 0; i < easyDays; i += 1) {
    const withStrides =
      (phase === 'base' || phase === 'build') && !ctx.isDownWeek && weekIndex % 2 === 0 && i === 0;
    easyWorkouts.push(easyRun(easyKm, paces, withStrides));
  }

  const pattern = dayPatternFor(days, profile.preferredLongDay ?? 7).slice().sort((a, b) => a.day - b.day);
  const qualityQueue = sessions.map((session) => session.workout);
  const easyQueue = easyWorkouts.slice();

  const byDay = new Map<number, Workout>();
  for (const entry of pattern) {
    if (entry.slot === 'quality') {
      // If a quality session did not fit the budget, that slot becomes easy.
      const workout = qualityQueue.shift() ?? easyQueue.shift();
      if (workout) byDay.set(entry.day, workout);
    } else if (entry.slot === 'easy') {
      const workout = easyQueue.shift();
      if (workout) byDay.set(entry.day, workout);
    } else {
      byDay.set(entry.day, longWorkout);
    }
  }

  const workouts: Workout[] = [];
  for (let day = 1; day <= 7; day += 1) {
    const date = addDays(ctx.weekStart, day - 1);
    const workout = byDay.get(day);
    workouts.push(workout ? { ...workout, date } : { ...restDay(), date });
  }

  const plannedKm = workouts.reduce((sum, workout) => sum + workout.targetDistanceM, 0) / 1000;

  return {
    index: ctx.weekIndex,
    startDate: ctx.weekStart,
    phase,
    targetVolumeKm: round1(plannedKm),
    isDownWeek: ctx.isDownWeek,
    workouts,
  };
}

function buildRaceWeek(
  weekStart: ISODate,
  raceDate: ISODate,
  distance: RaceDistance,
  paces: PaceZones,
  targetTimeS: number | undefined,
  maxRuns: number,
): PlanWeek {
  const raceOffset = diffDays(weekStart, raceDate);
  const byDay = new Map<number, Workout>();

  byDay.set(raceOffset, raceDay(distance, paces, targetTimeS));
  let runs = 1;
  if (runs < maxRuns && raceOffset >= 1) {
    byDay.set(raceOffset - 1, shakeout(paces));
    runs += 1;
  }
  if (runs < maxRuns && raceOffset >= 2) {
    byDay.set(raceOffset - 2, easyRun(4, paces));
    runs += 1;
  }
  if (runs < maxRuns && raceOffset >= 4) {
    byDay.set(raceOffset - 4, easyRun(6, paces, true));
    runs += 1;
  }

  const workouts: Workout[] = [];
  for (let day = 1; day <= 7; day += 1) {
    const date = addDays(weekStart, day - 1);
    const workout = byDay.get(day - 1);
    workouts.push(workout ? { ...workout, date } : { ...restDay(), date });
  }

  return {
    index: 0,
    startDate: weekStart,
    phase: 'taper',
    targetVolumeKm: round1(
      workouts.reduce((sum, workout) => sum + workout.targetDistanceM, 0) / 1000,
    ),
    isDownWeek: false,
    workouts,
  };
}

/**
 * Rebuilds one week of an existing plan with a new volume. Used by adaptation:
 * the week keeps its phase, down-week flag, dates and race day, but sessions
 * are regenerated so long-run share and hard-work limits stay valid.
 */
export function rebuildPlanWeek(
  plan: Plan,
  profile: AthleteProfile,
  weekIndex: number,
  volumeKm: number,
  options: { qualityCount?: number; longKm?: number } = {},
): PlanWeek | null {
  const existing = plan.weeks[weekIndex];
  if (existing == null) return null;

  const config =
    plan.mode === 'race' && plan.goal.distanceKm != null
      ? RACE_CONFIG[plan.goal.distanceKm]
      : FITNESS_CONFIG;
  const distance: RaceDistance = plan.goal.distanceKm ?? 10;
  const share = profile.daysPerWeek <= 3 ? 0.4 : 0.3;
  const longKm =
    options.longKm ?? Math.min(config.maxLongKm, Math.max(3, volumeKm * share));

  const week = buildTrainingWeek({
    weekStart: existing.startDate,
    weekIndex,
    phase: existing.phase,
    volumeKm,
    longKm,
    qualityCount: options.qualityCount ?? qualityCountFor(profile.daysPerWeek),
    profile,
    distance,
    paces: plan.paces,
    isDownWeek: existing.isDownWeek,
    maxWorkKm: config.maxWorkKm,
    maxLongKm: config.maxLongKm,
  });

  return { ...week, index: weekIndex };
}

function buildWarnings(
  profile: AthleteProfile,
  config: RaceConfig,
  weeksTotal: number,
  peakVolume: number,
): string[] {
  const warnings: string[] = [];

  if (weeksTotal < config.minWeeks) {
    warnings.push(
      `Only ${weeksTotal} weeks until the ${config.label}. The block is compressed: ` +
        'expect a smaller peak and treat the race as a fitness check.',
    );
  }
  if (weeksTotal > 24) {
    warnings.push(
      `${weeksTotal} weeks is a long block. Consider splitting it with an intermediate race ` +
        'so the plan does not drift.',
    );
  }
  if (profile.weeklyVolumeKm < config.minVolumeKm) {
    warnings.push(
      `Current volume (${profile.weeklyVolumeKm} km/week) is below the ` +
        `${config.minVolumeKm} km/week baseline for a ${config.label}. ` +
        'Volume ramps from where you are, and the plan adds walking breaks if needed.',
    );
  }
  if (peakVolume < config.minVolumeKm) {
    warnings.push(
      `Peak volume in this plan is only ${Math.round(peakVolume)} km/week. ` +
        `For a ${config.label}, ${config.minVolumeKm}+ km/week is a safer base.`,
    );
  }
  if (profile.longestRecentKm < config.maxLongKm * 0.35) {
    warnings.push(
      'Long runs are still short relative to race distance. The plan builds them gradually; ' +
        'do not add extra distance on your own.',
    );
  }
  if ((profile.injuryFlags?.length ?? 0) > 0) {
    warnings.push(
      'Injury history noted: weekly ramp capped at 5%. Stop and get advice if pain changes ' +
        'how you run.',
    );
  }

  return warnings;
}

function finalizePlan(plan: Plan): Plan {
  const violations = checkPlan(plan);
  if (violations.length > 0) {
    plan.warnings.push(
      ...violations.map((violation) => `Internal check (${violation.rule}): ${violation.message}`),
    );
  }
  return plan;
}

export function generateRacePlan(
  profileInput: AthleteProfile,
  goalInput: PlanGoal,
  vdot: number,
  startDate: ISODate,
): Plan {
  const profile = parseAthleteProfile(profileInput);
  const goal = parsePlanGoal(goalInput);

  if (goal.type !== 'race' || goal.distanceKm == null || goal.date == null) {
    throw new Error('generateRacePlan needs a race goal with distance and date');
  }

  const distance = goal.distanceKm;
  const config = RACE_CONFIG[distance];
  const start = startOfWeek(startDate);
  const raceWeekStart = startOfWeek(goal.date);
  const weeksTotal = diffDays(start, raceWeekStart) / 7 + 1;

  if (!Number.isInteger(weeksTotal) || weeksTotal < 1) {
    throw new Error('Race date must be on or after the plan start date');
  }
  if (weeksTotal > 52) {
    throw new Error('Plans longer than 52 weeks are not supported');
  }

  const taperWeeks = Math.min(config.taperWeeks, Math.max(1, Math.floor(weeksTotal / 4)));
  const phases = buildPhases(weeksTotal, taperWeeks);
  const paces = buildPaceZones(vdot);
  const { volumes, longs, peakVolume } = buildVolumes(
    profile,
    weeksTotal,
    phases,
    { ...config, taperWeeks },
    distance,
  );

  const weeks: PlanWeek[] = [];
  for (let i = 0; i < weeksTotal; i += 1) {
    const weekStart = addDays(start, i * 7);
    const phase = phases[i] as Phase;

    if (i === weeksTotal - 1) {
      const raceWeek = buildRaceWeek(
        weekStart,
        goal.date,
        distance,
        paces,
        goal.targetTimeS,
        profile.daysPerWeek,
      );
      weeks.push({ ...raceWeek, index: i });
      continue;
    }

    weeks.push(
      buildTrainingWeek({
        weekStart,
        weekIndex: i,
        phase,
        volumeKm: volumes[i] as number,
        longKm: longs[i] as number,
        qualityCount: qualityCountFor(profile.daysPerWeek),
        profile,
        distance,
        paces,
        isDownWeek: isDownWeekFor(phase, i),
        maxWorkKm: config.maxWorkKm,
        maxLongKm: config.maxLongKm,
      }),
    );
  }

  const endDate = addDays(weeks[weeks.length - 1]?.startDate ?? start, 6);

  return finalizePlan({
    createdAt: start,
    startDate: start,
    endDate,
    mode: 'race',
    goal,
    vdot,
    paces,
    weeks,
    warnings: buildWarnings(profile, config, weeksTotal, peakVolume),
  });
}

export function generateFitnessPlan(
  profileInput: AthleteProfile,
  goalInput: PlanGoal,
  vdot: number,
  startDate: ISODate,
  weeksTotal = 8,
): Plan {
  const profile = parseAthleteProfile(profileInput);
  const goal = parsePlanGoal(goalInput);
  const config = FITNESS_CONFIG;
  const start = startOfWeek(startDate);
  const distance: RaceDistance = goal.distanceKm ?? 10;

  const phases: Phase[] = [];
  for (let i = 0; i < weeksTotal; i += 1) {
    if (i < Math.ceil(weeksTotal * 0.35)) phases.push('base');
    else if (i < Math.ceil(weeksTotal * 0.85)) phases.push('build');
    else phases.push('peak');
  }

  const paces = buildPaceZones(vdot);
  const { volumes, longs, peakVolume } = buildVolumes(profile, weeksTotal, phases, config);

  const weeks: PlanWeek[] = [];
  for (let i = 0; i < weeksTotal; i += 1) {
    const phase = phases[i] as Phase;
    weeks.push(
      buildTrainingWeek({
        weekStart: addDays(start, i * 7),
        weekIndex: i,
        phase,
        volumeKm: volumes[i] as number,
        longKm: longs[i] as number,
        qualityCount: qualityCountFor(profile.daysPerWeek),
        profile,
        distance,
        paces,
        isDownWeek: isDownWeekFor(phase, i),
        maxWorkKm: config.maxWorkKm,
        maxLongKm: config.maxLongKm,
      }),
    );
  }

  const warnings = buildWarnings(profile, config, weeksTotal, peakVolume);

  return finalizePlan({
    createdAt: start,
    startDate: start,
    endDate: addDays(weeks[weeks.length - 1]?.startDate ?? start, 6),
    mode: 'fitness',
    goal: { ...goal, type: 'fitness' },
    vdot,
    paces,
    weeks,
    warnings,
  });
}

export function generatePlan(
  profile: AthleteProfile,
  goal: PlanGoal,
  vdot: number,
  startDate: ISODate,
): Plan {
  if (goal.type === 'race') return generateRacePlan(profile, goal, vdot, startDate);
  return generateFitnessPlan(profile, goal, vdot, startDate);
}
