import { test } from "node:test";
import assert from "node:assert/strict";
import { REPETITION_RULE, drillConditions, drillId, drillRules, mmss, nextPlanningSec, parseDrill, planningHistory, roundStat, type Drill } from "./drills.ts";
import { parseTalkId } from "./characters.ts";
import type { SessionRow } from "./speech.ts";

test("nextPlanningSec: 60 → 30 → 0, two sessions per step, never back up", () => {
  assert.equal(nextPlanningSec([]), 60);
  assert.equal(nextPlanningSec([60]), 60);
  assert.equal(nextPlanningSec([60, 60]), 30);
  assert.equal(nextPlanningSec([30, 60, 60]), 30);
  assert.equal(nextPlanningSec([30, 30, 60, 60]), 0);
  assert.equal(nextPlanningSec([0, 30, 30]), 0);
  assert.equal(nextPlanningSec([60, 30, 30]), 0); // a stray 60 (newest) does not pull it back up
});

const row = (c: SessionRow["conditions"]): SessionRow => ({ utterances: 1, latency_ms: null, wpm: 100, long_pauses: 0, words: 5, native_words: 0, conditions: c });

test("planningHistory: only planning drills, newest first, zeros kept", () => {
  const rows = [ // oldest first, as listSpeechSessions returns them
    row({ mode: "drill", drill: "planning", planningTimeSec: 60, topicFamiliarity: "prepared" }),
    row({ mode: "chat", planningTimeSec: 0, topicFamiliarity: "novel" }),
    row({ mode: "drill", drill: "ladder", planningTimeSec: 60, topicFamiliarity: "prepared", rung: 1 }),
    row(undefined),
    row({ mode: "drill", drill: "planning", planningTimeSec: 0, topicFamiliarity: "prepared" }),
  ];
  assert.deepEqual(planningHistory(rows), [0, 60]);
});

test("drill id round-trips through parseTalkId", () => {
  const d: Drill = { kind: "planning", topic: "my trip: day 1", planningSec: 30, minutes: 3 };
  const t = parseTalkId(drillId("leo", d));
  assert.ok(t);
  assert.equal(t.voice, true);
  assert.equal(t.who, "leo");
  assert.deepEqual(t.drill, d);
  assert.equal(parseTalkId(drillId("nobody", d)), null);
  assert.equal(parseDrill(["planning", "%7Bbad"]), null);
  assert.equal(parseDrill(["planning", encodeURIComponent(JSON.stringify({ topic: " ", planningSec: 30, minutes: 3 }))]), null);
});

test("mmss", () => {
  assert.equal(mmss(0), "0:00");
  assert.equal(mmss(65), "1:05");
  assert.equal(mmss(180), "3:00");
});

const r432 = (round: number, prev: Drill["prev"] = []): Drill => ({ kind: "432", topic: "my weekend", planningSec: 0, minutes: [4, 3, 2][round - 1], round, prev });
const plan: Drill = { kind: "planning", topic: "my weekend", planningSec: 30, minutes: 3 };

test("drillConditions: 4/3/2 rounds and planning", () => {
  assert.deepEqual(drillConditions(r432(1)), { mode: "drill", drill: "432", planningTimeSec: 0, topicFamiliarity: "novel", round: 1 });
  assert.deepEqual(drillConditions(r432(2)), { mode: "drill", drill: "432", planningTimeSec: 0, topicFamiliarity: "prepared", round: 2 });
  assert.deepEqual(drillConditions(r432(3)), { mode: "drill", drill: "432", planningTimeSec: 0, topicFamiliarity: "prepared", round: 3 });
  assert.deepEqual(drillConditions(plan), { mode: "drill", drill: "planning", planningTimeSec: 30, topicFamiliarity: "prepared" });
});

test("drillRules: REPETITION_RULE only in 4/3/2 rounds 2–3", () => {
  assert.ok(!drillRules(r432(1)).includes(REPETITION_RULE));
  assert.ok(drillRules(r432(2)).includes(REPETITION_RULE));
  assert.ok(drillRules(r432(3)).includes(REPETITION_RULE));
  assert.ok(!drillRules(plan).includes(REPETITION_RULE));
  assert.ok(drillRules(plan)[0].includes("my weekend"));
});

test("4/3/2 id carries round and prev; minutes follow the round", () => {
  const prev = [{ wpm: 90, pauseRatio: 0.2, fillers: 3 }, null];
  const t = parseTalkId(drillId("mia", r432(3, prev)));
  assert.ok(t);
  assert.deepEqual(t.drill, r432(3, prev));
  assert.equal(t.drill?.minutes, 2);
  assert.equal(parseDrill(["432", encodeURIComponent(JSON.stringify({ topic: "x", round: 4, prev: [] }))]), null);
  // a broken stat becomes null, and prev never holds more than round - 1 entries
  assert.deepEqual(parseDrill(["432", encodeURIComponent(JSON.stringify({ topic: "x", round: 2, prev: [{ wpm: "fast" }, { wpm: 1, pauseRatio: 0, fillers: 0 }] }))])?.prev, [null]);
});

test("roundStat keeps only the compared numbers", () => {
  assert.equal(roundStat(null), null);
  assert.deepEqual(roundStat({ utterances: 3, silences: 0, latencyMs: null, wpm: 101, pauseRatio: 0.1, longPauses: 1, level: 0.1, fillers: 2, words: 40, nativeWords: 0, speechMs: 20000 }),
    { wpm: 101, pauseRatio: 0.1, fillers: 2 });
});
