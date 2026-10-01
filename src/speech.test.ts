import { test } from "node:test";
import assert from "node:assert/strict";
import { LONG_PAUSE_MS, nativeCount, speechMetrics, summarize } from "./speech.ts";

const RATE = 16000;
/** `parts`: [ms, loud?] stretches of a 0.1 or silent signal. */
const signal = (parts: [number, boolean][]) => {
  const out = new Float32Array(parts.reduce((n, [ms]) => n + (ms * RATE) / 1000, 0));
  let o = 0;
  for (const [ms, loud] of parts) { const n = (ms * RATE) / 1000; if (loud) out.fill(0.1, o, o + n); o += n; }
  return out;
};

test("timing: speech span, pauses and the long ones; word gaps, edges and the end-of-turn quiet don't count", () => {
  const s = signal([[300, false], [1000, true], [100, false], [500, true], [400, false], [1000, true], [LONG_PAUSE_MS + 200, false], [1000, true], [800, false]]);
  const m = speechMetrics(s, RATE, "I usually wake up at seven", { latencyMs: 900 }, "tr", "en");
  assert.equal(m.speechMs, 5200);
  assert.equal(m.longPauses, 1);
  assert.ok(Math.abs(m.pauseRatio - 1600 / 5200) < 0.01);
  assert.equal(m.words, 6);
  assert.equal(m.wpm, Math.round(6 / (5200 / 60000)));
  assert.ok(Math.abs(m.level - 0.1) < 1e-6);
  assert.equal(m.latencyMs, 900);
});

test("fillers and native words are counted, not taken for target words", () => {
  const m = speechMetrics(signal([[1000, true]]), RATE, "Um, I... eee, bilmiyorum, ama I like it", { latencyMs: null }, "tr", "en");
  assert.equal(m.fillers, 2);
  assert.equal(m.words, 6);
  assert.equal(m.nativeWords, 2);
  assert.equal(nativeCount(["e", "que"], "es", "pt"), 0); // shared small words are not a switch
  assert.equal(nativeCount(["я", "не", "know"], "ru", "en"), 2);
  assert.equal(nativeCount(["ve"], "tr", "tr"), 0);
});

test("silence gives zeros, not NaN", () => {
  const m = speechMetrics(new Float32Array(RATE), RATE, "", { latencyMs: null }, "tr", "en");
  assert.deepEqual([m.speechMs, m.wpm, m.pauseRatio, m.level], [0, 0, 0, 0]);
});

test("session summary averages what was said and sums the counts", () => {
  const base = { latencyMs: null, speechMs: 1000, words: 0, wpm: 0, pauseRatio: 0, longPauses: 0, level: 0, fillers: 1, nativeWords: 0 };
  const s = summarize([
    { ...base, latencyMs: 1000, words: 5, wpm: 100, pauseRatio: 0.2, longPauses: 1, level: 0.1 },
    { ...base, latencyMs: null, words: 3, wpm: 60, pauseRatio: 0.4, level: 0.3, nativeWords: 1 },
    base, // a cough: no words
  ], 2);
  assert.deepEqual({ ...s, pauseRatio: +s.pauseRatio.toFixed(2), level: +s.level.toFixed(2) },
    { utterances: 2, silences: 2, latencyMs: 1000, wpm: 80, pauseRatio: 0.3, longPauses: 1, level: 0.2, fillers: 3, words: 8, nativeWords: 1, speechMs: 3000 });
  assert.equal(summarize([], 0).latencyMs, null);
});
