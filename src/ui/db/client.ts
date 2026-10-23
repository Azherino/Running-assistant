import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';

const sqlite = SQLite.openDatabaseSync('running-assistant.db');

export const db = drizzle(sqlite);

let initialized = false;

/** Creates the local schema. Safe to call on every launch. */
export function initDatabase(): void {
  if (initialized) return;
  sqlite.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY NOT NULL,
      date TEXT NOT NULL,
      distance_m REAL NOT NULL,
      duration_s INTEGER,
      avg_hr INTEGER,
      rpe INTEGER,
      type TEXT,
      note TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS runs_date_idx ON runs (date);
  `);
  initialized = true;
}
