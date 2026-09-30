import { test } from "node:test";
import assert from "node:assert/strict";
import { mouthLevel, remember, resample } from "./audio.ts";

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

test("mouthLevel opens on loud speech, closes in silence, opens faster than it closes", () => {
  let v = 0;
  for (let i = 0; i < 12; i++) v = mouthLevel(v, 0.3, 1 / 60); // 0.2 s loud
  assert.ok(v > 0.95, `open ${v}`);
  for (let i = 0; i < 60; i++) v = mouthLevel(v, 0, 1 / 60); // 1 s silence
  assert.ok(v < 0.01, `closed ${v}`);
  assert.equal(mouthLevel(0.4, 0.01, 0), 0.4); // no time, no change
  const opened = mouthLevel(0, 1, 0.05), closed = 1 - mouthLevel(1, 0, 0.05);
  assert.ok(opened > closed, `${opened} vs ${closed}`);
});
