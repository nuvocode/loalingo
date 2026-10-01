// Live-call turn timing (SPR-12): marks along one turn, one summary line once the tutor's first audio plays.
// On in dev builds, or anywhere with localStorage.latency = "1". Pure enough for node --test (src/latency.test.ts).

export type Mark = "vad" | "stt" | "req" | "llm" | "audio";
export type Marks = Partial<Record<Mark, number>>;

let t: Marks = {};
const enabled = () => !!import.meta.env?.DEV || globalThis.localStorage?.getItem("latency") === "1";

/** `at` lets the TTS mark when a buffer is scheduled to start, not when it was queued. */
export function mark(k: Mark, at = performance.now()) {
  if (k === "vad" || (k === "req" && (t.stt === undefined || t.req !== undefined))) t = {}; // typed input / app events start at req
  t[k] = at;
  if (k !== "audio") return;
  if (t.req !== undefined && enabled()) console.info(summary(t));
  t = {};
}

const ms = (a?: number, b?: number) => (a === undefined || b === undefined ? undefined : Math.round(b - a));

/** `[latency] vad→stt 420ms · llm 900ms · llm→audio 300ms · total 1620ms` (missing steps are left out). */
export function summary(m: Marks): string {
  const wait = ms(m.stt, m.req);
  const parts = [
    ["vad→stt", ms(m.vad, m.stt)],
    ["queue", wait !== undefined && wait >= 50 ? wait : undefined], // the reply to an earlier line was still playing
    ["llm", ms(m.req, m.llm)],
    ["llm→audio", ms(m.llm, m.audio)],
    ["total", ms(m.vad ?? m.req, m.audio)],
  ].filter(([, v]) => v !== undefined);
  return `[latency] ${parts.map(([k, v]) => `${k} ${v}ms`).join(" · ")}`;
}
