import { test } from "node:test";
import assert from "node:assert/strict";
import { NAMES, newLeague, rankOf, msLeft, rivalXp, rollLeague, sessions, weekOf, zones, type LeagueState, type Rival } from "./league.ts";

const W = "2026-09-28", start = new Date(2026, 8, 28).getTime(), DAY = 86_400_000;
const who = { id: 1, lang: "tr" };
const avg = (l: LeagueState) => l.rivals.reduce((a, r) => a + r.total, 0) / l.rivals.length;

test("weeks start on Monday", () => {
  assert.equal(weekOf("2026-09-28"), "2026-09-28"); // Monday
  assert.equal(weekOf("2026-10-04"), "2026-09-28"); // Sunday
  assert.equal(weekOf("2026-10-05"), "2026-10-05");
});

test("rivals are stable per week and grow through it", () => {
  const a = newLeague(W, 2, undefined, who);
  assert.deepEqual(a, newLeague(W, 2, undefined, who));
  assert.notDeepEqual(a.rivals, newLeague(W, 2, undefined, { id: 2, lang: "tr" }).rivals, "each learner gets their own league");
  assert.equal(new Set(a.rivals.map((r) => r.n)).size, 9);
  for (const r of a.rivals) {
    assert.ok(r.passion >= 0 && r.passion <= 1);
    assert.equal(rivalXp(r, W, start), 0);
    assert.equal(rivalXp(r, W, start + 30 * DAY), r.total, "all of it by the week's end");
    let prev = 0;
    for (let h = 0; h <= 168; h += 3) { const x = rivalXp(r, W, start + h * 3_600_000); assert.ok(x >= prev); prev = x; }
  }
});

test("sessions: 10–40 XP in fives, 08:00–24:00, inside the week, summing to total", () => {
  for (const tier of [0, 5, 9]) for (const r of newLeague(W, tier, undefined, who).rivals) {
    const s = sessions(r, W);
    assert.equal(s.reduce((a, x) => a + x.xp, 0), r.total);
    s.forEach((x, i) => {
      assert.ok(x.xp >= 10 && x.xp <= 40 && x.xp % 5 === 0, `step ${x.xp}`);
      assert.ok(x.at >= start && x.at < start + 7 * DAY);
      assert.ok(new Date(x.at).getHours() >= 8);
      if (i) assert.ok(x.at >= s[i - 1].at);
    });
  }
});

test("the week gets busier, low passion starts late", () => {
  const mid = start + 3.5 * DAY;
  let early = 0, all = 0;
  for (let t = 0; t < 10; t++) for (const r of newLeague(W, t, undefined, who).rivals) { early += rivalXp(r, W, mid); all += r.total; }
  assert.ok(early < all / 2, `${early} of ${all} by midweek`);
  const lazy: Rival = { n: "A", c: "#000", total: 400, passion: 0 };
  assert.ok(rivalXp(lazy, W, mid) < rivalXp({ ...lazy, passion: 1 }, W, mid));
});

test("standings change during the week", () => {
  const l = newLeague(W, 4, undefined, who);
  const order = (now: number) => l.rivals.map((r) => [r.n, rivalXp(r, W, now)] as const).sort((a, b) => b[1] - a[1]).map((x) => x[0]).join();
  const seen = new Set<string>();
  for (let d = 1; d <= 7; d++) seen.add(order(start + d * DAY));
  assert.ok(seen.size > 2, `${seen.size} distinct orders`);
});

test("higher leagues are busier, weeks vary, totals stay in range", () => {
  assert.ok(avg(newLeague(W, 9, undefined, who)) > avg(newLeague(W, 0, undefined, who)));
  const weeks = ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"].map((w) => avg(newLeague(w, 3, undefined, who)));
  assert.ok(new Set(weeks).size > 1, "a surprise every week");
  for (const t of [0, 9]) {
    const mean = 7 * (15 + 12 * t);
    for (const r of newLeague(W, t, undefined, who).rivals) assert.ok(r.total >= 10 && r.total >= mean * 0.16 - 5 && r.total <= mean * 2.4 + 5, `${r.total}`);
  }
});

test("about half the names come from the learner's language", () => {
  for (let id = 1; id <= 6; id++) {
    const l = newLeague(W, 0, undefined, { id, lang: "tr" });
    const tr = l.rivals.filter((r) => NAMES.tr.includes(r.n)).length;
    assert.ok(tr === 4 || tr === 5, `${tr} Turkish names`);
    assert.equal(new Set(l.rivals.map((r) => r.n)).size, 9);
  }
  const unknown = newLeague(W, 0, undefined, { id: 1, lang: "xx" });
  assert.ok(unknown.rivals.filter((r) => NAMES.en.includes(r.n)).length >= 4, "unknown language falls back to English");
  assert.doesNotThrow(() => newLeague(W, 0, undefined, { id: 1, lang: "constructor" }), "prototype keys fall back to English");
});

test("new week settles the league: top 3 up, bottom 3 down (see zones), idle stays out of promotion", () => {
  const l = newLeague(W, 3, undefined, who);
  const same = rollLeague(l, 50, "2026-10-02");
  assert.equal(same.league, l, "same week: unchanged");
  const up = rollLeague(l, 1e6, "2026-10-05");
  assert.equal(up.league.tier, 4); assert.equal(up.league.last, "up"); assert.equal(up.weekXp, 0);
  assert.deepEqual(up.league.who, who, "the learner carries over");
  assert.ok(rankOf(l, 0, new Date(2026, 9, 5).getTime()) > 7);
  const down = rollLeague(l, 0, "2026-10-05");
  assert.equal(down.league.tier, 2); assert.equal(down.league.last, "down");
  assert.deepEqual(zones(0), { up: 3, down: 0 });
  assert.deepEqual(zones(4), { up: 3, down: 3 });
  assert.deepEqual(zones(9), { up: 0, down: 3 });
  const seed = rollLeague(newLeague(W, 0), 0, "2026-10-05").league;
  assert.equal(seed.tier, 0); assert.equal(seed.last, "stay", "nobody drops out of Seed");
  const top = rollLeague(newLeague(W, 9), 1e6, "2026-10-05").league;
  assert.equal(top.tier, 9); assert.equal(top.last, "stay", "nobody moves up from the top league");
  const topLast = rollLeague(newLeague(W, 9), 0, "2026-10-05").league;
  assert.equal(topLast.tier, 8); assert.equal(topLast.last, "down");
  const seedFirst = rollLeague(newLeague(W, 0), 1e6, "2026-10-05").league;
  assert.equal(seedFirst.tier, 1); assert.equal(seedFirst.last, "up");
  assert.equal(rollLeague(null, 0, "2026-10-05").league.week, "2026-10-05");
});

test("an old-format league is redrawn, keeping tier and weekly XP", () => {
  const old = { week: W, tier: 3, last: "up", rivals: [{ n: "Aylin", c: "#000", rate: 20 }] } as unknown as LeagueState;
  const same = rollLeague(old, 120, "2026-10-01", who);
  assert.equal(same.league.tier, 3); assert.equal(same.league.last, "up"); assert.equal(same.weekXp, 120);
  assert.equal(same.league.rivals.length, 9); assert.deepEqual(same.league.who, who);
  const next = rollLeague(old, 120, "2026-10-05", who);
  assert.equal(next.league.tier, 3); assert.equal(next.league.week, "2026-10-05"); assert.equal(next.weekXp, 0);
});

test("a DST week ends at the next local Monday, not 7×24h after the start", () => {
  for (const [w, next] of [["2026-10-19", new Date(2026, 9, 26).getTime()], ["2026-03-23", new Date(2026, 2, 30).getTime()]] as const) {
    const l = newLeague(w, 5, undefined, who), ws = new Date(+w.slice(0, 4), +w.slice(5, 7) - 1, +w.slice(8)).getTime();
    assert.equal(msLeft(l, next), 0);
    for (const r of l.rivals) {
      assert.equal(rivalXp(r, w, next), r.total, "everything counts at settlement");
      for (const x of sessions(r, w)) {
        const at = new Date(x.at), day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
        assert.ok(x.at >= ws && x.at < next && at.getHours() >= 8, `${w} ${at}`);
        assert.ok(x.at < new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime());
      }
    }
  }
});
