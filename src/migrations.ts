// Ordered schema changes. Append only: never edit a shipped step, add a new one with the next `v`.
import type { Migration } from "./migrate";

export const MIGRATIONS: Migration[] = [
  {
    v: 1, // the 0.1.x schema; IF NOT EXISTS so existing databases pass through untouched
    sql: `
CREATE TABLE IF NOT EXISTS device_settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS profiles(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, pin_hash TEXT,
  ui_lang TEXT NOT NULL, theme TEXT NOT NULL DEFAULT 'system', native_lang TEXT NOT NULL,
  active_enrollment_id INTEGER, stats TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS enrollments(
  id INTEGER PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_iso TEXT NOT NULL, level TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(profile_id, course_iso));
CREATE TABLE IF NOT EXISTS step_progress(
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE, step_id TEXT NOT NULL,
  state TEXT NOT NULL, legendary INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(enrollment_id, step_id));
CREATE TABLE IF NOT EXISTS content_cache(
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE, step_id TEXT NOT NULL,
  content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(enrollment_id, step_id));
CREATE TABLE IF NOT EXISTS mistakes(
  id INTEGER PRIMARY KEY, enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  item TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(enrollment_id, item));
CREATE TABLE IF NOT EXISTS words(
  enrollment_id INTEGER NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE, word TEXT NOT NULL, translation TEXT NOT NULL,
  strength INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(enrollment_id, word))`,
  },
  {
    v: 2, // SPR-22: profile memory, facts about the learner (src/memory.ts)
    sql: `
CREATE TABLE memories(
  id INTEGER PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, text TEXT NOT NULL, source TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX memories_profile ON memories(profile_id)`,
  },
  {
    v: 3, // SPR-25: speech signals, one summary row per voice session (src/speech.ts); no audio is kept
    sql: `
CREATE TABLE speech_sessions(
  id INTEGER PRIMARY KEY, profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE SET NULL, mode TEXT NOT NULL,
  utterances INTEGER NOT NULL, silences INTEGER NOT NULL, latency_ms INTEGER, wpm INTEGER NOT NULL,
  pause_ratio REAL NOT NULL, long_pauses INTEGER NOT NULL, level REAL NOT NULL, fillers INTEGER NOT NULL,
  words INTEGER NOT NULL, native_words INTEGER NOT NULL, speech_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX speech_sessions_profile ON speech_sessions(profile_id)`,
  },
  {
    v: 4, // fluency drills: the conditions a voice session was spoken under (JSON Conditions, src/speech.ts; NULL = not measured)
    // and the target structure the learner avoided in it (structure drill)
    sql: `ALTER TABLE speech_sessions ADD COLUMN conditions TEXT;
ALTER TABLE speech_sessions ADD COLUMN avoided TEXT`,
  },
];
