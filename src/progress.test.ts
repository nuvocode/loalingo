import { test } from "node:test";
import assert from "node:assert/strict";
import { NEW_STATS, recordSession, rollDay } from "./progress.ts";

const lesson = { xp: 30, gems: 4, kind: "lesson" as const };

test("streak grows on consecutive days and resets after a gap", () => {
  let s = recordSession(NEW_STATS, lesson, "2026-03-01");
  assert.equal(s.streak, 1);
  s = recordSession(s, lesson, "2026-03-01");
  assert.equal(s.streak, 1, "same day counts once");
  assert.equal(s.todayXp, 60);
  s = recordSession(s, lesson, "2026-03-02");
  assert.equal(s.streak, 2);
  assert.equal(s.todayXp, 30, "daily XP resets");
  assert.equal(s.bestDayXp, 60);
  assert.equal(rollDay(s, "2026-03-04").streak, 0, "a missed day breaks it");
  assert.equal(recordSession(s, lesson, "2026-03-04").streak, 1);
  assert.equal(s.bestStreak, 2);
});

test("streak freeze covers missed days, across month ends", () => {
  const s = { ...recordSession(NEW_STATS, lesson, "2026-02-27"), streakFreeze: 1 };
  const r = recordSession(s, lesson, "2026-03-01"); // 28 Feb missed
  assert.equal(r.streak, 2);
  assert.equal(r.streakFreeze, 0);
});

test("quests and chest reward", () => {
  let s = recordSession(NEW_STATS, lesson, "2026-03-01");
  s = recordSession(s, lesson, "2026-03-01");
  s = recordSession(s, { xp: 0, gems: 0, kind: "lesson" }, "2026-03-01");
  assert.equal(s.chests, 0);
  s = recordSession(s, { xp: 10, gems: 0, kind: "practice" }, "2026-03-01");
  assert.equal(s.chests, 1);
  s = recordSession(s, { xp: 10, gems: 0, kind: "practice" }, "2026-03-01");
  assert.equal(s.chests, 1, "only once a day");
  assert.equal(rollDay({ ...s, hearts: 0 }, "2026-03-02").hearts, 5);
});

test("daily reminder fires once, after its time, only on days without practice", async () => {
  const { reminderDue } = await import("./progress.ts");
  const s = { ...NEW_STATS, reminderOn: true, reminderTime: "19:00" };
  const at = (h: number, m = 0) => new Date(2026, 2, 5, h, m);
  assert.equal(reminderDue(s, at(18, 59)), false);
  assert.equal(reminderDue(s, at(19)), true);
  assert.equal(reminderDue({ ...s, lastActive: "2026-03-05" }, at(20)), false, "already practiced");
  assert.equal(reminderDue({ ...s, remindedDay: "2026-03-05" }, at(20)), false, "already reminded");
  assert.equal(reminderDue({ ...s, reminderOn: false }, at(20)), false);
});
