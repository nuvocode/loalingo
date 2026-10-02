import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanNote, moodOf, noteFor, noteFresh, notePrompt } from "./gardenNote.ts";

test("a note lasts three days, then or on a mood or language change it is rewritten", () => {
  const n = noteFor("Hi", "2026-10-02", "ok", "Turkish");
  assert.equal(n.until, "2026-10-05");
  for (const day of ["2026-10-02", "2026-10-03", "2026-10-04"]) assert.ok(noteFresh(n, day, "ok", "Turkish"), day);
  assert.ok(!noteFresh(n, "2026-10-05", "ok", "Turkish"));
  assert.ok(!noteFresh(n, "2026-10-03", "dry", "Turkish"));
  assert.ok(!noteFresh(n, "2026-10-03", "ok", "English"));
  assert.ok(!noteFresh(null, "2026-10-03", "ok", "Turkish"));
});

test("mood and cleanup", () => {
  assert.equal(moodOf(0, false), "new");
  assert.equal(moodOf(4, false), "ok");
  assert.equal(moodOf(4, true), "dry");
  assert.equal(cleanNote('"**Köklerin** derinleşiyor."'), "Köklerin derinleşiyor.");
  assert.equal(cleanNote("x".repeat(500)), "");
});

test("the prompt carries the learner's numbers and facts", () => {
  const p = notePrompt({ name: "Ada", course: "Spanish", level: "A2", mood: "ok", roots: 6, bestRoots: 9, xp: 1200, lessons: 14, stage: "sapling", fruit: 1, greenhouses: 0 }, ["moving to Madrid"]);
  assert.match(p, /Roots: 6 days \(best 9\)/);
  assert.match(p, /moving to Madrid/);
});
