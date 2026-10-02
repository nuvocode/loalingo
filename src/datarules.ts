// Data folder rules, pure so they run under `node --test`. The Tauri side is src/datadir.ts.

export type Lock = { device: string; at: number };

/** A lock older than this belongs to a device that crashed or lost the folder; it is taken over silently. */
export const LOCK_STALE_MS = 3 * 60_000;

/** "free": no lock · "ours": this device (also after a crash) · "stale": another device, gone quiet · "held": another device is using it. */
export function lockVerdict(lock: Lock | null, me: string, now: number): "free" | "ours" | "stale" | "held" {
  if (!lock) return "free";
  if (lock.device === me) return "ours";
  // ponytail: a lock from the future (clock skew between devices) counts as fresh
  return now - lock.at >= LOCK_STALE_MS ? "stale" : "held";
}

/** `daily-YYYY-MM-DD.db` in local time, like the streak day. */
export const dailyName = (d = new Date()) =>
  `daily-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.db`;

/** Daily backups to delete so the newest `keep` remain. Other files in backups/ are never touched. */
export function backupsToPrune(names: string[], keep = 7) {
  return names.filter((n) => /^daily-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort().reverse().slice(keep);
}

/** tauri-plugin-sql URL for an absolute path. sqlx percent-decodes the file name, so escape what it would eat. */
export const sqliteUrl = (file: string) => `sqlite:${file.replace(/[%?#]/g, (c) => encodeURIComponent(c))}`;

/** Single-quoted SQL string literal (VACUUM INTO takes no bound parameter in every SQLite build). */
export const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;
