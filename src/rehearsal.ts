// Rehearsal (adapted from Verba PLAN-034): the character plays someone from the learner's own life, in role and
// without teaching, then one debrief call shows where the learner got stuck and a few phrases that would have helped.
// Pure: prompts, schemas and the talk id. The calls live in lessons.ts, the screen in Talk.tsx.
import { z } from "zod";
import { langEn } from "./activities.ts";
import type { CharacterId } from "./characters.ts";

export type Formality = "casual" | "neutral" | "formal";
/** Only `who` is required; an empty `about` becomes a generic errand. */
export type RehearsalBrief = { who: string; about?: string; formality: Formality };

const FORMALITY_WORD = { casual: "casually", neutral: "neutrally", formal: "formally" } as const;
export const DEBRIEF_PHRASES_MAX = 5;
/** No turn limit; past this many learner messages the chat only suggests stepping out. */
export const REHEARSE_LONG = 20;

// Base in lessons.ts fits this; kept structural so the module stays testable without a course.
type Ctx = { course: { name: string }; level: string; native: string };

const aboutOf = (b: RehearsalBrief) => b.about?.trim() || "something you need to sort out";

/** No persona, no goal, no corrections: the character *is* `brief.who`. */
export function rehearsalSystem(c: Ctx, brief: RehearsalBrief) {
  const who = brief.who.trim(), about = aboutOf(brief), target = c.course.name;
  return [
    `For this session you are ${who}. You are not a tutor and never a helper. You are a real person: busy, with your own concerns, and you do not exist to teach ${target}.`,
    `The learner needs to rehearse this conversation before they have it for real: ${about}. Hold the conversation they would actually walk into.`,
    `Stay in role from your first word to your last. Never step out of it, never comment on the learner's language, never teach, never offer to help, and never say anything a real ${who} would not say.`,
    "You may be brisk or unhelpful — real people are — but you are never a test: no trick questions, no deliberate obscurity, nothing set up to catch the learner out.",
    `Keep the conversation going in ${target} by being the person you are: ask what you would actually ask, react as you would actually react, and end your reply the way a real person would.`,
    `Speak ${FORMALITY_WORD[brief.formality]} — the register is this conversation's, and nothing about it is graded.`,
    `\`reply\`: ${target} only, 1–3 short sentences a CEFR ${c.level} learner can follow, even when the learner writes in another language. \`translation\`: the reply in ${langEn(c.native)}.`,
    "Respond only with JSON matching the schema.",
  ].join("\n");
}

export const roleTurnSchema = z.object({ reply: z.string(), translation: z.string() });
export const looseRoleTurn = roleTurnSchema.extend({ translation: z.string().catch("") });

const stuckSchema = z.object({ turn: z.int(), moment: z.string(), why: z.string() });
const phraseSchema = z.object({ text: z.string(), translation: z.string() });
export const debriefSchema = z.object({ stuck: z.array(stuckSchema), phrases: z.array(phraseSchema) });
export const looseDebrief = z.object({ stuck: z.array(stuckSchema).catch([]), phrases: z.array(phraseSchema).catch([]) });
export type Debrief = z.infer<typeof debriefSchema>;

export const debriefSystem = (c: Ctx) =>
  `You are a ${c.course.name} coach in a language-learning app. The learner is a native ${langEn(c.native)} speaker at CEFR level ${c.level}.\nRespond only with JSON matching the schema.`;

/** Out of role: the learner's turns are numbered so `stuck[].turn` can point at one. */
export function debriefPrompt(c: Ctx, brief: RehearsalBrief, learnerTurns: string[]) {
  const native = langEn(c.native), target = c.course.name;
  return [
    `The role-play is over. You were ${brief.who.trim()} and the learner was rehearsing ${aboutOf(brief)} in ${target}; now step out of the role and talk to them as their coach.`,
    "The learner's turns, numbered:",
    learnerTurns.map((t, i) => `${i}. ${t}`).join("\n") || "(the learner never spoke)",
    "",
    `\`stuck\`: the turns where they actually ran aground — a very short answer, a turn that changed the subject or gave up, a sentence that would not have been understood. Only turns that exist in the numbered list; \`turn\` is the number itself. \`moment\`: where in that turn, \`why\`: what made it hard, both in ${native}. Two or three is plenty; an empty list is right for a rehearsal that went smoothly.`,
    `\`phrases\`: up to ${DEBRIEF_PHRASES_MAX} phrases in ${target} that would have helped *in that conversation* — words for its actual subject, not generic phrases about the topic, each short enough to say in one breath; \`translation\` in ${native}. Give fewer than ${DEBRIEF_PHRASES_MAX} rather than padding. Never a proper name, a number, a time, a date or a price.`,
  ].join("\n");
}

/** Drops `stuck` entries that point at no learner turn and empty phrases; caps phrases at five. */
export function cleanDebrief(d: Debrief, turnCount: number): Debrief {
  return {
    stuck: d.stuck.filter((s) => Number.isInteger(s.turn) && s.turn >= 0 && s.turn < turnCount && (s.moment.trim() || s.why.trim())),
    phrases: d.phrases.filter((p) => p.text.trim()).slice(0, DEBRIEF_PHRASES_MAX),
  };
}

// ---- Talk id: `rehearse:<character>:<chat|call>:<uri-encoded JSON brief>`; no table ----

export function rehearseId(voice: boolean, who: CharacterId, brief: Omit<RehearsalBrief, "formality"> & { formality?: Formality }) {
  return `rehearse:${who}:${voice ? "call" : "chat"}:${encodeURIComponent(JSON.stringify(brief))}`;
}

/** The brief part of a rehearse id; null when it is not a usable brief. */
export function parseBrief(enc: string): RehearsalBrief | null {
  let b: unknown;
  try { b = JSON.parse(decodeURIComponent(enc)); } catch { return null; }
  if (!b || typeof b !== "object") return null;
  const { who, about, formality } = b as Record<string, unknown>;
  if (typeof who !== "string" || !who.trim()) return null;
  return {
    who,
    ...(typeof about === "string" && about.trim() ? { about } : {}),
    formality: formality === "casual" || formality === "formal" ? formality : "neutral",
  };
}
