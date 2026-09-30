import { test } from "node:test";
import assert from "node:assert/strict";
import type { CourseLevel } from "./course.ts";
import { currentUnit, describeEvent, HISTORY_IN_PROMPT, isNoise, looseTutor, mergeInput, silenceDelay, tutorPrompt, tutorSystem, type TutorMsg, type TutorReply } from "./tutor.ts";

const ctx = { name: "Mia", persona: "Cheerful barista.", target: "English", native: "Turkish", level: "A2", unit: "Food", words: ["apple", "bread"], grammar: ["I like + noun"] };

test("system prompt carries level, languages, unit material and every action", () => {
  const p = tutorSystem(ctx);
  for (const s of ["A2", "English", "Turkish", "Food", "apple, bread", "I like + noun", "speak", "wait", "check_in", "end", "Have you ever", "Cheerful barista."]) assert.ok(p.includes(s), s);
});

test("prompt has the notes, only the latest history and the event", () => {
  const hist: TutorMsg[] = Array.from({ length: 20 }, (_, i) => ({ from: i % 2 ? "me" : "tutor", text: `m${i}`, via: i === 19 ? "text" : "voice" }));
  const p = tutorPrompt("Mia", hist, "on past simple", { kind: "user_typed", text: "one sec" });
  assert.ok(p.includes("on past simple"));
  assert.ok(!p.includes(": m7"), "old turn dropped");
  assert.ok(p.includes(`Mia: m${20 - HISTORY_IN_PROMPT}`));
  assert.ok(p.includes("Learner (typed): m19"));
  assert.ok(p.includes('typed in the chat: "one sec"'));
  assert.ok(tutorPrompt("Mia", [], "", { kind: "start" }).includes("(none yet)"));
});

test("describeEvent covers the events", () => {
  assert.match(describeEvent({ kind: "silence", seconds: 20 }), /20 seconds/);
  assert.match(describeEvent({ kind: "mic", on: false }), /microphone off/);
  assert.match(describeEvent({ kind: "cam", on: true }), /camera on/);
  assert.match(describeEvent({ kind: "user_said", text: "hi" }), /said: "hi"/);
  assert.match(describeEvent({ kind: "start" }), /connected/);
});

test("loose reply: a broken action means speak, missing text is empty", () => {
  assert.deepEqual(looseTutor.parse({ action: "dance", say: "Hi!" }), { action: "speak", say: "Hi!", translation: "", correction: "", notes: "" });
});

test("silence delay: questions 20 s, after wait 60 s, none for statements or an ended call, none after 2 nudges", () => {
  const r = (action: TutorReply["action"], say: string): TutorReply => ({ action, say, translation: "", correction: "", notes: "" });
  assert.equal(silenceDelay(r("speak", "How are you?"), 0), 20);
  assert.equal(silenceDelay(r("wait", "Sure, take your time."), 0), 60);
  assert.equal(silenceDelay(r("speak", "Great."), 0), null);
  assert.equal(silenceDelay(r("end", "Bye?"), 0), null);
  assert.equal(silenceDelay(r("check_in", "Are you there?"), 2), null);
  assert.equal(silenceDelay(null, 0), null);
});

test("mergeInput joins queued learner input and drops the rest", () => {
  assert.equal(mergeInput([]), null);
  assert.equal(mergeInput([{ kind: "silence", seconds: 20 }]), null);
  assert.deepEqual(mergeInput([{ kind: "user_said", text: "I went" }, { kind: "mic", on: true }, { kind: "user_typed", text: "to Rome" }]), { kind: "user_typed", text: "I went to Rome" });
});

test("isNoise: only empty text or bracketed tags", () => {
  assert.ok(isNoise("  "));
  assert.ok(isNoise("[BLANK_AUDIO]"));
  assert.ok(isNoise("(wind blowing)"));
  assert.ok(!isNoise("Yes"));
  assert.ok(!isNoise("Yes [laughs]"));
});

test("currentUnit: the first unit with an unfinished step, else the last", () => {
  const lv = { title: "A1", units: [{ id: "u1", title: "U1", steps: [{ id: "a" }] }, { id: "u2", title: "U2", steps: [{ id: "b" }, { id: "c" }] }] } as unknown as CourseLevel;
  assert.equal(currentUnit(lv, new Set()).id, "u1");
  assert.equal(currentUnit(lv, new Set(["a", "b"])).id, "u2");
  assert.equal(currentUnit(lv, new Set(["a", "b", "c"])).id, "u2");
});
