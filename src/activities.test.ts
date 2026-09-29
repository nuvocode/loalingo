import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesAnswer, plannedActivities, lessonSchema, toItems } from "./activities.ts";

test("answer check ignores case, punctuation and curly quotes; accepts variants", () => {
  const item = { answer: "I'm fine, thank you.", accepted: ["I am fine, thanks"] };
  assert.ok(matchesAnswer("im fine thank you", item) === false); // apostrophe is meaningful
  assert.ok(matchesAnswer("i’m FINE thank you!", item));
  assert.ok(matchesAnswer("I am fine thanks", item));
  assert.ok(!matchesAnswer("I'm fine", item));
});

test("lesson plan skips v1-unsupported types, applies default count, validates and maps output", () => {
  const acts = plannedActivities([{ type: "speak" }, { type: "word_select", count: 1 }, { type: "match" }]);
  assert.deepEqual(acts.map((a) => [a.key, a.type, a.count]), [["a0", "word_select", 1], ["a1", "match", 2]]);
  const out = lessonSchema(acts).parse({
    a0: [{ prompt: "Hello?", options: ["Merhaba", "Hoşça kal", "Evet", "Hayır"], answer_index: 0 }],
    a1: [{ pairs: [{ target: "hi", native: "selam" }, { target: "bye", native: "güle güle" }, { target: "yes", native: "evet" }] }],
  });
  const items = toItems(acts, out as any);
  assert.equal(items.length, 2);
  assert.ok(items[0].kind === "choice" && items[0].options[items[0].answer] === "Merhaba");
  assert.throws(() => lessonSchema(acts).parse({ a0: [{ prompt: "x", options: ["a", "b", "c"], answer_index: 7 }], a1: [] }));
  // Out-of-range index slips past the schema when options < 4: toItems drops it instead of crashing.
  assert.equal(toItems(acts, { a0: [{ prompt: "x", options: ["a", "b", "c"], answer_index: 3 }], a1: [] }).length, 0);
});
