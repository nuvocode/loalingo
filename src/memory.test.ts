import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanOps, evictIds, looseMemory, MEMORY_MAX, MEMORY_TEXT_MAX, memoryPrompt, memorySystem, type Memory } from "./memory.ts";

const saved: Memory[] = [
  { id: 1, kind: "interest", text: "Prefers DC to Marvel.", source: "tutor", hits: 0, last_seen_at: "2026-09-01" },
  { id: 2, kind: "goal", text: "Moving to Spain next year.", source: "chat", hits: 3, last_seen_at: "2026-09-02" },
];

test("system prompt names the filter rules and the native language", () => {
  const p = memorySystem("Turkish");
  for (const s of ["Turkish", "One-off events", "pizza", "Health, religion, politics", "practising", "empty lists"]) assert.ok(p.includes(s), s);
});

test("prompt lists saved facts with ids and labels the learner", () => {
  const p = memoryPrompt(saved, [{ from: "other", text: "Hi!" }, { from: "me", text: "I love Batman." }], "Mia");
  assert.ok(p.includes("#2 [goal] Moving to Spain next year."));
  assert.ok(p.includes("Mia: Hi!\nLearner: I love Batman."));
  assert.ok(memoryPrompt([], [], "Mia").includes("(none)"));
});

test("cleanOps drops unknown ids, empty text and duplicates; clips long text", () => {
  const ops = cleanOps(saved, {
    add: [
      { kind: "interest", text: "  prefers dc to MARVEL " }, // already saved
      { kind: "background", text: "Works as a nurse." },
      { kind: "background", text: "works as a nurse" }, // twice in one reply
      { kind: "learning", text: "   " },
      { kind: "interest", text: "x".repeat(300) },
      null,
    ],
    update: [{ id: 2, text: "Moving to Madrid next year." }, { id: 9, text: "ghost" }],
    forget: [7, null],
  });
  assert.deepEqual(ops.forget, []);
  assert.deepEqual(ops.update, [{ id: 2, text: "Moving to Madrid next year." }]);
  assert.deepEqual(ops.add.map((a) => a.text), ["Works as a nurse.", "x".repeat(MEMORY_TEXT_MAX)]);
});

test("a fact forgotten in the same reply can be added again in new words", () => {
  const ops = cleanOps(saved, { add: [{ kind: "interest", text: "Prefers DC to Marvel." }], update: [{ id: 1, text: "y" }], forget: [1, 1] });
  assert.deepEqual(ops.forget, [1]);
  assert.deepEqual(ops.update, []);
  assert.equal(ops.add.length, 1);
});

test("loose schema keeps the usable parts of a broken reply", () => {
  const r = looseMemory.parse({ add: [{ kind: "hobby", text: "x" }, { kind: "goal", text: "Wants to pass IELTS." }], forget: "none" });
  assert.deepEqual(cleanOps(saved, r), { add: [{ kind: "goal", text: "Wants to pass IELTS." }], update: [], forget: [] });
});

test("eviction keeps MEMORY_MAX, dropping least used then least recently seen", () => {
  assert.deepEqual(evictIds(saved), []);
  const many = Array.from({ length: MEMORY_MAX + 2 }, (_, i) => ({ id: i + 1, hits: i < 3 ? 0 : 5, last_seen_at: `2026-09-${String(10 - i).padStart(2, "0")}` }));
  assert.deepEqual(evictIds(many), [3, 2]); // ids 1–3 unused; 3 and 2 seen longest ago
});
