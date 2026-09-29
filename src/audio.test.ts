import { test } from "node:test";
import assert from "node:assert/strict";
import { resample } from "./audio.ts";

test("resample keeps duration and interpolates", () => {
  const one = new Float32Array(48000).map((_, i) => i / 48000);
  const out = resample(one, 48000);
  assert.equal(out.length, 16000);
  assert.ok(Math.abs(out[8000] - 0.5) < 1e-3);
  assert.equal(resample(one, 16000), one);
});
