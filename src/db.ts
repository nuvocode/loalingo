// SQLite storage (DECISIONS A5, E4–E6). In Tauri: tauri-plugin-sql (`loalingo.db` in the app config dir).
// ponytail: in a plain browser (the Vite preview used during development) the same SQL runs on sql.js,
// persisted to localStorage. Never used in the shipped app.
import type { Cefr } from "./course";
import type { ThemePref } from "./theme";
import { NEW_STATS, type Stats } from "./progress";
export { NEW_STATS, type Stats };

type Row = Record<string, any>;
type Db = { select<T = Row>(sql: string, args?: unknown[]): Promise<T[]>; execute(sql: string, args?: unknown[]): Promise<{ lastInsertId?: number }> };

const SCHEMA = `
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
  strength INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(enrollment_id, word))`;

async function tauriDb(): Promise<Db> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  return Database.load("sqlite:loalingo.db");
}

async function browserDb(): Promise<Db> {
  const [{ default: init }, { default: wasm }] = await Promise.all([import("sql.js"), import("sql.js/dist/sql-wasm.wasm?url")]);
  const SQL = await init({ locateFile: () => wasm });
  const KEY = "loalingo.devdb";
  const saved = localStorage.getItem(KEY);
  const db = new SQL.Database(saved ? Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)) : undefined);
  // `$1` placeholders (plugin-sql style) are named parameters to SQLite, so bind them by name.
  const bind = (args: unknown[] = []) => Object.fromEntries(args.map((v, i) => [`$${i + 1}`, v ?? null])) as any;
  return {
    async select(sql, args) {
      const st = db.prepare(sql); st.bind(bind(args));
      const rows: any[] = [];
      while (st.step()) rows.push(st.getAsObject());
      st.free();
      return rows;
    },
    async execute(sql, args) {
      db.run(sql, bind(args));
      const id = db.exec("SELECT last_insert_rowid()")[0].values[0][0] as number;
      localStorage.setItem(KEY, btoa(String.fromCharCode(...db.export())));
      return { lastInsertId: id };
    },
  };
}

let dbP: Promise<Db> | null = null;
export const isTauri = "__TAURI_INTERNALS__" in window;
function db() {
  return (dbP ??= (async () => {
    const d = await (isTauri ? tauriDb() : import.meta.env.DEV ? browserDb() : Promise.reject(new Error("loalingo needs the Tauri shell")));
    for (const stmt of SCHEMA.split(";")) await d.execute(stmt);
    return d;
  })());
}

// ---- Types ----

export type Profile = {
  id: number; name: string; color: string; pin_hash: string | null; ui_lang: string; theme: ThemePref;
  native_lang: string; active_enrollment_id: number | null; stats: Stats; created_at: string;
};
export type Enrollment = { id: number; profile_id: number; course_iso: string; level: Cefr; xp: number };

const toProfile = (r: Row): Profile => ({ ...(r as Profile), stats: { ...NEW_STATS, ...JSON.parse(r.stats) } });

// ---- Device ----

export async function getSetting(key: string) {
  const r = await (await db()).select<{ value: string }>("SELECT value FROM device_settings WHERE key = $1", [key]);
  return r[0]?.value ?? null;
}
export async function setSetting(key: string, value: string | null) {
  await (await db()).execute("INSERT INTO device_settings(key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2", [key, value]);
}

// ---- Profiles ----

export async function listProfiles() {
  return (await (await db()).select("SELECT * FROM profiles ORDER BY id")).map(toProfile);
}
export async function getProfile(id: number) {
  const r = await (await db()).select("SELECT * FROM profiles WHERE id = $1", [id]);
  return r[0] ? toProfile(r[0]) : null;
}

export type NewProfile = Pick<Profile, "name" | "color" | "ui_lang" | "theme" | "native_lang"> & { pin: string | null };
export async function createProfile(p: NewProfile, courseIso: string, level: Cefr) {
  const d = await db();
  const { lastInsertId: id } = await d.execute(
    "INSERT INTO profiles(name, color, pin_hash, ui_lang, theme, native_lang, stats) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [p.name, p.color, p.pin ? await hashPin(p.pin) : null, p.ui_lang, p.theme, p.native_lang, JSON.stringify(NEW_STATS)],
  );
  await enroll(id!, courseIso, level);
  return id!;
}

type ProfilePatch = Partial<Pick<Profile, "name" | "color" | "ui_lang" | "theme" | "native_lang" | "active_enrollment_id" | "stats">> & { pin?: string | null };
export async function updateProfile(id: number, patch: ProfilePatch) {
  const { pin, stats, ...rest } = patch;
  const cols: Record<string, unknown> = { ...rest };
  if (stats) cols.stats = JSON.stringify(stats);
  if (pin !== undefined) cols.pin_hash = pin ? await hashPin(pin) : null;
  const keys = Object.keys(cols); // keys come from the typed patch above, never from user input
  if (!keys.length) return;
  await (await db()).execute(
    `UPDATE profiles SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")} WHERE id = $${keys.length + 1}`,
    [...Object.values(cols), id],
  );
}

// ---- Enrollments (profile × course) ----

export async function listEnrollments(profileId: number) {
  return (await db()).select<Enrollment>("SELECT id, profile_id, course_iso, level, xp FROM enrollments WHERE profile_id = $1 ORDER BY id", [profileId]);
}
/** Enrolls (or reuses the existing enrollment) and makes it the profile's active course. */
export async function enroll(profileId: number, courseIso: string, level: Cefr) {
  const d = await db();
  await d.execute("INSERT INTO enrollments(profile_id, course_iso, level) VALUES ($1, $2, $3) ON CONFLICT(profile_id, course_iso) DO NOTHING", [profileId, courseIso, level]);
  const [{ id }] = await d.select<{ id: number }>("SELECT id FROM enrollments WHERE profile_id = $1 AND course_iso = $2", [profileId, courseIso]);
  await updateProfile(profileId, { active_enrollment_id: id });
  return id;
}
export async function addXp(enrollmentId: number, xp: number) {
  await (await db()).execute("UPDATE enrollments SET xp = xp + $1 WHERE id = $2", [xp, enrollmentId]);
}

// ---- Progress ----

export async function doneSteps(enrollmentId: number) {
  const r = await (await db()).select<{ step_id: string }>("SELECT step_id FROM step_progress WHERE enrollment_id = $1 AND state = 'done'", [enrollmentId]);
  return new Set(r.map((x) => x.step_id));
}
export async function legendarySteps(enrollmentId: number) {
  const r = await (await db()).select<{ step_id: string }>("SELECT step_id FROM step_progress WHERE enrollment_id = $1 AND legendary = 1", [enrollmentId]);
  return new Set(r.map((x) => x.step_id));
}
export async function markLegendary(enrollmentId: number, stepId: string) {
  await (await db()).execute("UPDATE step_progress SET legendary = 1 WHERE enrollment_id = $1 AND step_id = $2", [enrollmentId, stepId]);
}
export async function markDone(enrollmentId: number, stepId: string) {
  await (await db()).execute("INSERT INTO step_progress(enrollment_id, step_id, state) VALUES ($1, $2, 'done') ON CONFLICT DO UPDATE SET state = 'done'", [enrollmentId, stepId]);
}

// ---- Generated lesson cache (DECISIONS C3; per enrollment because it will be personalised by mistakes) ----

export async function getCached<T>(enrollmentId: number, stepId: string): Promise<T | null> {
  const r = await (await db()).select<{ content: string }>("SELECT content FROM content_cache WHERE enrollment_id = $1 AND step_id = $2", [enrollmentId, stepId]);
  return r[0] ? JSON.parse(r[0].content) : null;
}
export async function putCached(enrollmentId: number, stepId: string, content: unknown) {
  await (await db()).execute("INSERT INTO content_cache(enrollment_id, step_id, content) VALUES ($1, $2, $3) ON CONFLICT DO UPDATE SET content = $3, created_at = CURRENT_TIMESTAMP", [enrollmentId, stepId, JSON.stringify(content)]);
}

/** Levels passed via checkpoint or level test: marks every node of the level done and moves the enrollment on. */
export async function completeLevel(enrollmentId: number, ids: string[], next: Cefr | null) {
  for (const id of ids) await markDone(enrollmentId, id);
  if (next) await (await db()).execute("UPDATE enrollments SET level = $1 WHERE id = $2", [next, enrollmentId]);
}

// ---- Mistakes and words (per enrollment, DECISIONS E6) ----

export async function addMistake(enrollmentId: number, item: unknown) {
  await (await db()).execute("INSERT INTO mistakes(enrollment_id, item) VALUES ($1, $2) ON CONFLICT DO NOTHING", [enrollmentId, JSON.stringify(item)]);
}
export async function listMistakes<T>(enrollmentId: number, limit = 1000) {
  const r = await (await db()).select<{ id: number; item: string }>("SELECT id, item FROM mistakes WHERE enrollment_id = $1 ORDER BY id DESC LIMIT $2", [enrollmentId, limit]);
  return r.map((x) => ({ id: x.id, item: JSON.parse(x.item) as T }));
}
export async function deleteMistake(id: number) {
  await (await db()).execute("DELETE FROM mistakes WHERE id = $1", [id]);
}

export type Word = { word: string; translation: string; strength: number };
/** Seen again → stronger (max 5). */
export async function addWords(enrollmentId: number, pairs: [string, string][]) {
  const d = await db();
  for (const [w, t] of pairs) await d.execute(
    "INSERT INTO words(enrollment_id, word, translation) VALUES ($1, $2, $3) ON CONFLICT DO UPDATE SET strength = MIN(5, strength + 1), translation = $3, updated_at = CURRENT_TIMESTAMP",
    [enrollmentId, w, t]);
}
export async function nudgeWord(enrollmentId: number, word: string, delta: number) {
  await (await db()).execute("UPDATE words SET strength = MAX(0, MIN(5, strength + $1)), updated_at = CURRENT_TIMESTAMP WHERE enrollment_id = $2 AND word = $3", [delta, enrollmentId, word]);
}
export async function listWords(enrollmentId: number) {
  return (await db()).select<Word>("SELECT word, translation, strength FROM words WHERE enrollment_id = $1 ORDER BY updated_at DESC, word", [enrollmentId]);
}

// ---- PIN (DECISIONS E4: a privacy lock between people sharing a device, not real security) ----

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha(salt: string, pin: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + pin)));
}
async function hashPin(pin: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `${salt}:${await sha(salt, pin)}`;
}
export async function checkPin(p: Profile, pin: string) {
  if (!p.pin_hash) return true;
  const [salt, h] = p.pin_hash.split(":");
  return (await sha(salt, pin)) === h;
}
