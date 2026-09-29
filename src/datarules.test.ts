import { test } from "node:test";
import assert from "node:assert/strict";
import { backupsToPrune, dailyName, LOCK_STALE_MS, lockVerdict, sqliteUrl, sqlString } from "./datarules.ts";

const NOW = 1_800_000_000_000;

test("lock verdict", () => {
  assert.equal(lockVerdict(null, "mac", NOW), "free");
  assert.equal(lockVerdict({ device: "mac", at: NOW - 60 * 60_000 }, "mac", NOW), "ours");
  assert.equal(lockVerdict({ device: "mini", at: NOW - 60_000 }, "mac", NOW), "held");
  assert.equal(lockVerdict({ device: "mini", at: NOW - LOCK_STALE_MS + 1 }, "mac", NOW), "held");
  assert.equal(lockVerdict({ device: "mini", at: NOW - LOCK_STALE_MS }, "mac", NOW), "stale");
  assert.equal(lockVerdict({ device: "mini", at: NOW + 60_000 }, "mac", NOW), "held");
});

test("daily backup name uses the local date", () => {
  assert.equal(dailyName(new Date(2026, 0, 5, 23, 59)), "daily-2026-01-05.db");
});

test("backup pruning keeps the newest seven daily files and ignores others", () => {
  const days = Array.from({ length: 10 }, (_, i) => `daily-2026-09-${String(20 + i).padStart(2, "0")}.db`);
  const names = [...days].reverse().concat(["pre-v2-123.db", "replaced-9.db", "daily-notes.txt"]);
  assert.deepEqual(backupsToPrune(names), ["daily-2026-09-22.db", "daily-2026-09-21.db", "daily-2026-09-20.db"]);
  assert.deepEqual(backupsToPrune(days.slice(0, 7)), []);
  assert.deepEqual(backupsToPrune([]), []);
});

test("sqlite url escapes characters sqlx would decode", () => {
  assert.equal(sqliteUrl("/Users/a/My Drive/loalingo.db"), "sqlite:/Users/a/My Drive/loalingo.db");
  assert.equal(sqliteUrl("/x/100%?#/loalingo.db"), "sqlite:/x/100%25%3F%23/loalingo.db");
  assert.equal(sqlString("/a/O'Neil/x.db"), "'/a/O''Neil/x.db'");
});
