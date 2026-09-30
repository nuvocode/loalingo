import { test } from "node:test";
import assert from "node:assert/strict";
import { remember, resample } from "./audio.ts";

test("resample keeps duration and interpolates", () => {
  const one = new Float32Array(48000).map((_, i) => i / 48000);
  const out = resample(one, 48000);
  assert.equal(out.length, 16000);
  assert.ok(Math.abs(out[8000] - 0.5) < 1e-3);
  assert.equal(resample(one, 16000), one);
});

test("remember keeps the newest entries", () => {
  const m = new Map<string, number>();
  remember(m, "a", 1, 2); remember(m, "b", 2, 2); remember(m, "a", 3, 2); remember(m, "c", 4, 2);
  assert.deepEqual([...m], [["a", 3], ["c", 4]]);
});
