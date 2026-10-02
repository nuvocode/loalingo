import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanDebrief, debriefPrompt, rehearsalSystem, rehearseId } from "./rehearsal.ts";
import { parseTalkId } from "./characters.ts";

const c = { course: { name: "English" }, level: "A2", native: "tr" };

test("system prompt plays the brief in role, never teaches", () => {
  const sys = rehearsalSystem(c, { who: "my landlord", about: "the broken boiler", formality: "formal" });
  for (const s of ["my landlord", "the broken boiler", "formally", "never teach", "Never step out", "Turkish"]) assert.ok(sys.includes(s), s);
  for (const s of ["correction", "CHAT_MIN_TURNS", "goal_reached"]) assert.ok(!sys.includes(s), s);
  assert.ok(rehearsalSystem(c, { who: "x", formality: "neutral" }).includes("something you need to sort out"));
});

test("debrief prompt numbers the learner's turns", () => {
  const p = debriefPrompt(c, { who: "my boss", formality: "neutral" }, ["Hi", "I want raise"]);
  assert.ok(p.includes("0. Hi\n1. I want raise"));
  assert.ok(debriefPrompt(c, { who: "x", formality: "neutral" }, []).includes("never spoke"));
});

test("cleanDebrief drops turns out of range and caps phrases at five", () => {
  const ph = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `p${i}`, translation: `t${i}` }));
  const d = cleanDebrief({
    stuck: [{ turn: 0, moment: "a", why: "b" }, { turn: 2, moment: "a", why: "b" }, { turn: -1, moment: "a", why: "b" }, { turn: 1, moment: " ", why: "" }],
    phrases: [{ text: " ", translation: "x" }, ...ph(7)],
  }, 2);
  assert.deepEqual(d.stuck, [{ turn: 0, moment: "a", why: "b" }]);
  assert.deepEqual(d.phrases, ph(5));
});

test("rehearse ids round-trip, `:` and `|` included", () => {
  const brief = { who: "my: landlord|tom", about: "kombi: yarın", formality: "casual" as const };
  assert.deepEqual(parseTalkId(rehearseId(true, "tom", brief)), { voice: true, who: "tom", topic: { goal: brief.about }, rehearse: brief });
  assert.deepEqual(parseTalkId(rehearseId(false, "tom", { who: "my: landlord" })),
    { voice: false, who: "tom", topic: { goal: "" }, rehearse: { who: "my: landlord", formality: "neutral" } });
  for (const bad of ["rehearse:tom:chat:", "rehearse:tom:chat:%7B%7D", "rehearse:nobody:chat:" + encodeURIComponent('{"who":"x"}'),
    "rehearse:tom:sms:" + encodeURIComponent('{"who":"x"}'), "rehearse:tom:chat:%E0%A4%A"]) assert.equal(parseTalkId(bad), null, bad);
});
