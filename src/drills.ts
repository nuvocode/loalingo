// Fluency drills (epic #31, docs/superpowers/specs/2026-10-02-fluency-drills-design.md): a mode of the voice Chat.
// Pure: the talk id (planning and 4/3/2), planning progression, drill rules/conditions and time format. The sheet lives in screens/Screens.tsx, the screen in Talk.tsx.
import type { Conditions, SessionRow, SpeechSummary } from "./speech.ts";

/** Compared across 4/3/2 rounds; null = not measured (voice analysis off or nothing said). */
export type RoundStat = Pick<SpeechSummary, "wpm" | "pauseRatio" | "fillers"> | null;
/** `round` (1–3) and `prev` (the stats of the rounds before it) only on 4/3/2. */
export type Drill = { kind: "planning" | "432"; topic: string; planningSec: number; minutes: number; round?: number; prev?: RoundStat[] };
export const FOUR_THREE_TWO_MINUTES = [4, 3, 2];
export const DRILL_MINUTES = 3;
/** Drill prompts only carry the last few messages; a 3-minute monologue grows the history fast. */
export const DRILL_KEEP = 12;

/** 4/3/2 rounds 2–3: the learner retells the same thing in less time. */
export const REPETITION_RULE = "The learner already told you this once, with more time. Let them tell it again: bring up nothing new, keep your reactions short, so they can say it faster and more smoothly.";

/** Extra system-prompt lines for a drill turn. */
export const drillRules = (d: Drill) => [
  `This is a speaking drill: the learner is telling you about ${d.topic}. React briefly, ask at most one short question, and let the learner do most of the talking.`,
  ...(d.kind === "432" && (d.round ?? 1) > 1 ? [REPETITION_RULE] : []),
];

/** What the speech_sessions row records about the drill. From round 2 on, the 4/3/2 topic is one the learner has already told. */
export const drillConditions = (d: Drill): Conditions => d.kind === "432"
  ? { mode: "drill", drill: "432", planningTimeSec: 0, topicFamiliarity: (d.round ?? 1) > 1 ? "prepared" : "novel", round: d.round }
  : { mode: "drill", drill: "planning", planningTimeSec: d.planningSec, topicFamiliarity: "prepared" };

export const roundStat = (s: SpeechSummary | null): RoundStat => s && { wpm: s.wpm, pauseRatio: s.pauseRatio, fillers: s.fillers };
const statOf = (x: unknown): RoundStat => {
  const o = (x ?? {}) as Record<string, unknown>;
  return typeof o.wpm === "number" && typeof o.pauseRatio === "number" && typeof o.fillers === "number" ? { wpm: o.wpm, pauseRatio: o.pauseRatio, fillers: o.fillers } : null;
};

const STEPS = [60, 30, 0];
/** Planning seconds for the next session. `past` is newest first. The lowest step reached so far moves down once two sessions were spent on it; it never goes back up. */
export function nextPlanningSec(past: number[]): number {
  if (!past.length) return STEPS[0];
  const cur = Math.min(...past);
  return past.filter((x) => x === cur).length >= 2 ? STEPS[Math.min(STEPS.indexOf(cur) + 1, STEPS.length - 1)] : cur;
}

/** Planning seconds of past planning drills, newest first (`rows` come oldest first). Ladder rung 1 has planning too, but it does not count. */
// ponytail: only sees the rows the caller loaded (Screens loads the last 100 sessions); after 100 other sessions it starts again at 60
export const planningHistory = (rows: SessionRow[]) =>
  rows.filter((r) => r.conditions?.mode === "drill" && r.conditions.drill === "planning").map((r) => r.conditions!.planningTimeSec).reverse();

/** `drill:<who>:<kind>:<uri-encoded JSON>`; `who` is checked by parseTalkId. */
export const drillId = (who: string, d: Drill) => `drill:${who}:${d.kind}:${encodeURIComponent(JSON.stringify(d.kind === "432"
  ? { topic: d.topic, round: d.round, prev: d.prev ?? [] }
  : { topic: d.topic, planningSec: d.planningSec, minutes: d.minutes }))}`;

/** `rest` = the id after `drill:<who>:`; null when it is not a usable drill. */
export function parseDrill(rest: string[]): Drill | null {
  const [kind, enc] = rest;
  if (rest.length !== 2 || (kind !== "planning" && kind !== "432")) return null;
  let b: unknown;
  try { b = JSON.parse(decodeURIComponent(enc)); } catch { return null; }
  const { topic, planningSec, minutes, round, prev } = (b ?? {}) as Record<string, unknown>;
  if (typeof topic !== "string" || !topic.trim()) return null;
  if (kind === "432") {
    if (round !== 1 && round !== 2 && round !== 3) return null;
    return { kind, topic, planningSec: 0, minutes: FOUR_THREE_TWO_MINUTES[round - 1], round, prev: (Array.isArray(prev) ? prev : []).slice(0, round - 1).map(statOf) };
  }
  if (typeof planningSec !== "number" || typeof minutes !== "number" || minutes <= 0) return null;
  return { kind, topic, planningSec: Math.max(0, planningSec), minutes };
}

export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;
