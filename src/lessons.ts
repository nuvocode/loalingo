// Lesson generation (DECISIONS C2, C3): cache → one call for the whole step → per-activity fallback.
import { z } from "zod";
import { generate, generatePlain } from "./ai";
import { getCached, putCached } from "./db";
import { REGISTRY, lessonPrompt, lessonSchema, plannedActivities, systemPrompt, toItems, type Item, type LessonContext } from "./activities";
import { levelsOf, type Course, type Cefr } from "./course";

/** `A1:checkpoint` (path node) and `A1:test` (skip-level test) share one flow (DECISIONS B8). */
export const examLevel = (id: string) => /^([ABC][12]):(checkpoint|test)$/.exec(id)?.[1] as Cefr | undefined;

/** Finds a step and its surroundings in the course tree; exams get a synthetic step covering the whole level. */
export function stepContext(course: Course, stepId: string, native: string): LessonContext | null {
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

async function generateItems(c: LessonContext): Promise<Item[]> {
  const acts = plannedActivities(c.step.activities);
  if (!acts.length) throw new Error("This step has no activities that can be generated yet.");
  const system = systemPrompt(c);
  try {
    const items = toItems(acts, await generate(lessonSchema(acts), system, lessonPrompt(c, acts)) as Record<string, unknown[]>);
    if (items.length) return items;
  } catch (e) { console.warn("Whole-lesson generation failed, falling back to per-activity calls", e); }
  // Fallback for small local models that struggle with the full schema.
  const items: Item[] = [];
  let lastError: unknown;
  for (const a of acts) {
    try {
      const out = await generate(z.object({ items: z.array(REGISTRY[a.type]!.schema).min(1).max(a.count) }), system, lessonPrompt(c, [{ ...a, key: "items" }]));
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
    const items = await generateItems(c);
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
  return generate(
    z.object({ correct: z.boolean(), feedback: z.string() }),
    systemPrompt(c),
    `Exercise: ${question}\nExpected answer: ${expected}\nLearner's answer: ${given}\n` +
      "Mark it correct if it conveys the same meaning and is grammatical — other wording, word order, synonyms or contractions are fine; " +
      "the expected answer is only one example. Ignore capitalization and punctuation; accept a single-letter typo but mention it. " +
      "`feedback`: one short sentence.",
  );
}

export function explain(c: LessonContext, question: string, correct: string, given: string) {
  return generatePlain(systemPrompt(c).replace("Respond only with JSON matching the schema.", ""),
    `Exercise: ${question}\nCorrect answer: ${correct}\nLearner answered: ${given || "(skipped)"}\nExplain in at most 3 short sentences why the correct answer is right${given ? " and what was wrong with the learner's answer" : ""}. Plain text, no markdown.`);
}
