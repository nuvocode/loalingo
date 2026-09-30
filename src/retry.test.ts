import { test } from "node:test";
import assert from "node:assert/strict";
import { retry } from "./retry.ts";

test("retry repeats accepted errors, then gives up", async () => {
  let n = 0;
  assert.equal(await retry(async () => { if (++n < 3) throw new Error("bad"); return "ok"; }, () => true), "ok");
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(retry(async () => { n++; throw new Error("bad"); }, () => true), /bad/);
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(retry(async () => { n++; throw new Error("401"); }, () => false), /401/);
  assert.equal(n, 1);
});
