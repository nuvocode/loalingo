// Tutor call brain (spec T): one event in, one structured reply out. Pure module, tested by src/tutor.test.ts;
// the model call is tutorTurn in src/lessons.ts. New capability = a new TUTOR_ACTIONS value + a handler in TutorCall.
import { z } from "zod";
import type { CourseLevel } from "./course";

export const TUTOR_ACTIONS = ["speak", "wait", "check_in", "end"] as const;
export type TutorAction = (typeof TUTOR_ACTIONS)[number];

export type TutorEvent =
  | { kind: "start" }
  | { kind: "user_said"; text: string }
  | { kind: "user_typed"; text: string }
  | { kind: "silence"; seconds: number }
  | { kind: "mic"; on: boolean }
  | { kind: "cam"; on: boolean };

export type TutorMsg = { from: "tutor" | "me"; text: string; via: "voice" | "text" };

/** What the prompt needs; lessons.ts fills it from the character, the course and the current unit. */
export type TutorCtx = { name: string; persona: string; target: string; native: string; level: string; unit: string; words: string[]; grammar: string[] };

export const tutorSchema = z.object({ action: z.enum(TUTOR_ACTIONS), say: z.string(), translation: z.string(), correction: z.string(), notes: z.string() });
// Small models drop or misspell fields: a broken action means "keep talking", missing text means nothing to show.
export const looseTutor = z.object({
  action: z.enum(TUTOR_ACTIONS).catch("speak"), say: z.string().catch(""), translation: z.string().catch(""),
  correction: z.string().catch(""), notes: z.string().catch(""),
});
export type TutorReply = z.infer<typeof tutorSchema>;

export const HISTORY_IN_PROMPT = 12; // ponytail: older turns live only in `notes`; summarise them if long lessons lose the thread
export const NOTES_MAX = 300;
export const SILENCE_S = 20, WAIT_S = 60, MAX_NUDGES = 2;

export function tutorSystem(c: TutorCtx): string {
  return [
    `You are ${c.name}, a friendly online ${c.target} tutor giving a live one-to-one video lesson inside a language-learning app. The learner is a native ${c.native} speaker at CEFR level ${c.level}.`,
    `Your personality: ${c.persona} Keep your manner, but in this call you are the learner's tutor, not at your usual job.`,
    `Lesson material, the learner's current unit "${c.unit}". Words: ${c.words.join(", ") || "(none)"}. Grammar: ${c.grammar.join(" | ") || "(none)"}.`,
    `Run the lesson like a real tutor: a short warm-up chat, then bring in a topic from the unit and practise its words and grammar with small questions, one step per turn. Then ask a real-life question about the topic ("Have you ever…?"); after the learner answers, ask them to ask you the same question and answer it yourself. If the learner brings up their own topic, follow it and weave the unit in where it fits.`,
    "Each turn you get one event and choose one action:",
    "- speak: say the next thing in the lesson.",
    `- wait: the learner needs a moment (e.g. "my mic isn't working, one sec"); say a very short OK and wait.`,
    "- check_in: the learner has been quiet; gently ask if everything is OK, or repeat your question more simply.",
    "- end: the learner wants to stop or says goodbye; say a warm goodbye.",
    `\`say\`: what you say aloud, ${c.target} only, 1–2 short sentences suited to ${c.level}. Always ${c.target}, even when the learner writes in another language. \`translation\`: \`say\` in ${c.native}.`,
    `\`correction\`: if the learner's latest message has a mistake, the corrected sentence and a very short explanation in ${c.native}; otherwise "". Ignore capitalization, punctuation and obvious speech-to-text slips.`,
    `\`notes\`: your private lesson notes for the next turn, at most ${NOTES_MAX} characters: where the lesson is and what to do next.`,
    "Messages marked (typed) were written in the call chat, not spoken; answer them aloud as usual.",
    "Respond only with JSON matching the schema.",
  ].join("\n");
}

export function describeEvent(e: TutorEvent): string {
  switch (e.kind) {
    case "start": return "The call just connected. Greet the learner warmly and start the warm-up.";
    case "user_said": return `The learner said: "${e.text}"`;
    case "user_typed": return `The learner typed in the chat: "${e.text}"`;
    case "silence": return `The learner has been silent for ${e.seconds} seconds.`;
    case "mic": return e.on ? "The learner turned their microphone on." : "The learner turned their microphone off; they can still type.";
    case "cam": return e.on ? "The learner turned their camera on." : "The learner turned their camera off.";
  }
}

export function tutorPrompt(name: string, history: TutorMsg[], notes: string, e: TutorEvent): string {
  const lines = history.slice(-HISTORY_IN_PROMPT).map((m) => `${m.from === "tutor" ? name : "Learner"}${m.via === "text" ? " (typed)" : ""}: ${m.text}`);
  return [
    `Your notes: ${notes || "(none yet)"}`,
    `Conversation so far:\n${lines.join("\n") || "(nothing yet)"}`,
    `Event: ${describeEvent(e)}`,
    `Choose your action and write ${name}'s turn.`,
  ].join("\n\n");
}

/** Seconds of learner silence before a `silence` event, or null for none. `nudges` = silence events since the learner last spoke. */
export function silenceDelay(last: TutorReply | null, nudges: number): number | null {
  if (!last || last.action === "end" || nudges >= MAX_NUDGES) return null;
  if (last.action === "wait") return WAIT_S;
  return last.say.trim().endsWith("?") ? SILENCE_S : null;
}

/** Learner input queued while the tutor was busy, as one event; null when there is none. */
export function mergeInput(queue: TutorEvent[]): TutorEvent | null {
  const said = queue.flatMap((e) => (e.kind === "user_said" || e.kind === "user_typed" ? [e] : []));
  if (!said.length) return null;
  const kind = said[said.length - 1].kind, text = said.map((e) => e.text).join(" ");
  return kind === "user_said" ? { kind, text } : { kind, text };
}

/** Speech-to-text output that is empty or only a noise tag ("[BLANK_AUDIO]", "(wind)"). One-word answers count. */
export const isNoise = (text: string) => !text.replace(/\[[^\]]*\]|\([^)]*\)/g, "").trim();

/** The unit the learner is on: the first one with an unfinished step, else the last. */
export const currentUnit = (level: CourseLevel, done: Set<string>) =>
  level.units.find((u) => u.steps.some((s) => !done.has(s.id))) ?? level.units[level.units.length - 1];
