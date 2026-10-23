import type { ISODate } from './dates';

export type RaceDistance = 5 | 10 | 21.0975 | 42.195;

export const HALF_MARATHON_KM = 21.0975;
export const MARATHON_KM = 42.195;

export type Phase = 'base' | 'build' | 'peak' | 'taper';

export type PaceZoneName = 'easy' | 'marathon' | 'threshold' | 'interval' | 'repetition';

export interface PaceBand {
  /** Fastest acceptable pace, seconds per km. */
  minSPerKm: number;
  /** Slowest acceptable pace, seconds per km. */
  maxSPerKm: number;
}

export interface PaceZones {
  vdot: number;
  easy: PaceBand;
  marathon: PaceBand;
  threshold: PaceBand;
  interval: PaceBand;
  repetition: PaceBand;
}

export type WorkoutType =
  | 'easy'
  | 'long'
  | 'threshold'
  | 'interval'
  | 'repetition'
  | 'fartlek'
  | 'hills'
  | 'race'
  | 'rest'
  | 'cross';

export type StepKind = 'warmup' | 'work' | 'recovery' | 'cooldown' | 'strides';

export interface WorkoutStep {
  kind: StepKind;
  label: string;
  /** Repeat count; undefined or 1 means a single block. */
  reps?: number;
  distanceM?: number;
  durationS?: number;
  paceMinSPerKm?: number;
  paceMaxSPerKm?: number;
  /** Which pace zone drove this step, used when recalibrating. */
  zone?: PaceZoneName;
}

export interface Workout {
  date: ISODate;
  type: WorkoutType;
  title: string;
  purpose: string;
  steps: WorkoutStep[];
  targetDistanceM: number;
  targetDurationS: number;
  /** True for sessions that count toward the hard 20% of an 80/20 week. */
  hard: boolean;
  note?: string;
}

export interface PlanWeek {
  index: number;
  startDate: ISODate;
  phase: Phase;
  targetVolumeKm: number;
  isDownWeek: boolean;
  workouts: Workout[];
}

export interface AthleteProfile {
  /** Average weekly distance over the last 4 weeks, km. */
  weeklyVolumeKm: number;
  /** Longest run in the last 6 weeks, km. */
  longestRecentKm: number;
  daysPerWeek: 3 | 4 | 5 | 6;
  /** Long run on Saturday (6) or Sunday (7). Defaults to Sunday. */
  preferredLongDay?: 6 | 7;
  age?: number;
  maxHr?: number;
  restingHr?: number;
  /** Two or more years of consistent running unlocks a slightly faster ramp. */
  experienced?: boolean;
  injuryFlags?: string[];
}

export interface PlanGoal {
  type: 'race' | 'fitness';
  distanceKm?: RaceDistance;
  date?: ISODate;
  targetTimeS?: number;
}

export interface Plan {
  createdAt: ISODate;
  startDate: ISODate;
  endDate: ISODate;
  mode: 'race' | 'fitness';
  goal: PlanGoal;
  vdot: number;
  paces: PaceZones;
  weeks: PlanWeek[];
  warnings: string[];
  /** Coach messages about what changed and why (recalibration, regeneration). */
  notes?: string[];
}

export interface WeekReview {
  /** Monday of the reviewed week, when known. */
  weekStart?: ISODate;
  plannedKm: number;
  completedKm: number;
  plannedSessions: number;
  completedSessions: number;
  missedQuality: number;
  /** Average RPE (1-10) reported on easy and long runs. */
  easyRpeAvg?: number;
  /** Easy runs where average HR exceeded the top of the easy band. */
  easyRunsAboveHrZone: number;
  acwr: number;
  injuryFlag: boolean;
  painNote?: string;
  isDownWeek: boolean;
  /** Consecutive prior weeks that met the "ready to progress" bar. */
  goodWeeksInARow?: number;
}

/** A run the athlete has logged, in the shape the engine consumes. */
export interface LoggedRun {
  date: ISODate;
  distanceM: number;
  durationS?: number;
  avgHr?: number;
  /** 1 (very easy) to 10 (max). */
  rpe?: number;
  type?: WorkoutType;
  note?: string;
}

export type AdjustmentAction =
  | 'proceed'
  | 'hold'
  | 'reduce'
  | 'deload'
  | 'increase'
  | 'recalibrate'
  | 'medical';

export interface Adjustment {
  action: AdjustmentAction;
  /**
   * Multiplier applied to the week that was just completed, used to set next
   * week's volume. 1.08 = normal progression, 1.0 = hold, 0.8 = cut.
   */
  volumeFactor: number;
  /** How many quality sessions to drop from next week. */
  dropQualitySessions: number;
  reason: string;
  ruleId: string;
}
