import { test } from "node:test";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
import { FutureSchemaError, runMigrations, schemaVersion, type Migration } from "./migrate.ts";
import { MIGRATIONS } from "./migrations.ts";
import { wrapSqlJs } from "./sqljs.ts";

const SQL = await initSqlJs();
const fresh = () => wrapSqlJs(new SQL.Database());
const tables = async (db: ReturnType<typeof fresh>) =>
  (await db.select<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((r) => r.name);

const TABLES = ["content_cache", "device_settings", "enrollments", "memories", "mistakes", "profiles", "speech_sessions", "step_progress", "words"];

test("empty database migrates to the latest version", async () => {
  const db = fresh();
  const r = await runMigrations(db, MIGRATIONS);
  const latest = Math.max(...MIGRATIONS.map((m) => m.v));
  assert.deepEqual(r, { from: 0, to: latest });
  assert.equal(await schemaVersion(db), latest);
  for (const t of TABLES) assert.ok((await tables(db)).includes(t), `table ${t} exists`);
});

test("existing pre-migration database (tables, user_version 0) keeps its data", async () => {
  const db = fresh();
  await db.execute(MIGRATIONS[0].sql); // what 0.1.x created, without user_version
  await db.execute("INSERT INTO device_settings(key, value) VALUES ($1, $2)", ["k", "v"]);
  assert.equal(await schemaVersion(db), 0);
  await runMigrations(db, MIGRATIONS);
  assert.equal(await schemaVersion(db), Math.max(...MIGRATIONS.map((m) => m.v)));
  assert.deepEqual(await db.select("SELECT key, value FROM device_settings"), [{ key: "k", value: "v" }]);
});

test("running twice is a no-op", async () => {
  const db = fresh();
  await runMigrations(db, MIGRATIONS);
  const again = await runMigrations(db, MIGRATIONS);
  assert.equal(again.from, again.to);
});

test("pending migrations apply in order", async () => {
  const db = fresh();
  const ms: Migration[] = [
    { v: 2, sql: "INSERT INTO t(x) VALUES ('two')" },
    { v: 1, sql: "CREATE TABLE t(x TEXT)" },
  ];
  await runMigrations(db, ms);
  assert.equal(await schemaVersion(db), 2);
  assert.deepEqual(await db.select("SELECT x FROM t"), [{ x: "two" }]);
});

test("a newer schema than the app knows throws FutureSchemaError and changes nothing", async () => {
  const db = fresh();
  await db.execute("PRAGMA user_version = 99");
  await assert.rejects(runMigrations(db, MIGRATIONS), (e: unknown) => e instanceof FutureSchemaError && e.found === 99 && e.known === Math.max(...MIGRATIONS.map((m) => m.v)));
  assert.equal(await schemaVersion(db), 99);
  assert.deepEqual(await tables(db), []);
});

test("a failing migration rolls back and keeps the previous version", async () => {
  const db = fresh();
  const ms: Migration[] = [
    { v: 1, sql: "CREATE TABLE a(x TEXT)" },
    { v: 2, sql: "CREATE TABLE b(x TEXT); INSERT INTO nope VALUES (1)" },
  ];
  await assert.rejects(runMigrations(db, ms));
  assert.equal(await schemaVersion(db), 1);
  assert.deepEqual(await tables(db), ["a"], "table b from the failed migration is rolled back");
});

test("backup runs once before migrating a database that has tables, never for an empty one", async () => {
  const calls: number[] = [];
  const backup = async (v: number) => { calls.push(v); };
  const ms: Migration[] = [{ v: 1, sql: "CREATE TABLE a(x TEXT)" }, { v: 2, sql: "CREATE TABLE b(x TEXT)" }];

  const empty = fresh();
  await runMigrations(empty, ms, backup);
  assert.deepEqual(calls, [], "no backup for a brand-new database");

  const old = fresh();
  await runMigrations(old, ms.slice(0, 1));
  await runMigrations(old, ms, backup);
  assert.deepEqual(calls, [2], "one backup, named after the target version");

  await runMigrations(old, ms, backup);
  assert.deepEqual(calls, [2], "no backup when nothing is pending");
});
