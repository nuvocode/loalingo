import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptAppeal } from "./appeal.ts";

test("accepted appeal scores like a correct answer and restores the lost heart", () => {
  const r = acceptAppeal({ correct: 2, xp: 20 }, 3, 5, true);
  assert.deepEqual(r, { score: { correct: 3, xp: 30 }, hearts: 4 });
});

test("no heart is restored when none was lost, and never above the max", () => {
  assert.equal(acceptAppeal({ correct: 0, xp: 0 }, 5, 5, false).hearts, 5);
  assert.equal(acceptAppeal({ correct: 0, xp: 0 }, 5, 5, true).hearts, 5);
  assert.equal(acceptAppeal({ correct: 0, xp: 0 }, 0, 5, true).hearts, 1);
});
