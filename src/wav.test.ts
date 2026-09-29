import { test } from "node:test";
import assert from "node:assert/strict";
import { wav16 } from "./wav.ts";

test("wav16 writes a PCM16 mono header, samples and clips", () => {
  const w = wav16(new Float32Array([0, 1, -1, 2, -2]), 16000);
  const v = new DataView(w.buffer);
  assert.equal(w.length, 44 + 10);
  assert.equal(new TextDecoder().decode(w.slice(0, 4)), "RIFF");
  assert.equal(new TextDecoder().decode(w.slice(8, 16)), "WAVEfmt ");
  assert.equal(v.getUint32(4, true), 36 + 10);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint32(28, true), 32000);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 10);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => v.getInt16(44 + i * 2, true)), [0, 32767, -32767, 32767, -32767]);
});
