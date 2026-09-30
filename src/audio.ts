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
