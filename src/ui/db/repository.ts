import { desc, eq } from 'drizzle-orm';
import { db } from './client';
import { appState, runs, type StoredAppState } from './schema';

export type RunRow = typeof runs.$inferSelect;

export interface NewRun {
  date: string;
  distanceM: number;
  durationS?: number;
  avgHr?: number;
  rpe?: number;
  type?: RunRow['type'];
  note?: string;
  source?: RunRow['source'];
}

export function loadAppState(): StoredAppState | null {
  const row = db.select().from(appState).where(eq(appState.id, 1)).get();
  return row?.dataJson ?? null;
}

export function saveAppState(state: StoredAppState): void {
  const updatedAt = new Date().toISOString();
  db.insert(appState)
    .values({ id: 1, dataJson: state, updatedAt })
    .onConflictDoUpdate({
      target: appState.id,
      set: { dataJson: state, updatedAt },
    })
    .run();
}

export function clearAppState(): void {
  db.delete(appState).run();
}

export function listRuns(): RunRow[] {
  return db.select().from(runs).orderBy(desc(runs.date), desc(runs.createdAt)).all();
}

export function insertRun(input: NewRun): RunRow {
  const row: RunRow = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: input.date,
    distanceM: input.distanceM,
    durationS: input.durationS ?? null,
    avgHr: input.avgHr ?? null,
    rpe: input.rpe ?? null,
    type: input.type ?? null,
    note: input.note ?? null,
    source: input.source ?? 'manual',
    createdAt: new Date().toISOString(),
  };
  db.insert(runs).values(row).run();
  return row;
}

export function deleteRun(id: string): void {
  db.delete(runs).where(eq(runs.id, id)).run();
}

export function clearRuns(): void {
  db.delete(runs).run();
}
