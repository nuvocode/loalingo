import { test } from "node:test";
import assert from "node:assert/strict";
import { summary } from "./latency.ts";

test("a spoken turn reports every step and the total from the end of speech", () => {
  assert.equal(summary({ vad: 0, stt: 420, req: 425, llm: 1325, audio: 1625 }),
    "[latency] vad→stt 420ms · llm 900ms · llm→audio 300ms · total 1625ms");
});

test("a typed turn starts at the request; a long queue wait is shown", () => {
  assert.equal(summary({ req: 100, llm: 600, audio: 700 }), "[latency] llm 500ms · llm→audio 100ms · total 600ms");
  assert.match(summary({ vad: 0, stt: 300, req: 2300, llm: 2800, audio: 2900 }), /queue 2000ms/);
});
