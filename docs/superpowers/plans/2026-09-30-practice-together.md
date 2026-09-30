# Practice Together Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "practice together" panel inside the tutor video call. The learner does warm-up exercises, then reads a text and answers questions about it, then discusses open questions, all with the tutor guiding.

**Architecture:**
- A pure module `src/practice.ts` owns the flow (stages, grading, topic list, content schema) and describes the screen to the tutor as text.
- The tutor brain `src/tutor.ts` gets new events and actions plus an `answer` field for spoken answers. It never decides grading or stage changes.
- `src/TutorCall.tsx` wires the new `src/PracticePanel.tsx` into the call and switches the grid layout.

**Tech Stack:** React 19, TypeScript, Vite, zod, i18next, Tauri 2. Tests use `node --test` (Node 26 runs `.ts` directly).

**Spec:** `docs/superpowers/specs/2026-09-30-practice-together-design.md`

## Global Constraints

- **Tests:** `pnpm test` (= `node --test src/*.test.ts`). **Typecheck and build:** `pnpm build` (= `tsc && vite build`).
- **Imports in modules run by node:** `practice.ts` and `tutor.ts` import runtime values from siblings *with* the `.ts` extension (e.g. `from "./activities.ts"`), like `src/progress.ts:2`. Type-only imports may omit it. Files not run by node (`lessons.ts`, `*.tsx`) use extensionless imports, as they do now.
- **Locales:** every new UI string goes into all 5 files (`en`, `tr`, `de`, `fr`, `es`). `src/locales.test.ts` checks that en and tr have identical keys.
- **Comments:** match the terse style of `src/tutor.ts`. Use `// ponytail:` for deliberate simplifications.
- **Commits:** plain-sentence subjects like the existing history (e.g. "Add the practice-together flow module"). No `feat:` prefix. End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit to the current `test` branch.
- **Layout:** the breakpoint is 768px, the same as the existing `.call-grid` rule in `src/styles.css:469`.

## File map

| File | Change |
|---|---|
| `src/practice.ts` | **New.** Topics, content schema and mapping, state machine, grading, `describePractice`. |
| `src/practice.test.ts` | **New.** Tests for the above. |
| `src/tutor.ts` | New actions, `answer` field, practice events, `screen` argument for `tutorPrompt`, prompt rules. |
| `src/tutor.test.ts` | Update fixtures, add tests for the new events, actions and screen text. |
| `src/lessons.ts` | `loadPractice(...)`; `tutorTurn(...)` gets a `screen` argument. |
| `src/PracticePanel.tsx` | **New.** Panel UI. |
| `src/styles.css` | Practice panel and `practice-open` grid. |
| `src/locales/*.json` | New `tutor.*` keys. |
| `src/TutorCall.tsx` | Practice state, event plumbing, bar button, XP. |

---

### Task 1: Practice flow module

**Files:**
- Create: `src/practice.ts`
- Test: `src/practice.test.ts`

**Interfaces:**
- **Consumes, existing:**
  - `lessonSchema`, `toItems`, `normalize`, `REGISTRY`, `type Item`, `type LessonActivity` from `src/activities.ts`
  - `CEFR`, `levelsOf`, `type Cefr`, `type Course`, `type CourseLevel` from `src/course.ts`
  - `currentUnit(level, done)` from `src/tutor.ts`
- **Produces:**
  - `type Topic = { unit: Unit; level: Cefr }`
  - `practiceTopics(course: Course, level: Cefr, done: Set<string>): Topic[]`
  - `findTopic(topics: Topic[], said: string): Topic | undefined`
  - `practiceSchema` (zod object) and `practicePrompt(unit: string, words: string[], grammar: string[]): string`
  - `type PracticeSet = { warmup: Item[]; reading: { title: string; text: string }; comprehension: Item[]; discussion: string[] }` and `toPracticeSet(out: Record<string, unknown>): PracticeSet`
  - `type Stage`, `type Answered = { correct: boolean; given: string; expected: string }`
  - `type PracticeState = { stage: Stage; set: PracticeSet | null; i: number; score: number; total: number; last: Answered | null }`
  - Flow functions: `openPractice(): PracticeState`, `begin(st, set): PracticeState`, `next(st): PracticeState`, `currentItem(st): Item | null`, `expected(it: Item): string`, `accepts(it: Item, given: string): boolean`, `answer(st, given): PracticeState`
  - `describePractice(st: PracticeState | null, topics: Topic[]): string`
  - `PRACTICE_XP = 5`

- [ ] **Step 1: Write the failing tests**

Create `src/practice.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Course } from "./course.ts";
import type { Item } from "./activities.ts";
import {
  accepts, answer, begin, currentItem, describePractice, findTopic, next, openPractice, practiceSchema, practiceTopics, toPracticeSet,
  type PracticeSet,
} from "./practice.ts";

const step = (id: string) => ({ id, title: id, vocabulary: [], grammar: [], activities: [{ type: "learn" }] });
const course = {
  iso: "en", name: "English",
  levels: {
    A1: { title: "A1", units: [{ id: "u1", title: "Greetings", steps: [step("s1"), step("s2")] }, { id: "u2", title: "Food", steps: [step("s3")] }] },
    A2: { title: "A2", units: [{ id: "u3", title: "Travel", steps: [step("s4")] }] },
  },
} as unknown as Course;
const titles = (ts: { unit: { title: string } }[]) => ts.map((t) => t.unit.title);

test("topics: finished units up to the learner's level, else the current unit", () => {
  assert.deepEqual(titles(practiceTopics(course, "A1", new Set(["s1", "s2"]))), ["Greetings"]);
  assert.deepEqual(titles(practiceTopics(course, "A1", new Set(["s1", "s2", "s3", "s4"]))), ["Greetings", "Food"]);
  assert.deepEqual(titles(practiceTopics(course, "A2", new Set(["s1", "s2", "s3", "s4"]))), ["Greetings", "Food", "Travel"]);
  assert.deepEqual(titles(practiceTopics(course, "A1", new Set())), ["Greetings"]);
  assert.equal(practiceTopics(course, "A2", new Set(["s1", "s2"]))[0].level, "A1");
});

test("findTopic: exact title or a sentence that names it", () => {
  const ts = practiceTopics(course, "A1", new Set(["s1", "s2", "s3"]));
  assert.equal(findTopic(ts, "food")?.unit.id, "u2");
  assert.equal(findTopic(ts, "Let's do Greetings, please")?.unit.id, "u1");
  assert.equal(findTopic(ts, "sports"), undefined);
});

const raw = {
  warmup_blank: [{ prompt: "Fill in", sentence_with_blank: "I ___ tea.", options: ["like", "likes", "liking"], answer_index: 0 }],
  warmup_choice: [{ prompt: "Pick the fruit", options: ["apple", "bread", "milk"], answer_index: 0 }],
  warmup_bank: [{ prompt: "Ben çay severim", answer_words: ["I", "like", "tea."], distractor_words: ["likes"] }],
  reading_title: "Breakfast", reading_text: "Tom eats bread every morning.",
  comprehension: [{ prompt: "What does Tom eat?", options: ["bread", "rice", "fish"], answer_index: 0 }],
  discussion: ["What do you eat in the morning?", " ", "Have you ever skipped breakfast?"],
};

test("the model's output parses and maps to a practice set", () => {
  assert.ok(practiceSchema.safeParse(raw).success);
  const set = toPracticeSet(raw);
  assert.deepEqual(set.warmup.map((i) => i.kind), ["choice", "choice", "bank"]);
  assert.deepEqual(set.reading, { title: "Breakfast", text: "Tom eats bread every morning." });
  assert.equal(set.comprehension.length, 1);
  assert.deepEqual(set.discussion, ["What do you eat in the morning?", "Have you ever skipped breakfast?"]);
});

const choice: Item = { kind: "choice", prompt: "Pick", context: "I ___ tea.", big: false, listen: "", options: ["like", "likes", "liking"], answer: 0 };
const bank: Item = { kind: "bank", prompt: "Ben çay severim", answer: ["I", "like", "tea."], bank: ["tea.", "likes", "I", "like"] };
const set: PracticeSet = { warmup: [choice, bank], reading: { title: "T", text: "Text." }, comprehension: [choice], discussion: ["Q1?", "Q2?"] };

test("flow: warm-up → reading → questions → discussion → done, one answer per item", () => {
  let st = begin(openPractice(), set);
  assert.equal(st.stage, "warmup");
  assert.equal(currentItem(st), choice);
  assert.equal(answer(st, "sports"), st, "not an option: ignored");
  st = answer(st, "2");
  assert.deepEqual(st.last, { correct: false, given: "likes", expected: "like" });
  assert.equal(answer(st, "like"), st, "already answered");
  st = answer(next(st), "I like tea");
  assert.deepEqual([st.last?.correct, st.score, st.total], [true, 1, 2]);
  st = next(st); assert.equal(st.stage, "reading"); assert.equal(currentItem(st), null);
  st = next(st); assert.equal(st.stage, "comprehension");
  st = next(answer(st, "LIKE")); assert.deepEqual([st.stage, st.i, st.score, st.total], ["discussion", 0, 2, 3]);
  st = next(st); assert.equal(st.i, 1);
  assert.equal(next(st).stage, "done");
});

test("flow skips empty stages", () => {
  assert.equal(begin(openPractice(), { ...set, warmup: [] }).stage, "reading");
  let st = next(begin(openPractice(), { ...set, warmup: [], comprehension: [] }));
  assert.equal(st.stage, "discussion");
  st = next(next(next(begin(openPractice(), { ...set, discussion: [] })))); // w0 → w1 → reading → comprehension
  assert.equal(next(answer(st, "like")).stage, "done");
});

test("accepts: an option's text or number for choices, any sentence for word tiles", () => {
  assert.ok(accepts(choice, "liking"));
  assert.ok(accepts(choice, "3"));
  assert.ok(!accepts(choice, "4"));
  assert.ok(!accepts(choice, "I think so"));
  assert.ok(accepts(bank, "I like tea"));
  assert.ok(!accepts(bank, " "));
});

test("describePractice tells the tutor what is on screen", () => {
  const ts = practiceTopics(course, "A1", new Set(["s1", "s2", "s3"]));
  assert.match(describePractice(null, ts), /closed.*Greetings, Food/);
  assert.match(describePractice(openPractice(), ts), /exact title in `answer`/);
  const st = begin(openPractice(), set);
  const d = describePractice(st, ts);
  for (const s of ["warm-up", "1 of 2", "I ___ tea.", "1) like", "never say it", "leave `say` empty"]) assert.ok(d.includes(s), s);
  assert.match(describePractice(answer(st, "likes"), ts), /answered "likes": wrong/);
  let dis = next(next(next(answer(next(answer(st, "like")), "I like tea")))); // → reading → comprehension → discussion
  assert.equal(dis.stage, "discussion");
  assert.match(describePractice(dis, ts), /question 1 of 2: "Q1\?"/);
  dis = next(dis);
  assert.match(describePractice(dis, ts), /ask you this question/);
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `node --test src/practice.test.ts`
Expected: FAIL, "Cannot find module .../src/practice.ts".

- [ ] **Step 3: Write the module**

Create `src/practice.ts`:

```ts
// Practice together (spec P): the exercise panel inside the tutor call. Pure module, tested by src/practice.test.ts.
// The app owns the flow and grades answers; the tutor only gets events and a text picture of the screen (describePractice).
import { z } from "zod";
import { CEFR, levelsOf, type Cefr, type Course, type CourseLevel } from "./course.ts";
import { lessonSchema, normalize, REGISTRY, toItems, type Item, type LessonActivity } from "./activities.ts";
import { currentUnit } from "./tutor.ts";

export const PRACTICE_XP = 5; // per correct answer, added to the call's XP

// ---- Topics: one per finished unit, never above the learner's level ----

export type Unit = CourseLevel["units"][number];
export type Topic = { unit: Unit; level: Cefr };

/** Finished units up to the learner's level; the current unit when none is finished yet. */
export function practiceTopics(course: Course, level: Cefr, done: Set<string>): Topic[] {
  const out: Topic[] = [];
  for (const lv of levelsOf(course)) {
    if (CEFR.indexOf(lv) > CEFR.indexOf(level)) break;
    for (const unit of course.levels[lv]!.units) if (unit.steps.every((s) => done.has(s.id))) out.push({ unit, level: lv });
  }
  const here = course.levels[level];
  return out.length || !here ? out : [{ unit: currentUnit(here, done), level }];
}

/** The topic a spoken reply names: its exact title first, else a sentence containing it. */
export function findTopic(topics: Topic[], said: string) {
  const g = normalize(said);
  return topics.find((t) => normalize(t.unit.title) === g) ?? topics.find((t) => g.includes(normalize(t.unit.title)));
}

// ---- Content: one model call per unit, cached as `practice:<unitId>` ----

const WARMUP: LessonActivity[] = [
  { key: "warmup_blank", type: "fill_blank", count: 2, hints: {} },
  { key: "warmup_choice", type: "multiple_choice", count: 1, hints: {} },
  { key: "warmup_bank", type: "word_bank", count: 1, hints: {} },
];
const COMPREHENSION: LessonActivity[] = [{ key: "comprehension", type: "multiple_choice", count: 2, hints: {} }];

// Field order is the writing order: the questions about the text come after the text.
export const practiceSchema = z.object({
  ...lessonSchema(WARMUP).shape,
  reading_title: z.string(),
  reading_text: z.string(),
  ...lessonSchema(COMPREHENSION).shape,
  discussion: z.array(z.string()).min(1).max(3),
});

export function practicePrompt(unit: string, words: string[], grammar: string[]): string {
  return [
    `Write a practice session for the unit "${unit}". Vocabulary: ${words.join(", ") || "(none)"}. Grammar: ${grammar.join(" | ") || "(none)"}.`,
    "Fields:",
    ...WARMUP.map((a) => `- ${a.key}: ${a.count} × ${a.type}. ${REGISTRY[a.type]!.guide}`),
    "- reading_title, reading_text: a short target-language text (80–120 words) that uses the unit's words and grammar: a small everyday story, message or dialogue.",
    ...COMPREHENSION.map((a) => `- ${a.key}: ${a.count} × multiple_choice about what the reading text says. ${REGISTRY[a.type]!.guide}`),
    `- discussion: 3 open target-language questions linked to the text's topic but about the learner's real life. One asks about their own experience ("Have you ever…?"). No yes/no-only questions.`,
  ].join("\n");
}

export type PracticeSet = { warmup: Item[]; reading: { title: string; text: string }; comprehension: Item[]; discussion: string[] };

export function toPracticeSet(out: Record<string, unknown>): PracticeSet {
  const lists = out as Record<string, unknown[]>;
  return {
    warmup: toItems(WARMUP, lists),
    reading: { title: String(out.reading_title ?? ""), text: String(out.reading_text ?? "") },
    comprehension: toItems(COMPREHENSION, lists),
    discussion: ((out.discussion as string[] | undefined) ?? []).map((q) => q.trim()).filter(Boolean),
  };
}

// ---- Flow ----

export const STAGES = ["topics", "warmup", "reading", "comprehension", "discussion", "done"] as const;
export type Stage = (typeof STAGES)[number];
export type Answered = { correct: boolean; given: string; expected: string };
export type PracticeState = { stage: Stage; set: PracticeSet | null; i: number; score: number; total: number; last: Answered | null };

export const openPractice = (): PracticeState => ({ stage: "topics", set: null, i: 0, score: 0, total: 0, last: null });

const size = (set: PracticeSet | null, stage: Stage) =>
  !set ? 0 : stage === "warmup" ? set.warmup.length : stage === "reading" ? 1
    : stage === "comprehension" ? set.comprehension.length : stage === "discussion" ? set.discussion.length : 0;

/** The first stage from index `from` on that has something in it. */
function enter(st: PracticeState, from: number): PracticeState {
  for (let k = from; k < STAGES.length - 1; k++) if (size(st.set, STAGES[k]) > 0) return { ...st, stage: STAGES[k], i: 0, last: null };
  return { ...st, stage: "done", i: 0, last: null };
}

export const begin = (st: PracticeState, set: PracticeSet) => enter({ ...st, set }, STAGES.indexOf("warmup"));

export function next(st: PracticeState): PracticeState {
  if (st.stage === "topics" || st.stage === "done") return st;
  return st.i + 1 < size(st.set, st.stage) ? { ...st, i: st.i + 1, last: null } : enter(st, STAGES.indexOf(st.stage) + 1);
}

/** The exercise on screen; only the warm-up and reading-question stages have one. */
export function currentItem(st: PracticeState): Item | null {
  if (st.stage === "warmup") return st.set?.warmup[st.i] ?? null;
  if (st.stage === "comprehension") return st.set?.comprehension[st.i] ?? null;
  return null;
}

export const expected = (it: Item) => (it.kind === "choice" ? it.options[it.answer] : it.kind === "bank" ? it.answer.join(" ") : "");

/** Which option an answer means: its text, or its number as shown on screen ("2"). -1 for none. */
function optionIndex(it: Extract<Item, { kind: "choice" }>, given: string) {
  const g = normalize(given), n = Number(g);
  if (g && Number.isInteger(n) && n >= 1 && n <= it.options.length) return n - 1;
  return it.options.findIndex((o) => normalize(o) === g);
}

/** Whether the app can grade this answer: one of a choice's options, or any sentence for word tiles. */
export const accepts = (it: Item, given: string) => (it.kind === "choice" ? optionIndex(it, given) >= 0 : it.kind === "bank" && !!normalize(given));

/** Grades the item on screen once; answers that are not gradable, or come after the first, change nothing. */
export function answer(st: PracticeState, given: string): PracticeState {
  const it = currentItem(st);
  if (!it || st.last || !accepts(it, given)) return st;
  const k = it.kind === "choice" ? optionIndex(it, given) : -1;
  const correct = it.kind === "choice" ? k === it.answer : normalize(given) === normalize(expected(it));
  const last = { correct, given: it.kind === "choice" ? it.options[k] : given.trim(), expected: expected(it) };
  return { ...st, score: st.score + (correct ? 1 : 0), total: st.total + 1, last };
}

// ---- What the tutor is told about the screen ----

const itemText = (it: Item) =>
  it.kind === "choice" ? `${it.prompt}${it.context ? ` ${it.context}` : ""} Options: ${it.options.map((o, k) => `${k + 1}) ${o}`).join("  ")}`
    : it.kind === "bank" ? `${it.prompt} Word tiles: ${it.bank.join(" / ")}` : "";

export function describePractice(st: PracticeState | null, topics: Topic[]): string {
  const list = topics.map((t) => t.unit.title).join(", ");
  if (!st) return `The practice panel is closed. Topics the learner could practise: ${list}.`;
  const set = st.set;
  if (st.stage === "topics" || !set) return `The practice panel is open and lists these topics: ${list}. Ask which one to practise. When the learner names one, put its exact title in \`answer\`.`;
  if (st.stage === "warmup" || st.stage === "comprehension") {
    const it = currentItem(st)!, n = st.stage === "warmup" ? set.warmup.length : set.comprehension.length;
    return [
      `Stage: ${st.stage === "warmup" ? "warm-up" : "questions about the reading"}, exercise ${st.i + 1} of ${n}.`,
      st.stage === "comprehension" ? `The reading text: ${set.reading.text}` : "",
      `On screen: ${itemText(it)}`,
      `Correct answer (never say it before the learner answers): ${expected(it)}`,
      st.last ? `The learner answered "${st.last.given}": ${st.last.correct ? "correct" : "wrong"}.`
        : "The learner has not answered yet. If they say their answer aloud, put it in `answer` (the option's text, or the whole sentence for word tiles) and leave `say` empty: the app checks it and tells you the result.",
    ].filter(Boolean).join("\n");
  }
  if (st.stage === "reading") return `Stage: reading. On screen, the text "${set.reading.title}": ${set.reading.text}\nWhen the learner is ready for the questions, set \`answer\` to "next".`;
  if (st.stage === "discussion") {
    const q = set.discussion, lastQ = st.i === q.length - 1;
    return [
      `Stage: discussion, question ${st.i + 1} of ${q.length}: "${q[st.i]}". All questions on screen: ${q.map((x, k) => `${k + 1}. ${x}`).join(" ")}`,
      `They build on the reading text: ${set.reading.text}`,
      lastQ ? "This is the last question: ask the learner to ask you this question, then answer it from your own experience."
        : "Ask it, react to the learner's answer, share a short story of your own (up to 3 sentences) and ask at most one follow-up.",
      `When this question has been talked through, set \`answer\` to "next".`,
    ].join("\n");
  }
  return "The practice is finished.";
}
```

- [ ] **Step 4: Run the tests and check they pass**

Run: `node --test src/practice.test.ts`
Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/practice.ts src/practice.test.ts
git commit -m "Add the practice-together flow module

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tutor brain: practice actions, events and screen

**Files:**
- Modify: `src/tutor.ts` (actions line 6, events lines 9-15, schemas lines 22-27, `tutorSystem` lines 34-51, `describeEvent` lines 53-62, `tutorPrompt` lines 64-72)
- Test: `src/tutor.test.ts`

**Interfaces:**
- **Produces:**
  - `TUTOR_ACTIONS` adds `"start_practice"` and `"stop_practice"`.
  - `TutorReply` gains `answer: string`.
  - `TutorEvent` adds:
    - `{ kind: "practice_opened" }`
    - `{ kind: "practice_item" }`
    - `{ kind: "practice_answer"; correct: boolean; given: string; expected: string }`
    - `{ kind: "practice_stuck" }`
    - `{ kind: "practice_done"; score: number; total: number }`
  - `tutorPrompt(name, history, notes, e, screen = "")`: a non-empty `screen` is shown under the heading "Practice screen:".

- [ ] **Step 1: Update and add the failing tests** in `src/tutor.test.ts`

1. In the first test's word list (line 11), add `"start_practice", "stop_practice", "never give away"` to the array.
2. Change the loose-reply test's expected object (line 34) to include `answer: ""`:
   ```ts
   assert.deepEqual(looseTutor.parse({ action: "dance", say: "Hi!" }), { action: "speak", say: "Hi!", translation: "", correction: "", notes: "", answer: "" });
   ```
3. In the silence test's helper `r` (line 38), add `answer: ""`:
   ```ts
   const r = (action: TutorReply["action"], say: string): TutorReply => ({ action, say, translation: "", correction: "", notes: "", answer: "" });
   ```
   Search the file for any other `TutorReply` literal (`grep -n "notes: \"\"" src/tutor.test.ts`) and add `answer: ""` to each one as well.
4. Append these tests:

```ts
test("describeEvent covers the practice events", () => {
  assert.match(describeEvent({ kind: "practice_opened" }), /meant to open it.*stop_practice/);
  assert.match(describeEvent({ kind: "practice_item" }), /without giving the answer/);
  assert.match(describeEvent({ kind: "practice_answer", correct: false, given: "likes", expected: "like" }), /"likes".*wrong.*"like".*why it is wrong/);
  assert.match(describeEvent({ kind: "practice_answer", correct: true, given: "like", expected: "like" }), /correct.*why it is right/);
  assert.match(describeEvent({ kind: "practice_stuck" }), /hint.*never say the answer/);
  assert.match(describeEvent({ kind: "practice_done", score: 3, total: 4 }), /3 of 4/);
});

test("prompt shows the practice screen only when there is one", () => {
  assert.ok(tutorPrompt("Mia", [], "", { kind: "practice_item" }, "Stage: reading.").includes("Practice screen:\nStage: reading."));
  assert.ok(!tutorPrompt("Mia", [], "", { kind: "start" }).includes("Practice screen"));
});

test("loose reply keeps a spoken practice answer", () => {
  assert.equal(looseTutor.parse({ action: "speak", say: "", answer: "likes" }).answer, "likes");
  assert.equal(looseTutor.parse({ action: "start_practice", say: "Let's practise!" }).action, "start_practice");
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `node --test src/tutor.test.ts`
Expected: FAIL. The system prompt lacks "start_practice", the parsed reply lacks `answer`, and `describeEvent` returns undefined for practice events.

- [ ] **Step 3: Implement it in `src/tutor.ts`**

Replace line 6:
```ts
export const TUTOR_ACTIONS = ["speak", "wait", "check_in", "end", "start_practice", "stop_practice"] as const;
```

Replace the `TutorEvent` union (lines 9-15):
```ts
export type TutorEvent =
  | { kind: "start" }
  | { kind: "user_said"; text: string }
  | { kind: "user_typed"; text: string }
  | { kind: "silence"; seconds: number }
  | { kind: "mic"; on: boolean }
  | { kind: "cam"; on: boolean }
  // Practice together (spec P): what the screen shows is passed separately, see describePractice in src/practice.ts.
  | { kind: "practice_opened" }
  | { kind: "practice_item" }
  | { kind: "practice_answer"; correct: boolean; given: string; expected: string }
  | { kind: "practice_stuck" }
  | { kind: "practice_done"; score: number; total: number };
```

Replace the two schemas (lines 22-27):
```ts
export const tutorSchema = z.object({ action: z.enum(TUTOR_ACTIONS), say: z.string(), translation: z.string(), correction: z.string(), notes: z.string(), answer: z.string() });
// Small models drop or misspell fields: a broken action means "keep talking", missing text means nothing to show.
export const looseTutor = z.object({
  action: z.enum(TUTOR_ACTIONS).catch("speak"), say: z.string().catch(""), translation: z.string().catch(""),
  correction: z.string().catch(""), notes: z.string().catch(""), answer: z.string().catch(""),
});
```

In `tutorSystem`, make these changes:
- After the `- end:` line, insert:
  ```ts
      "- start_practice: the learner wants to do exercises together; the practice panel opens with a topic list. Ask which topic to practise.",
      "- stop_practice: close the practice panel (e.g. the learner opened it by mistake or wants to stop).",
      "In practice the app shows the exercises and checks the answers; you guide. Read out sentences the learner works with, never give away an answer before they try, and when they are stuck give a hint (a clue, a similar example, a word's meaning) instead of the answer. After a wrong answer say directly why it is wrong, then why the correct one is right.",
  ```
- In the `` `say` `` line, change `1–2 short sentences suited to ${c.level}` to `1–2 short sentences suited to ${c.level} (up to 3 when explaining an exercise or telling a story in practice)`.
- Before `"Respond only with JSON matching the schema."`, insert:
  ```ts
      "`answer`: only when the practice screen notes ask for it (a spoken answer, a topic title, or \"next\"); otherwise \"\".",
  ```

Add these cases to the `describeEvent` switch, after `case "cam"`:
```ts
    case "practice_opened": return "The learner opened the practice panel with its button. If you were not just talking about practising together, ask whether they meant to open it and use stop_practice if it was a mistake; otherwise ask which topic to practise.";
    case "practice_item": return "A new practice step is on the screen. Introduce it briefly and read out any sentence the learner works with, without giving the answer. In the reading stage you have just read the text aloud: ask if the learner understood it and is ready for the questions.";
    case "practice_answer": return e.correct
      ? `The learner answered "${e.given}" on the screen, which is correct. Say briefly why it is right.`
      : `The learner answered "${e.given}" on the screen, which is wrong; the correct answer is "${e.expected}". Say directly why it is wrong, then why the correct answer is right.`;
    case "practice_stuck": return "The learner seems stuck on the current exercise. Give a hint that helps them find it themselves: never say the answer.";
    case "practice_done": return `The practice is over: ${e.score} of ${e.total} answers correct. The panel is closed; give a short, warm evaluation and carry on with the lesson.`;
```

Replace `tutorPrompt` with:
```ts
export function tutorPrompt(name: string, history: TutorMsg[], notes: string, e: TutorEvent, screen = ""): string {
  const lines = history.slice(-HISTORY_IN_PROMPT).map((m) => `${m.from === "tutor" ? name : "Learner"}${m.via === "text" ? " (typed)" : ""}: ${m.text}`);
  return [
    `Your notes: ${notes || "(none yet)"}`,
    `Conversation so far:\n${lines.join("\n") || "(nothing yet)"}`,
    screen ? `Practice screen:\n${screen}` : "",
    `Event: ${describeEvent(e)}`,
    `Choose your action and write ${name}'s turn.`,
  ].filter(Boolean).join("\n\n");
}
```

- [ ] **Step 4: Run all tests and check they pass**

Run: `pnpm test`
Expected: all pass, including `practice.test.ts` from Task 1.

- [ ] **Step 5: Commit**

```bash
git add src/tutor.ts src/tutor.test.ts
git commit -m "Teach the tutor the practice actions, events and screen notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Content loading and the screen argument in `lessons.ts`

**Files:**
- Modify: `src/lessons.ts` (imports at lines 1-8; `tutorTurn` at the end of the file)

**Interfaces:**
- **Consumes:** `practicePrompt`, `practiceSchema`, `toPracticeSet`, `type PracticeSet` from `src/practice.ts`, and the existing `getCached`, `putCached`, `generate`, `systemPrompt`, `unitWords`, `unitGrammar`.
- **Produces:**
  - `loadPractice(enrollmentId: number, c: Base, unit: Unit): Promise<PracticeSet>`. `Base` is `Pick<LessonContext, "course" | "level" | "native">`, already defined in the file.
  - `tutorTurn(c, who, unit, history, notes, event, screen = "")`

This task has no unit test: `lessons.ts` calls the model and the DB and is not run by node. The typecheck in Step 3 is the check.

- [ ] **Step 1: Add the import** after the `./tutor` import line:

```ts
import { practicePrompt, practiceSchema, toPracticeSet, type PracticeSet } from "./practice";
```

- [ ] **Step 2: Replace `tutorTurn` and add `loadPractice`** at the end of the file:

```ts
export function tutorTurn(c: Base, who: CharacterId, unit: Unit, history: TutorMsg[], notes: string, event: TutorEvent, screen = "") {
  const ch = CHARACTERS[who];
  const system = tutorSystem({
    name: ch.name, persona: ch.persona, target: c.course.name, native: langEn(c.native), level: c.level,
    unit: unit.title, words: unitWords(unit), grammar: unitGrammar(unit),
  });
  return generate(tutorSchema, system, tutorPrompt(ch.name, history, notes, event, screen), undefined, looseTutor);
}

// ---- Practice together (spec P): one call per unit, cached ----

export async function loadPractice(enrollmentId: number, c: Base, unit: Unit): Promise<PracticeSet> {
  const key = `practice:${unit.id}`;
  const cached = await getCached<PracticeSet>(enrollmentId, key);
  if (cached) return cached;
  const out = await generate(practiceSchema, systemPrompt(c), practicePrompt(unit.title, unitWords(unit), unitGrammar(unit)));
  const set = toPracticeSet(out as Record<string, unknown>);
  if (!set.warmup.length && !set.comprehension.length && !set.discussion.length) throw new Error("The model returned no usable exercises.");
  await putCached(enrollmentId, key, set);
  return set;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. `TutorCall.tsx` still calls `tutorTurn` with 6 arguments; that works because `screen` defaults to `""`.

- [ ] **Step 4: Commit**

```bash
git add src/lessons.ts
git commit -m "Load practice content per unit and pass the practice screen to the tutor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Practice panel, styles and strings

**Files:**
- Create: `src/PracticePanel.tsx`
- Modify: `src/styles.css` (append after line 469, the `.call-grid` media rule)
- Modify: `src/locales/en.json`, `tr.json`, `de.json`, `fr.json`, `es.json` (the `tutor` object)

**Interfaces:**
- **Consumes:** `currentItem`, `type Answered`, `type PracticeState`, `type Topic` from `src/practice.ts`, and `type Item` from `src/activities.ts`.
- **Produces:** `PracticePanel(props: { pr: PracticeState; topics: Topic[]; loading: boolean; error: string; lang: string; onTopic(t: Topic): void; onAnswer(given: string): void; onNext(): void; onHint(): void; onRetry(): void; onClose(): void })`, which renders `<section className="call-practice">`.

- [ ] **Step 1: Add the strings**

Run this script from the repo root. The locale files are exactly `JSON.stringify(x, null, 2) + "\n"`, so rewriting them only adds lines.

```bash
node -e '
const fs = require("fs");
const add = {
  en: { practice: "Practice together", practiceClose: "Close practice", hint: "Hint", check: "Check", next: "Next", retry: "Try again", preparing: "Preparing the exercises…", practiceFailed: "The exercises could not be prepared.", stage: { topics: "Pick a topic", warmup: "Warm-up", reading: "Reading", comprehension: "Questions", discussion: "Discussion" } },
  tr: { practice: "Birlikte pratik", practiceClose: "Pratiği kapat", hint: "İpucu", check: "Kontrol et", next: "Devam", retry: "Tekrar dene", preparing: "Alıştırmalar hazırlanıyor…", practiceFailed: "Alıştırmalar hazırlanamadı.", stage: { topics: "Bir konu seç", warmup: "Isınma", reading: "Okuma", comprehension: "Sorular", discussion: "Tartışma" } },
  de: { practice: "Gemeinsam üben", practiceClose: "Übung schließen", hint: "Tipp", check: "Prüfen", next: "Weiter", retry: "Nochmal versuchen", preparing: "Übungen werden vorbereitet…", practiceFailed: "Die Übungen konnten nicht vorbereitet werden.", stage: { topics: "Wähle ein Thema", warmup: "Aufwärmen", reading: "Lesen", comprehension: "Fragen", discussion: "Diskussion" } },
  fr: { practice: "Pratiquer ensemble", practiceClose: "Fermer la pratique", hint: "Indice", check: "Vérifier", next: "Suivant", retry: "Réessayer", preparing: "Préparation des exercices…", practiceFailed: "Les exercices n’ont pas pu être préparés.", stage: { topics: "Choisis un sujet", warmup: "Échauffement", reading: "Lecture", comprehension: "Questions", discussion: "Discussion" } },
  es: { practice: "Practicar juntos", practiceClose: "Cerrar práctica", hint: "Pista", check: "Comprobar", next: "Siguiente", retry: "Reintentar", preparing: "Preparando los ejercicios…", practiceFailed: "No se pudieron preparar los ejercicios.", stage: { topics: "Elige un tema", warmup: "Calentamiento", reading: "Lectura", comprehension: "Preguntas", discussion: "Debate" } },
};
for (const [l, keys] of Object.entries(add)) {
  const p = `src/locales/${l}.json`, j = JSON.parse(fs.readFileSync(p, "utf8"));
  Object.assign(j.tutor, keys);
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
}'
git diff --stat src/locales
```
Expected: each of the 5 files shows only insertions (about 13 lines each).

- [ ] **Step 2: Create `src/PracticePanel.tsx`**

```tsx
// Practice together panel (spec P): topics, warm-up and reading questions, the reading text, discussion questions.
// It only shows the state and reports clicks; the flow and grading live in src/practice.ts, the tutor in TutorCall.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "./icons";
import type { Item } from "./activities";
import { currentItem, type Answered, type PracticeState, type Topic } from "./practice";

type Props = {
  pr: PracticeState; topics: Topic[]; loading: boolean; error: string; lang: string;
  onTopic: (t: Topic) => void; onAnswer: (given: string) => void; onNext: () => void; onHint: () => void; onRetry: () => void; onClose: () => void;
};

export function PracticePanel(p: Props) {
  const { t } = useTranslation();
  const { pr } = p;
  const it = currentItem(pr);
  let body: React.ReactNode = null;
  if (p.error) body = (
    <div className="practice-center">
      <p>{t("tutor.practiceFailed")}</p>
      <button className="btn btn-primary" onClick={p.onRetry}>{t("tutor.retry")}</button>
    </div>
  );
  else if (p.loading) body = <div className="practice-center"><p className="muted">{t("tutor.preparing")}</p></div>;
  else if (pr.stage === "topics") body = (
    <div className="opt-grid">
      {p.topics.map((tp) => (
        <button key={tp.unit.id} className="opt" onClick={() => p.onTopic(tp)}><span className="opt-num">{tp.level}</span><span>{tp.unit.title}</span></button>
      ))}
    </div>
  );
  else if (pr.stage === "reading" && pr.set) body = <>
    <article className="card practice-text" lang={p.lang}><h3>{pr.set.reading.title}</h3><p>{pr.set.reading.text}</p></article>
    <div className="practice-actions"><button className="btn btn-primary" onClick={p.onNext}>{t("tutor.next")}</button></div>
  </>;
  else if (pr.stage === "discussion" && pr.set) body = <>
    <ol className="practice-questions" lang={p.lang}>
      {pr.set.discussion.map((q, k) => <li key={k} className={k === pr.i ? "on" : k < pr.i ? "past" : ""} aria-current={k === pr.i ? "step" : undefined}>{q}</li>)}
    </ol>
    <div className="practice-actions"><button className="btn btn-primary" onClick={p.onNext}>{t("tutor.next")}</button></div>
  </>;
  else if (it) body = <Exercise key={`${pr.stage}${pr.i}`} it={it} last={pr.last} lang={p.lang} onAnswer={p.onAnswer} onHint={p.onHint} />;
  return (
    <section className="call-practice" aria-label={t("tutor.practice")}>
      <header className="practice-head">
        {pr.stage !== "done" && <b>{t(`tutor.stage.${pr.stage}`)}</b>}
        <button className="call-btn" onClick={p.onClose} aria-label={t("tutor.practiceClose")} title={t("tutor.practiceClose")}><Icon name="x" /></button>
      </header>
      <div className="practice-body">{body}</div>
    </section>
  );
}

/** One exercise, answered once: a choice answers on click, word tiles on "Check". */
function Exercise({ it, last, lang, onAnswer, onHint }: { it: Item; last: Answered | null; lang: string; onAnswer: (g: string) => void; onHint: () => void }) {
  const { t } = useTranslation();
  const [sel, setSel] = useState<number[]>([]);
  const hint = !last && <button className="btn" onClick={onHint}>{t("tutor.hint")}</button>;
  if (it.kind === "choice") return <>
    <h2 className="ex-title">{it.prompt}</h2>
    {it.context && <div className="card" lang={lang} style={{ whiteSpace: "pre-wrap", fontWeight: 700, fontSize: 18 }}>{it.context}</div>}
    <div className="opt-grid">
      {it.options.map((o, oi) => {
        const state = last ? (oi === it.answer ? "correct" : o === last.given ? "wrong" : "") : "";
        return <button key={oi} className={`opt ${state}`} disabled={!!last} lang={lang} onClick={() => onAnswer(o)}><span className="opt-num">{oi + 1}</span><span>{o}</span></button>;
      })}
    </div>
    <div className="practice-actions">{hint}</div>
  </>;
  if (it.kind === "bank") return <>
    <h2 className="ex-title">{it.prompt}</h2>
    <div className="bank-area" lang={lang}>
      {sel.map((j) => <button className="tok" key={j} disabled={!!last} onClick={() => setSel(sel.filter((x) => x !== j))}>{it.bank[j]}</button>)}
    </div>
    <div className="bank" lang={lang}>
      {it.bank.map((w, j) => <button key={j} className={`tok ${sel.includes(j) ? "used" : ""}`} disabled={!!last || sel.includes(j)} onClick={() => setSel([...sel, j])}>{w}</button>)}
    </div>
    {last && <p className={`practice-fb ${last.correct ? "ok" : "bad"}`} lang={lang}>{last.expected}</p>}
    <div className="practice-actions">
      {hint}
      <button className="btn btn-primary" disabled={!!last || !sel.length} onClick={() => onAnswer(sel.map((j) => it.bank[j]).join(" "))}>{t("tutor.check")}</button>
    </div>
  </>;
  return null;
}
```

- [ ] **Step 3: Append the styles** to `src/styles.css`, directly after the line `@media (max-width:768px){.call-grid{grid-template-columns:1fr;grid-template-rows:1fr 1fr}}`:

```css
/* Practice together (spec P): the panel on the left with tutor and learner stacked right; on phones the panel on top, the two side by side below */
.call-grid.practice-open{grid-template-columns:2fr 1fr;grid-template-rows:1fr 1fr}
.call-grid.practice-open .call-practice{grid-row:1 / 3}
.call-practice{display:flex;flex-direction:column;min-height:0;border-radius:var(--r);background:var(--surface);overflow:hidden}
.practice-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 12px 0 20px}
.practice-head .call-btn{width:40px;height:40px;margin-left:auto;background:var(--bg)}
.practice-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:16px;padding:16px 20px 20px}
.practice-center{margin:auto;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
.practice-text h3{margin:0 0 8px}
.practice-text p{margin:0;font-size:18px;line-height:1.6;white-space:pre-wrap}
.practice-questions{margin:0;padding-left:24px;display:flex;flex-direction:column;gap:14px;font-size:18px;font-weight:700}
.practice-questions .past{opacity:.5}
.practice-questions .on{color:var(--blue)}
.practice-fb{margin:0;font-weight:800}
.practice-fb.ok{color:var(--green)}
.practice-fb.bad{color:var(--red)}
.practice-actions{display:flex;gap:12px;justify-content:flex-end}
@media (max-width:768px){
  .call-grid.practice-open{grid-template-columns:1fr 1fr;grid-template-rows:1fr 40vh}
  .call-grid.practice-open .call-practice{grid-row:auto;grid-column:1 / 3}
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: all tests pass (including `locales.test.ts`), with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/PracticePanel.tsx src/styles.css src/locales
git commit -m "Add the practice-together panel, its layout and strings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Wire practice into the tutor call

**Files:**
- Modify: `src/TutorCall.tsx`

**Interfaces:**
- **Consumes:**
  - From Task 1: `practiceTopics`, `openPractice`, `begin`, `next`, `answer`, `currentItem`, `describePractice`, `findTopic`, `PRACTICE_XP`, `PracticeState`, `Topic`
  - From Task 3: `loadPractice`, and `tutorTurn(..., screen)`
  - From Task 4: `PracticePanel`
  - `db.addMistake(enrollmentId, item)` from `src/db.ts:164`
- **Behaviour this task must produce:**
  - A bar button opens and closes the panel. Opening it with the button sends `practice_opened`.
  - The tutor's `start_practice` / `stop_practice` actions open and close the panel.
  - Picking a topic, by click or by the tutor's `answer`, loads the content and sends `practice_item`.
  - A click or a spoken `answer` grades the exercise and sends `practice_answer`. After the tutor has spoken its reply, the flow moves on automatically.
  - "Next" (button, or `answer: "next"`) moves on in the reading and discussion stages.
  - Entering the reading stage reads the text aloud in the tutor's voice.
  - Silence on an unanswered exercise sends `practice_stuck` instead of `silence`.
  - Practice events that arrive while the tutor is busy wait (the latest one wins) instead of being dropped.
  - Each correct answer adds `PRACTICE_XP` to the call's XP; wrong answers go to `mistakes`.

- [ ] **Step 1: Update the imports**

- Change `import { useEffect, useRef, useState } from "react";` to `import { useEffect, useMemo, useRef, useState } from "react";`.
- Change `import { tutorTurn } from "./lessons";` to `import { loadPractice, tutorTurn } from "./lessons";`.
- Add:

```ts
import * as db from "./db";
import { PracticePanel } from "./PracticePanel";
import { PRACTICE_XP, answer, begin, currentItem, describePractice, findTopic, next, openPractice, practiceTopics, type PracticeState, type Topic } from "./practice";
```

- [ ] **Step 2: Extend the `Call` ref type and its initial value**

Add a line to the `Call` type:
```ts
  pr: PracticeState | null; pending: TutorEvent | null; pxp: number; // practice panel state; a practice event waiting for the tutor; practice XP
```
In the `useRef<Call>({...})` initial object, add `pr: null, pending: null, pxp: 0`.

- [ ] **Step 3: Add practice state** directly after `const { quit, askQuit } = useQuit(!result);`:

```ts
  const topics = useMemo(() => (course && enrollment ? practiceTopics(course, enrollment.level, done) : []), [course, enrollment, done]);
  const [pr, setPr] = useState<PracticeState | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [prErr, setPrErr] = useState("");
  const prTopic = useRef<Topic | null>(null); // the topic being loaded or shown
  const setPractice = (p: PracticeState | null) => { c.pr = p; setPr(p); };
```

- [ ] **Step 4: Replace `armSilence`** so an unanswered exercise gets a hint instead of a check-in:

```ts
  const armSilence = () => {
    clearSilence();
    const sec = c.micOn && !c.over && !c.failed ? silenceDelay(c.last, c.nudges) : null;
    if (sec) silence.current = setTimeout(() => {
      c.nudges++;
      const stuck = !!c.pr && !!currentItem(c.pr) && !c.pr.last;
      fire(stuck ? { kind: "practice_stuck" } : { kind: "silence", seconds: sec });
    }, sec * 1000);
  };
```

- [ ] **Step 5: Replace `step`, `run` and `fire`**

```ts
  /** One event → one reply, spoken. False when the model call failed. */
  const step = async (e: TutorEvent) => {
    if (!course || !enrollment || !profile || !unit) return false;
    if (e.kind.startsWith("practice_") && e.kind !== "practice_done" && !c.pr) return true; // the panel was closed meanwhile
    if (e.kind === "practice_item" && c.pr?.stage === "reading" && c.pr.set) await voice(c.pr.set.reading.text);
    setThinking(true); setErr("");
    try {
      const r = await tutorTurn({ course, level: enrollment.level, native: profile.native_lang }, who, unit, c.hist, c.notes, e, describePractice(c.pr, topics));
      if (c.over) return true;
      c.notes = r.notes.slice(0, NOTES_MAX); c.last = r; c.failed = null;
      if (r.correction.trim()) c.fixes.push(r.correction.trim());
      if (r.say.trim()) push({ from: "tutor", text: r.say.trim(), via: "voice" });
      setLast(r); setShowTr(false); setThinking(false);
      if (r.action === "start_practice") practiceOpen(false);
      if (r.action === "stop_practice") practiceClose();
      if (c.pr && r.answer.trim()) answerField(r.answer.trim());
      await voice(r.say);
      if (e.kind === "practice_answer") advance(); // the tutor has explained the answer: on to the next exercise
      if (r.action === "end") finish();
      return true;
    } catch (x) {
      c.failed = e; setErr((x as Error).message); setThinking(false);
      return false;
    }
  };

  /** Runs events one at a time; a waiting practice event goes first, learner input that arrived meanwhile is merged into one event. */
  const run = async (first: TutorEvent) => {
    c.running = true; clearSilence();
    let e: TutorEvent | null = first;
    while (e && !c.over && (await step(e))) { e = c.pending ?? mergeInput(c.queue.splice(0)); c.pending = null; }
    c.running = false;
    armSilence();
  };
  const fire = (e: TutorEvent) => {
    if (c.over) return;
    if (!c.running) return void run(e);
    if (e.kind === "user_said" || e.kind === "user_typed") c.queue.push(e);
    else if (e.kind.startsWith("practice_")) c.pending = e; // ponytail: only the latest practice event waits; the screen already shows the rest
    // silence and toggles while busy are dropped
  };
```

- [ ] **Step 6: Add the practice handlers** directly after `const retry = ...`:

```ts
  const practiceOpen = (byButton: boolean) => {
    if (c.pr) return;
    setPrErr(""); prTopic.current = null; setPractice(openPractice());
    if (byButton) fire({ kind: "practice_opened" });
  };
  const practiceClose = () => { setPractice(null); setPrLoading(false); setPrErr(""); prTopic.current = null; };
  const chooseTopic = async (tp: Topic) => {
    if (!course || !enrollment || !profile || c.pr?.stage !== "topics" || prTopic.current) return;
    prTopic.current = tp; setPrLoading(true); setPrErr("");
    try {
      const set = await loadPractice(enrollment.id, { course, level: tp.level, native: profile.native_lang }, tp.unit);
      if (c.over || c.pr?.stage !== "topics" || prTopic.current !== tp) return;
      setPractice(begin(c.pr, set));
      fire({ kind: "practice_item" });
    } catch (x) { if (prTopic.current === tp) setPrErr((x as Error).message); }
    finally { if (prTopic.current === tp) setPrLoading(false); }
  };
  const retryTopic = () => { const tp = prTopic.current; prTopic.current = null; if (tp) void chooseTopic(tp); };
  /** A click or a spoken answer on the exercise on screen; answers that match no option are ignored. */
  const submit = (given: string) => {
    const st = c.pr, it = st && currentItem(st);
    if (!st || !it) return;
    const after = answer(st, given);
    if (!after.last || after === st) return;
    setPractice(after); c.nudges = 0;
    if (after.last.correct) c.pxp += PRACTICE_XP;
    else if (enrollment) void db.addMistake(enrollment.id, it);
    sfx(after.last.correct ? "ok" : "bad");
    fire({ kind: "practice_answer", ...after.last });
  };
  const advance = () => {
    if (!c.pr) return;
    const n = next(c.pr);
    if (n.stage === "done") { practiceClose(); return fire({ kind: "practice_done", score: n.score, total: n.total }); }
    setPractice(n); fire({ kind: "practice_item" });
  };
  /** The tutor's `answer` field: a topic title, "next", or the learner's spoken answer. */
  const answerField = (a: string) => {
    const st = c.pr!;
    if (st.stage === "topics") { const tp = findTopic(topics, a); if (tp) void chooseTopic(tp); }
    else if (a.toLowerCase() === "next") { if (st.stage === "reading" || st.stage === "discussion") advance(); }
    else submit(a);
  };
```

- [ ] **Step 7: Count practice XP** in `finish()`. Change the `xp` line to:

```ts
    const xp = (mine * 5 + clean * 5 + c.pxp + (Date.now() - started.current >= BONUS_MS ? 20 : 0)) * xpMult(s);
```

- [ ] **Step 8: Render the panel and the bar button**

Change `<div className="call-grid">` to `<div className={`call-grid${pr ? " practice-open" : ""}`}>` and add as its first child:

```tsx
        {pr && <PracticePanel pr={pr} topics={topics} loading={prLoading} error={prErr} lang={lang}
          onTopic={(tp) => void chooseTopic(tp)} onAnswer={submit} onNext={advance} onHint={() => fire({ kind: "practice_stuck" })}
          onRetry={retryTopic} onClose={practiceClose} />}
```

Next to the other label constants (`const micLabel = ...`), add:
```ts
  const prLabel = t(pr ? "tutor.practiceClose" : "tutor.practice");
```
In `.call-bar`, insert this between the captions button and the mic button:
```tsx
        <button className={`call-btn${pr ? " on" : ""}`} onClick={() => (pr ? practiceClose() : practiceOpen(true))} aria-pressed={!!pr} aria-label={prLabel} title={prLabel}><Icon name="book" /></button>
```

- [ ] **Step 9: Typecheck and test**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: all pass, no type errors. If tsc reports that `answerField`, `practiceOpen` or `advance` is used before it is declared: these are `const` arrow functions, called only at runtime after the component body has run, so TypeScript accepts them. Only move them above `step` if tsc actually complains.

- [ ] **Step 10: Commit**

```bash
git add src/TutorCall.tsx
git commit -m "Open practice-together inside the tutor call

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Check it in the browser

**Files:** no new files. Fix any bug you find in the file it comes from, then commit.

- [ ] **Step 1: Start the preview** with the `preview_start` tool, `{ name: "web" }` (`pnpm dev`, port 1420). An AI provider must be configured in Settings. The browser preview keeps keys in localStorage; if none is set, ask the user.
- [ ] **Step 2: Open a call.** Go to Practice → "Lesson with a tutor" → pick a tutor. Wait for the greeting.
- [ ] **Step 3: Button opening.** Click the book button in the bar. The panel opens on the left with the topic list, and the tutor asks whether it was opened by mistake. Type "yes, sorry" in the message drawer. The tutor replies with `stop_practice` and the panel closes.
- [ ] **Step 4: Tutor opening.** Type "let's do some exercises together". The panel opens through `start_practice` and the tutor asks which topic.
- [ ] **Step 5: Topic by text.** Type a topic title from the list. The panel shows "Preparing the exercises…", then the first warm-up exercise, and the tutor introduces it.
- [ ] **Step 6: Wrong answer.** Click a wrong option. It turns red, the correct one turns green, and the tutor explains both. The panel then moves to the next exercise without a click.
- [ ] **Step 7: Hint.** Click "Hint". The tutor gives a clue without saying the answer.
- [ ] **Step 8: Reading.** Finish the warm-up. The reading text appears and is read aloud; then click "Next" and answer the reading questions.
- [ ] **Step 9: Discussion.** Only the questions are shown and the active one is highlighted. Type answers; the tutor reacts and tells a short story. On the last question the tutor asks you to ask it. "Next" after the last question closes the panel, and the tutor gives a score summary.
- [ ] **Step 10: Layout and console.**
  - Desktop: the panel takes the left 2/3, tutor and learner are stacked on the right.
  - `resize_window` preset `mobile`: the panel is on top, tutor and learner are side by side below, with no horizontal scroll.
  - Take a screenshot of each layout.
  - `read_console_messages` with `onlyErrors: true` shows nothing new.
  - Reset with preset `desktop`.
- [ ] **Step 11: End the call.** The summary XP includes the practice answers.
- [ ] **Step 12: Commit any fixes** (one commit per fix, plain-sentence subject, with the Co-Authored-By line). Voice answers ("I think it's number two") need the real mic in `pnpm tauri dev`; note this as pending for the user, as the tutor-call v1 did.
