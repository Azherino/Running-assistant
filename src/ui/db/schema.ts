import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AthleteProfile, LoggedRun, Plan, PlanGoal } from '../../engine/types';

export interface StoredAppState {
  profile: AthleteProfile;
  goal: PlanGoal;
  plan: Plan;
}

export const appState = sqliteTable('app_state', {
  id: integer('id').primaryKey().notNull(),
  dataJson: text('data_json', { mode: 'json' }).$type<StoredAppState>().notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey().notNull(),
  date: text('date').notNull(),
  distanceM: real('distance_m').notNull(),
  durationS: integer('duration_s'),
  avgHr: integer('avg_hr'),
  rpe: integer('rpe'),
  type: text('type').$type<LoggedRun['type']>(),
  note: text('note'),
  source: text('source').notNull().default('manual'),
  createdAt: text('created_at').notNull(),
});
