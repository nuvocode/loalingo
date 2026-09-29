// Lesson generation (DECISIONS C2, C3): cache → one call for the whole step → per-activity fallback.
import { z } from "zod";
import { generate, generatePlain } from "./ai";
import { getCached, listMistakes, putCached } from "./db";
import { REGISTRY, langEn, lessonPrompt, mistakeLine, lessonSchema, plannedActivities, shuffleAnswer, systemPrompt, toItems, type Item, type LessonContext } from "./activities";
import { CEFR, levelsOf, type Course, type CourseLevel, type Cefr } from "./course";

/** `A1:checkpoint` (path node) and `A1:test` (skip-level test) share one flow (DECISIONS B8). */
export const examLevel = (id: string) => /^([ABC][12]):(checkpoint|test)$/.exec(id)?.[1] as Cefr | undefined;

/** `legend:<step>`: a finished step replayed without teaching cards, written one CEFR level harder (PLAN §3.3). */
export const legendStep = (id: string) => id.startsWith("legend:") ? id.slice(7) : undefined;
export const LEGEND_PASS = 80; // % needed to turn the step gold
export const LEGEND_PRICE = 100; // gems per attempt, or one shop ticket

/** Finds a step and its surroundings in the course tree; exams get a synthetic step covering the whole level. */
export function stepContext(course: Course, stepId: string, native: string): LessonContext | null {
  const legend = legendStep(stepId);
  if (legend) {
    const c = stepContext(course, legend, native);
    if (!c) return null;
    const acts = c.step.activities.filter((a) => a.type !== "learn");
    return {
      ...c, level: CEFR[Math.min(CEFR.indexOf(c.level) + 1, CEFR.length - 1)], // ponytail: C2 stays C2
      step: { ...c.step, id: stepId, activities: acts.length ? acts : c.step.activities,
        description: `${c.step.description ?? ""} Mastery challenge: harder sentences and less obvious distractors than a normal lesson.`.trim() },
    };
  }
  const exam = examLevel(stepId);
  if (exam) {
    const levelDef = course.levels[exam];
    if (!levelDef?.checkpoint) return null;
    const steps = levelDef.units.flatMap((u) => u.steps);
    return {
      course, level: exam, levelDef, unitTitle: levelDef.title, native,
      step: {
        id: stepId, title: levelDef.checkpoint.title,
        description: `Level test covering all of ${exam}: mix topics from every unit, do not focus on one.`,
        vocabulary: [...new Set(steps.flatMap((s) => s.vocabulary))],
        grammar: [...new Map(steps.flatMap((s) => s.grammar).map((g) => [g.pattern, g])).values()],
        activities: levelDef.checkpoint.activities,
      },
    };
  }
  for (const level of levelsOf(course)) {
    const levelDef = course.levels[level]!;
    for (const u of levelDef.units) {
      const step = u.steps.find((s) => s.id === stepId);
      if (step) return { course, level, levelDef, unitTitle: u.title, step, native };
    }
  }
  return null;
}

export const MISTAKES_IN_PROMPT = 8; // ponytail: most recent only, rank by frequency if prompts need sharper focus

async function generateItems(c: LessonContext, mistakes: string[]): Promise<Item[]> {
  const acts = plannedActivities(c.step.activities);
  if (!acts.length) throw new Error("This step has no activities that can be generated yet.");
  const system = systemPrompt(c);
  try {
    const items = toItems(acts, await generate(lessonSchema(acts), system, lessonPrompt(c, acts, mistakes)) as Record<string, unknown[]>);
    if (items.length) return items;
  } catch (e) { console.warn("Whole-lesson generation failed, falling back to per-activity calls", e); }
  // Fallback for small local models that struggle with the full schema.
  const items: Item[] = [];
  let lastError: unknown;
  for (const a of acts) {
    try {
      const out = await generate(z.object({ items: z.array(REGISTRY[a.type]!.schema).min(1).max(a.count) }), system, lessonPrompt(c, [{ ...a, key: "items" }], mistakes));
      items.push(...toItems([{ ...a, key: "items" }], out as Record<string, unknown[]>));
    } catch (e) { lastError = e; }
  }
  if (!items.length) throw lastError ?? new Error("The model returned no usable exercises.");
  return items;
}

const inflight = new Map<string, Promise<Item[]>>();
/** Cached lesson for (enrollment, step); `fresh` regenerates it ("Yeniden üret"). */
export function loadLesson(enrollmentId: number, c: LessonContext, fresh = false): Promise<Item[]> {
  const k = `${enrollmentId}:${c.step.id}`;
  if (!fresh && inflight.has(k)) return inflight.get(k)!;
  const p = (async () => {
    const cached = fresh ? null : await getCached<Item[]>(enrollmentId, c.step.id);
    if (cached) return cached;
    const mistakes = (await listMistakes<Item>(enrollmentId, MISTAKES_IN_PROMPT)).map((m) => mistakeLine(m.item)).filter((x): x is string => !!x);
    const items = await generateItems(c, mistakes);
    await putCached(enrollmentId, c.step.id, items);
    return items;
  })().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/** Background prefetch of the step after `stepId` in the same level (C3). Errors are ignored. */
export function prefetchNext(enrollmentId: number, course: Course, level: Cefr, stepId: string, native: string) {
  const steps = course.levels[level]!.units.flatMap((u) => u.steps);
  const next = steps[steps.findIndex((s) => s.id === stepId) + 1];
  const c = next && stepContext(course, next.id, native);
  if (c) loadLesson(enrollmentId, c).catch(() => {});
}

// ---- Answer judging (C4) and explanations (C5) ----

export async function judge(c: LessonContext, question: string, expected: string, given: string) {
  // ponytail: one retry covers the occasional malformed JSON; the caller reports a second failure
  const run = () => generate(
    z.object({ feedback: z.string(), correct: z.boolean() }), // feedback first: the model reasons before it decides
    systemPrompt(c),
    `Exercise: ${question}\nExpected answer: ${expected}\nLearner's answer: ${given}\n` +
      "Mark it correct if it conveys the same meaning and is grammatical — other wording, word order, synonyms or contractions are fine; " +
      "the expected answer is only one example. British and American usage are both correct. " +
      "Capitalization and punctuation (including a missing final period) never make an answer wrong; accept a single-letter typo but mention it. " +
      "`feedback`: one short sentence.",
  );
  return run().catch(run);
}

/** F: the learner disputes a `judge()` verdict; a second look that is fair but not a pushover. */
export async function appeal(c: LessonContext, question: string, expected: string, given: string, reason: string) {
  const run = () => generate(
    z.object({ reason: z.string(), accepted: z.boolean() }), // reason first, like judge: the model reasons before it decides
    systemPrompt(c),
    `Exercise: ${question}\nExpected answer: ${expected}\nLearner's answer: ${given}\nThe answer was marked wrong. The learner appeals: ${reason}\n` +
      "Be fair but not a pushover: accept only if the learner's answer is genuinely correct or acceptable for this exercise " +
      "(same meaning, grammatical, natural); reject if it is wrong, off-topic, or the argument is merely persuasive. " +
      `\`reason\`: one sentence in ${langEn(c.native)} explaining the decision.`,
  );
  return run().catch(run);
}

export function explain(c: LessonContext, question: string, correct: string, given: string) {
  return generatePlain(systemPrompt(c).replace("Respond only with JSON matching the schema.", ""),
    `Exercise: ${question}\nCorrect answer: ${correct}\nLearner answered: ${given || "(skipped)"}\nExplain in at most 3 short sentences why the correct answer is right${given ? " and what was wrong with the learner's answer" : ""}. Plain text, no markdown.`);
}

// ---- Stories (one per unit) and roleplay chat (Faz 4) ----

type Base = Pick<LessonContext, "course" | "level" | "native">;
type Unit = CourseLevel["units"][number];

const storySchema = z.object({
  title: z.string(),
  lines: z.array(z.object({ speaker: z.string(), text: z.string(), translation: z.string() })).min(6).max(14),
  questions: z.array(z.object({ after_line: z.int(), prompt: z.string(), options: z.array(z.string()).min(3).max(4), answer: z.int() })).min(1).max(3),
});
export type Story = z.infer<typeof storySchema>;

/** Cached per (enrollment, unit) like lessons; `fresh` regenerates. */
export async function loadStory(enrollmentId: number, c: Base, unit: Unit, fresh = false): Promise<Story> {
  const key = `story:${unit.id}`;
  const cached = fresh ? null : await getCached<Story>(enrollmentId, key);
  if (cached) return cached;
  const steps = unit.steps;
  const g = await generate(storySchema, systemPrompt(c), [
    `Write a short story told as a dialogue between 2–3 named characters, on the theme of the unit "${unit.title}"${unit.description ? ` (${unit.description})` : ""}.`,
    `Use vocabulary from: ${[...new Set(steps.flatMap((s) => s.vocabulary))].join(", ")}`,
    `Grammar: ${[...new Set(steps.flatMap((s) => s.grammar.map((x) => x.pattern)))].join(" | ")}`,
    "`title` and every line's `text` are in the target language; `translation` is the line in the learner's language. 8–12 lines with a small plot.",
    "`questions`: 2–3 comprehension questions (prompt in the learner's language, options in the target language), exactly one correct, `answer` is its 0-based index. " +
      "`after_line` is the 0-based index of the line after which it is asked; the question must be answerable from the lines up to there.",
  ].join("\n"));
  const last = g.lines.length - 1;
  const story: Story = {
    ...g,
    questions: g.questions.filter((q) => q.options[q.answer] !== undefined)
      .map((q) => ({ ...q, after_line: Math.min(Math.max(q.after_line, 0), last), ...shuffleAnswer(q.options, q.answer) })),
  };
  await putCached(enrollmentId, key, story);
  return story;
}

// Roleplay characters from the design; the scenario is described in English for the model, the UI text comes from i18n.
export const CHARACTERS = {
  lily: { name: "Lily", color: "#b07cf0", role: "a hotel receptionist", goal: "check in and ask for a room" },
  kai: { name: "Kai", color: "#4c6ef5", role: "a restaurant chef", goal: "ask the chef for a recommendation and order" },
} as const;
export type CharacterId = keyof typeof CHARACTERS;
export type ChatMsg = { from: "ai" | "me"; text: string; translation?: string; correction?: string };

const turnSchema = z.object({ correction: z.string(), reply: z.string(), translation: z.string(), goal_reached: z.boolean() });

/** The character's next turn; also corrects the learner's last message. Empty history = opening line. */
export function chatTurn(c: Base, who: CharacterId, history: ChatMsg[]) {
  const ch = CHARACTERS[who], native = langEn(c.native);
  const system = [
    `You are ${ch.name}, ${ch.role}, in a roleplay inside a language-learning app. The learner is a native ${native} speaker learning ${c.course.name} at CEFR level ${c.level}. The learner's goal: ${ch.goal}.`,
    `Stay in character. \`reply\`: ${c.course.name} only, 1–2 short sentences suited to ${c.level}, moving the scene toward the goal. \`translation\`: the reply in ${native}.`,
    `\`correction\`: if the learner's last message has a mistake, the corrected sentence and a very short explanation in ${native}; otherwise "". Ignore capitalization and punctuation.`,
    "`goal_reached`: true once the learner has achieved the goal; then wrap up the scene politely in `reply`.",
    "Respond only with JSON matching the schema.",
  ].join("\n");
  const last = history[history.length - 1];
  const prompt = last
    ? `Conversation so far:\n${history.map((m) => `${m.from === "ai" ? ch.name : "Learner"}: ${m.text}`).join("\n")}\n\n` +
      `Check only this last learner message for \`correction\` (earlier ones were already corrected): "${last.text}"\nThen write ${ch.name}'s next turn.`
    : "Open the scene with a short greeting that invites the learner to start.";
  return generate(turnSchema, system, prompt);
}

// ---- Guidebook (DECISIONS B8): the unit's vocabulary and grammar, explained once and cached ----

const guideSchema = z.object({
  vocabulary: z.array(z.object({ word: z.string(), translation: z.string(), example: z.string(), example_translation: z.string() })),
  grammar: z.array(z.object({ pattern: z.string(), explanation: z.string(), example: z.string() })),
});
export type Guide = z.infer<typeof guideSchema>;
export const unitWords = (u: Unit) => [...new Set(u.steps.flatMap((s) => s.vocabulary))];
export const unitGrammar = (u: Unit) => [...new Set(u.steps.flatMap((s) => s.grammar.map((g) => g.pattern)))];

export async function loadGuide(enrollmentId: number, c: Base, unit: Unit): Promise<Guide> {
  const key = `guide:${unit.id}`;
  const cached = await getCached<Guide>(enrollmentId, key);
  if (cached) return cached;
  const g = await generate(guideSchema, systemPrompt(c), [
    `Write a study guide for the unit "${unit.title}".`,
    `vocabulary: one entry per word, in this order: ${unitWords(unit).join(", ")}. \`translation\` in the learner's language; \`example\` a short ${c.level} sentence using it, with \`example_translation\`.`,
    `grammar: one entry per pattern, in this order: ${unitGrammar(unit).join(" | ")}. \`explanation\`: 1–2 plain sentences in the learner's language; \`example\`: one target-language sentence.`,
  ].join("\n"));
  await putCached(enrollmentId, key, g);
  return g;
}
