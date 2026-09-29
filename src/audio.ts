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
