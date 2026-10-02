import { test } from "node:test";
import assert from "node:assert/strict";
import { drillId, mmss, nextPlanningSec, parseDrill, planningHistory, type Drill } from "./drills.ts";
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
