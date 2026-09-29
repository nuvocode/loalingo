import { test } from "node:test";
import assert from "node:assert/strict";
import { newLeague, rankOf, rivalXp, rollLeague, weekOf } from "./league.ts";

test("weeks start on Monday", () => {
  assert.equal(weekOf("2026-09-28"), "2026-09-28"); // Monday
  assert.equal(weekOf("2026-10-04"), "2026-09-28"); // Sunday
  assert.equal(weekOf("2026-10-05"), "2026-10-05");
});

test("rivals are stable per week and grow through it", () => {
  const a = newLeague("2026-09-28", 2), b = newLeague("2026-09-28", 2);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.rivals.map((r) => r.n)).size, 9);
  const start = new Date(2026, 8, 28).getTime();
  const r = a.rivals[0];
  assert.equal(rivalXp(r, a.week, start), 0);
  assert.equal(rivalXp(r, a.week, start + 30 * 86_400_000), r.rate * 7, "capped at week end");
});

test("new week settles the league: top 3 up, bottom 3 down, idle stays out of promotion", () => {
  const l = newLeague("2026-09-28", 3);
  const same = rollLeague(l, 50, "2026-10-02");
  assert.equal(same.league, l, "same week: unchanged");
  const up = rollLeague(l, 1e6, "2026-10-05");
  assert.equal(up.league.tier, 4); assert.equal(up.league.last, "up"); assert.equal(up.weekXp, 0);
  assert.ok(rankOf(l, 0, new Date(2026, 9, 5).getTime()) > 7);
  const down = rollLeague(l, 0, "2026-10-05");
  assert.equal(down.league.tier, 2); assert.equal(down.league.last, "down");
  assert.equal(rollLeague(newLeague("2026-09-28", 0), 0, "2026-10-05").league.tier, 0, "no tier below Bronze");
  assert.equal(rollLeague(null, 0, "2026-10-05").league.week, "2026-10-05");
});
