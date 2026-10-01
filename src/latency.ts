// Live-call turn timing (SPR-12): marks along one turn, one summary line once the reply is in and its first audio plays.
// With streaming (SPR-13) the first sentence is spoken ("say") and heard ("audio") before the reply is complete ("llm").
// On in dev builds, or anywhere with localStorage.latency = "1". Pure enough for node --test (src/latency.test.ts).

export type Mark = "vad" | "stt" | "req" | "say" | "llm" | "audio";
export type Marks = Partial<Record<Mark, number>>;

let t: Marks = {};
const enabled = () => !!import.meta.env?.DEV || globalThis.localStorage?.getItem("latency") === "1";

/** `at` lets the TTS mark when a buffer is scheduled to start, not when it was queued. */
export function mark(k: Mark, at = performance.now()) {
  if (k === "vad" || (k === "req" && (t.stt === undefined || t.req !== undefined))) t = {}; // typed input / app events start at req
  if ((k === "say" || k === "audio") && t[k] !== undefined) return; // only the first sentence counts
  t[k] = at;
  if (t.req === undefined || t.llm === undefined || t.audio === undefined) return;
  if (enabled()) console.info(summary(t));
  t = {};
}

const ms = (a?: number, b?: number) => (a === undefined || b === undefined ? undefined : Math.round(b - a));

/** `[latency] vad→stt 420ms · say 600ms · llm 900ms · →audio 300ms · total 1320ms` (missing steps are left out).
 *  `say`: request → first sentence handed to the voice; `→audio`: from there (or from the full reply) to the first sound. */
export function summary(m: Marks): string {
  const wait = ms(m.stt, m.req);
  const parts = [
    ["vad→stt", ms(m.vad, m.stt)],
    ["queue", wait !== undefined && wait >= 50 ? wait : undefined], // the reply to an earlier line was still playing
    ["say", ms(m.req, m.say)],
    ["llm", ms(m.req, m.llm)],
    ["→audio", ms(m.say ?? m.llm, m.audio)],
    ["total", ms(m.vad ?? m.req, m.audio)],
  ].filter(([, v]) => v !== undefined);
  return `[latency] ${parts.map(([k, v]) => `${k} ${v}ms`).join(" · ")}`;
}
