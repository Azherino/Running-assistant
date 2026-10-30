import { create } from 'zustand';
import { startOfWeek } from '../../engine/dates';
import { generatePlan } from '../../engine/plan/generator';
import { applyWeekAdjustment } from '../../engine/plan/adapt';
import { recalibratePlan } from '../../engine/plan/recalibrate';
import type {
  Adjustment,
  AthleteProfile,
  LoggedRun,
  Plan,
  PlanGoal,
  RaceDistance,
  WeekReview,
} from '../../engine/types';
import { vdotFromPerformance } from '../../engine/vdot';
import { isDuplicate, type ComparableRun } from '../../import/dedupe';
import type { ImportedActivity } from '../../import/types';
import { initDatabase } from '../db/client';
import {
  clearAppState,
  clearRuns,
  deleteRun,
  insertRun,
  listRuns,
  loadAppState,
  saveAppState,
  type NewRun,
  type RunRow,
} from '../db/repository';
import type { StoredAppState } from '../db/schema';
import { todayISO } from '../lib/dates';

export interface OnboardingInput {
  performance: { distanceKm: RaceDistance; timeS: number };
  weeklyVolumeKm: number;
  longestRecentKm: number;
  daysPerWeek: 3 | 4 | 5 | 6;
  preferredLongDay: 6 | 7;
  experienced: boolean;
  age?: number;
  maxHr?: number;
  restingHr?: number;
  goal: {
    type: 'race' | 'fitness';
    distanceKm?: RaceDistance;
    date?: string;
    targetTimeS?: number;
  };
  painNote?: string;
}

interface AppStore {
  ready: boolean;
  error: string | null;
  data: StoredAppState | null;
  runs: RunRow[];
  hydrate: () => Promise<void>;
  completeOnboarding: (input: OnboardingInput) => Promise<void>;
  logRun: (input: NewRun) => Promise<void>;
  importActivities: (activities: ImportedActivity[]) => Promise<{ added: number; skipped: number }>;
  removeRun: (id: string) => Promise<void>;
  applyAdjustment: (
    fromWeekIndex: number,
    adjustment: Adjustment,
    review: WeekReview,
  ) => Promise<void>;
  recalibratePaces: (vdot: number, fromDate: string) => Promise<void>;
  buildNextBlock: () => Promise<void>;
  reset: () => Promise<void>;
}

function buildState(input: OnboardingInput): StoredAppState {
  const { performance } = input;
  const vdot = vdotFromPerformance(performance.distanceKm * 1000, performance.timeS);

  const profile: AthleteProfile = {
    weeklyVolumeKm: input.weeklyVolumeKm,
    longestRecentKm: input.longestRecentKm,
    daysPerWeek: input.daysPerWeek,
    preferredLongDay: input.preferredLongDay,
    experienced: input.experienced,
    age: input.age,
    maxHr: input.maxHr,
    restingHr: input.restingHr,
    injuryFlags: input.painNote ? [input.painNote] : undefined,
  };

  const goal: PlanGoal =
    input.goal.type === 'race'
      ? {
          type: 'race',
          distanceKm: input.goal.distanceKm,
          date: input.goal.date,
          targetTimeS: input.goal.targetTimeS,
        }
      : { type: 'fitness' };

  const plan = generatePlan(profile, goal, vdot, startOfWeek(todayISO()));

  return { profile, goal, plan };
}

export const useAppStore = create<AppStore>((set, get) => ({
  ready: false,
  error: null,
  data: null,
  runs: [],

  hydrate: async () => {
    try {
      initDatabase();
      const data = loadAppState();
      set({ data, runs: listRuns(), ready: true, error: null });
    } catch (error) {
      set({
        ready: true,
        error: error instanceof Error ? error.message : 'Could not open the local database',
      });
    }
  },

  completeOnboarding: async (input) => {
    const data = buildState(input);
    saveAppState(data);
    set({ data, runs: listRuns(), error: null });
  },

  logRun: async (input) => {
    insertRun(input);
    set({ runs: listRuns() });
  },

  importActivities: async (activities) => {
    const comparison: ComparableRun[] = [...get().runs];
    const accepted: ImportedActivity[] = [];

    for (const activity of activities) {
      if (isDuplicate(activity, comparison)) continue;
      accepted.push(activity);
      comparison.push({
        date: activity.date,
        distanceM: activity.distanceM,
        durationS: activity.durationS ?? null,
      });
    }

    for (const activity of accepted) {
      insertRun({
        date: activity.date,
        distanceM: activity.distanceM,
        durationS: activity.durationS,
        avgHr: activity.avgHr,
        type: activity.type,
        note: activity.name ?? `Imported from ${activity.source.toUpperCase()}`,
        source: 'import',
      });
    }

    if (accepted.length > 0) set({ runs: listRuns() });
    return { added: accepted.length, skipped: activities.length - accepted.length };
  },

  removeRun: async (id) => {
    deleteRun(id);
    set({ runs: listRuns() });
  },

  applyAdjustment: async (fromWeekIndex, adjustment, review) => {
    const { data } = get();
    if (!data) return;

    const plan = applyWeekAdjustment(
      data.plan,
      data.profile,
      fromWeekIndex,
      adjustment,
      review,
    );
    const next: StoredAppState = { ...data, plan };
    saveAppState(next);
    set({ data: next, error: null });
  },

  recalibratePaces: async (vdot, fromDate) => {
    const { data } = get();
    if (!data) return;

    const plan = recalibratePlan(data.plan, vdot, fromDate);
    const next: StoredAppState = { ...data, plan };
    saveAppState(next);
    set({ data: next, error: null });
  },

  buildNextBlock: async () => {
    const { data, runs } = get();
    if (!data) return;
    const plan = generatePlan(
      data.profile,
      data.goal,
      data.plan.vdot,
      startOfWeek(todayISO()),
    );
    const next: StoredAppState = { ...data, plan };
    saveAppState(next);
    set({ data: next, runs });
  },

  reset: async () => {
    clearAppState();
    clearRuns();
    set({ data: null, runs: [], error: null });
  },
}));

/** Runs in the shape the engine's review helpers expect. */
export function toEngineRuns(rows: RunRow[]): LoggedRun[] {
  return rows.map((row) => ({
    date: row.date,
    distanceM: row.distanceM,
    durationS: row.durationS ?? undefined,
    avgHr: row.avgHr ?? undefined,
    rpe: row.rpe ?? undefined,
    type: row.type ?? undefined,
    note: row.note ?? undefined,
  }));
}

export function usePlan(): Plan | null {
  return useAppStore((state) => state.data?.plan ?? null);
}
