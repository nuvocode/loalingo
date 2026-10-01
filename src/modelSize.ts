// Small local models write lessons with wrong answer keys (measured 2026-10-01: gemma4:e2b and qwen3.5:4b got ~1 in 4 wrong,
// 31B+ cloud models none), so the AI settings warn under 8B.
// Pure for node --test (src/modelSize.test.ts).

export const SMALL_MODEL_B = 8;

/** Billions of parameters read from a model name ("qwen3.5:4b-mlx" → 4, "gemma4:e2b" → 2), or null when the name has none.
 *  ponytail: name only; Ollama's /api/show parameter_size if unnamed sizes ("nimble:latest") need covering. */
export function modelSizeB(name: string): number | null {
  const m = /(?:^|[:\-_ /])e?(\d+(?:\.\d+)?)b(?![a-z0-9])/i.exec(name);
  return m ? Number(m[1]) : null;
}

/** A model running on this machine that is known to be under 8B. Cloud models (Ollama's `…cloud`) are never small. */
export const isSmallModel = (name: string) => {
  const b = /cloud$/.test(name) ? null : modelSizeB(name);
  return b !== null && b < SMALL_MODEL_B;
};
