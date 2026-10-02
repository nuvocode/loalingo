// Fluency drills (epic #31, docs/superpowers/specs/2026-10-02-fluency-drills-design.md): a mode of the voice Chat.
// Pure: the talk id, planning progression and time format. The sheet lives in screens/Screens.tsx, the screen in Talk.tsx.
import type { SessionRow } from "./speech.ts";

export type Drill = { kind: "planning"; topic: string; planningSec: number; minutes: number };
export const DRILL_MINUTES = 3;
/** Drill prompts only carry the last few messages; a 3-minute monologue grows the history fast. */
export const DRILL_KEEP = 12;

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
export const drillId = (who: string, d: Drill) =>
  `drill:${who}:${d.kind}:${encodeURIComponent(JSON.stringify({ topic: d.topic, planningSec: d.planningSec, minutes: d.minutes }))}`;

/** `rest` = the id after `drill:<who>:`; null when it is not a usable drill. */
export function parseDrill(rest: string[]): Drill | null {
  const [kind, enc] = rest;
  if (rest.length !== 2 || kind !== "planning") return null;
  let b: unknown;
  try { b = JSON.parse(decodeURIComponent(enc)); } catch { return null; }
  const { topic, planningSec, minutes } = (b ?? {}) as Record<string, unknown>;
  if (typeof topic !== "string" || !topic.trim() || typeof planningSec !== "number" || typeof minutes !== "number" || minutes <= 0) return null;
  return { kind, topic, planningSec: Math.max(0, planningSec), minutes };
}

export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, sec) % 60).padStart(2, "0")}`;
