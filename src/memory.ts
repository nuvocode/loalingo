// Profile memory (SPR-22): lasting facts about the learner, distilled from a finished conversation in one model call.
// Pure module, tested by src/memory.test.ts; the model call is rememberSession in src/lessons.ts, storage in src/db.ts.
import { z } from "zod";

export const MEMORY_KINDS = ["interest", "goal", "background", "learning"] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export type MemorySource = "tutor" | "chat";
export type Memory = { id: number; kind: MemoryKind; text: string; source: MemorySource; hits: number; last_seen_at: string };

export const MEMORY_MAX = 50; // per profile; past it the least used go (see evictIds)
export const MEMORY_TEXT_MAX = 120;

// All fields required so OpenAI's strict mode accepts it; empty arrays mean "nothing to change".
export const memorySchema = z.object({
  add: z.array(z.object({ kind: z.enum(MEMORY_KINDS), text: z.string() })),
  update: z.array(z.object({ id: z.number(), text: z.string() })),
  forget: z.array(z.number()),
});
// Small models drop a list or misspell a kind: drop what can't be used instead of failing the whole reply.
export const looseMemory = z.object({
  add: z.array(z.object({ kind: z.enum(MEMORY_KINDS), text: z.string() }).nullable().catch(null)).catch([]),
  update: z.array(z.object({ id: z.number(), text: z.string() }).nullable().catch(null)).catch([]),
  forget: z.array(z.number().nullable().catch(null)).catch([]),
});
export type MemoryOps = z.infer<typeof memorySchema>;

export function memorySystem(native: string): string {
  return [
    "You keep the long-term memory of a language-learning app about one learner: short facts that help their tutors teach them better in later lessons.",
    "You get the facts already saved and one finished conversation. Return only the changes.",
    "Save a fact only when ALL of these hold:",
    "- The learner said it about their own real life (not the tutor, not a sentence they were only practising or translating).",
    "- It stays true for months: interests, likes and dislikes, goals and reasons for learning, job or studies, where they live or plan to go, people and pets in their life, what they find hard or easy in the language.",
    "- It would help a tutor pick topics, examples or explanations.",
    "Never save:",
    '- One-off events and passing states: "I ate pizza yesterday", "I am tired today", "it is raining".',
    "- Health, religion, politics, sexuality, money troubles or other sensitive matters, even if the learner brings them up.",
    "- Anything already saved: if a new detail refines a saved fact, put it in `update` with that fact's id instead.",
    "`add`: new facts. `kind`: interest (likes, dislikes, hobbies, tastes) | goal (why they learn, plans) | background (job, studies, home, people in their life) | learning (what is hard or easy in the language for them). " +
      `\`text\`: one short third-person sentence, at most ${MEMORY_TEXT_MAX} characters, always written in ${native} whatever language the conversation is in.`,
    `\`update\`: saved facts the conversation refines (same id, new text in ${native}).`,
    "`forget`: ids of saved facts the learner said are no longer true.",
    "Most conversations hold nothing worth saving; then return empty lists.",
    "Respond only with JSON matching the schema.",
  ].join("\n");
}

/** The learner's lines are what counts; the other side is there for context only. */
export function memoryPrompt(saved: Memory[], lines: { from: "me" | "other"; text: string }[], otherName: string): string {
  return [
    `Saved facts:\n${saved.map((m) => `#${m.id} [${m.kind}] ${m.text}`).join("\n") || "(none)"}`,
    `Conversation:\n${lines.map((l) => `${l.from === "me" ? "Learner" : otherName}: ${l.text}`).join("\n")}`,
    "Return the changes to the saved facts.",
  ].join("\n\n");
}

const norm = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const clip = (s: string) => s.trim().slice(0, MEMORY_TEXT_MAX);

/** Model output made safe to apply: ids must exist, text non-empty and short, no duplicates of saved or of each other. */
export function cleanOps(saved: Memory[], raw: z.infer<typeof looseMemory>): MemoryOps {
  const ids = new Set(saved.map((m) => m.id));
  const forget = [...new Set(raw.forget.filter((id): id is number => id !== null && ids.has(id)))];
  const seen = new Set(saved.filter((m) => !forget.includes(m.id)).map((m) => norm(m.text)));
  const update = raw.update.flatMap((u) => u && ids.has(u.id) && !forget.includes(u.id) && clip(u.text) ? [{ id: u.id, text: clip(u.text) }] : []);
  for (const u of update) seen.add(norm(u.text));
  const add = raw.add.flatMap((a) => {
    if (!a || !clip(a.text) || seen.has(norm(a.text))) return [];
    seen.add(norm(a.text));
    return [{ kind: a.kind, text: clip(a.text) }];
  });
  return { add, update, forget };
}

/** Ids to drop so at most MEMORY_MAX stay: least used first, then least recently seen. */
export function evictIds(all: Pick<Memory, "id" | "hits" | "last_seen_at">[]): number[] {
  if (all.length <= MEMORY_MAX) return [];
  return [...all].sort((a, b) => a.hits - b.hits || a.last_seen_at.localeCompare(b.last_seen_at) || a.id - b.id)
    .slice(0, all.length - MEMORY_MAX).map((m) => m.id);
}
