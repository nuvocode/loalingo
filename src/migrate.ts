// Schema migrations (spec A): ordered steps tracked by SQLite's `PRAGMA user_version`.
// Pure: runs on any SqlDb (tauri-plugin-sql in the app, sql.js in the dev preview and tests).

export type SqlDb = {
  select<T = Record<string, any>>(sql: string, args?: unknown[]): Promise<T[]>;
  execute(sql: string, args?: unknown[]): Promise<{ lastInsertId?: number }>;
};
export type Migration = { v: number; sql: string };

/** The database was written by a newer app. Opening it here could corrupt it, so we stop. */
export class FutureSchemaError extends Error {
  readonly found: number;
  readonly known: number;
  // ponytail: no parameter properties, Node's type stripping (used by the tests) doesn't support them.
  constructor(found: number, known: number) {
    super(`Database schema v${found} is newer than this app supports (v${known}).`);
    this.name = "FutureSchemaError";
    this.found = found;
    this.known = known;
  }
}

export async function schemaVersion(db: SqlDb) {
  const [r] = await db.select<{ user_version: number }>("PRAGMA user_version");
  return Number(r?.user_version ?? 0);
}

/** Brings the schema to the latest version. `backup(target)` runs once, before the first pending step, if the database already has tables. */
export async function runMigrations(db: SqlDb, migrations: Migration[], backup?: (target: number) => Promise<void>) {
  const from = await schemaVersion(db);
  const known = Math.max(0, ...migrations.map((m) => m.v));
  if (from > known) throw new FutureSchemaError(from, known);
  const pending = migrations.filter((m) => m.v > from).sort((a, b) => a.v - b.v);
  if (!pending.length) return { from, to: from };
  if (backup) {
    const [t] = await db.select<{ n: number }>("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'");
    if (Number(t?.n) > 0) await backup(known);
  }
  for (const m of pending) {
    // One execute call = one pooled connection, so BEGIN and COMMIT must travel together.
    // ponytail: if a step fails, ROLLBACK may land on another pooled connection; the app then shows the boot error and a restart drops the half-open one.
    try {
      await db.execute(`BEGIN;\n${m.sql.trim().replace(/;$/, "")};\nPRAGMA user_version = ${m.v};\nCOMMIT;`);
    } catch (e) {
      await db.execute("ROLLBACK").catch(() => {});
      throw e;
    }
  }
  return { from, to: known };
}
