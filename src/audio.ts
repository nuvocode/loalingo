// Pure audio helpers (tested by src/audio.test.ts).

/** Linear-interpolation resample to `to` Hz; whisper wants 16 kHz mono. */
export function resample(input: Float32Array, from: number, to = 16000): Float32Array {
  if (from === to) return input;
  const out = new Float32Array(Math.floor((input.length * to) / from));
  const step = from / to;
  for (let i = 0; i < out.length; i++) {
    const x = i * step, j = Math.floor(x), f = x - j;
    out[i] = input[j] * (1 - f) + (input[j + 1] ?? input[j]) * f;
  }
  return out;
}

/** Map as a small most-recent-first cache: re-inserts `k` and drops the oldest past `max`. */
export function remember<K, V>(m: Map<K, V>, k: K, v: V, max = 20) {
  m.delete(k);
  m.set(k, v);
  if (m.size > max) m.delete(m.keys().next().value as K);
}

/** Speech loudness (RMS of the last audio frame) → mouth openness 0..1. Opens fast, closes slower so it doesn't flicker. */
export function mouthLevel(prev: number, rms: number, dt: number): number {
  const target = Math.min(1, Math.max(0, (rms - 0.02) / 0.18)); // ~0.02 is silence, ~0.2 a loud syllable
  const tau = target > prev ? 0.04 : 0.12; // seconds
  return prev + (target - prev) * (1 - Math.exp(-dt / tau));
}

/** Voice detector knobs (tutor call). RMS is after the browser's noise suppression; raise `threshold` if a noisy room keeps triggering it. */
export const VAD = { threshold: 0.015, startMs: 150, endMs: 1200, maxMs: 15000 };
export type Vad = { speaking: boolean; voiced: number; quiet: number; length: number };
export type VadEvent = "start" | "end" | null;
export const VAD_IDLE: Vad = { speaking: false, voiced: 0, quiet: 0, length: 0 };

/** One mic frame through the voice detector: "start" after `startMs` of sound, "end" after `endMs` of quiet or at `maxMs`. */
export function vadStep(v: Vad, level: number, ms: number, k = VAD): [Vad, VadEvent] {
  const loud = level >= k.threshold;
  if (!v.speaking) {
    const voiced = loud ? v.voiced + ms : 0;
    return voiced >= k.startMs ? [{ speaking: true, voiced, quiet: 0, length: voiced }, "start"] : [{ ...VAD_IDLE, voiced }, null];
  }
  const length = v.length + ms, quiet = loud ? 0 : v.quiet + ms;
  return quiet >= k.endMs || length >= k.maxMs ? [VAD_IDLE, "end"] : [{ ...v, quiet, length }, null];
}

export const rms = (d: Float32Array) => Math.sqrt(d.reduce((s, x) => s + x * x, 0) / (d.length || 1));

export function concat(parts: Float32Array[]): Float32Array {
  const all = new Float32Array(parts.reduce((n, c) => n + c.length, 0));
  parts.reduce((o, c) => (all.set(c, o), o + c.length), 0);
  return all;
}
