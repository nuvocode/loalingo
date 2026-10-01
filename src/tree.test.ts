import { test } from "node:test";
import assert from "node:assert/strict";
import { treeState, treeSvg } from "./tree.ts";

const lessons = (n: number) => Array.from({ length: n }, (_, i) => `u${i}-l${i}`);

test("finished lessons pick the growth stage; chests, stories and checkpoints do not", () => {
  assert.equal(treeState([], 0, null).stage, 0);
  assert.equal(treeState(["u0:chest", "story:x", "A1:checkpoint"], 1, "2026-10-01").stage, 0);
  assert.equal(treeState(lessons(1), 1, "2026-10-01").stage, 1);
  assert.equal(treeState(lessons(39), 1, "2026-10-01").stage, 2);
  assert.equal(treeState(lessons(40), 1, "2026-10-01").stage, 3);
  assert.equal(treeState(lessons(250), 1, "2026-10-01").stage, 4);
});

test("a broken streak dries the leaves but keeps the stage; a new user is not dry", () => {
  assert.deepEqual(treeState(lessons(40), 0, "2026-09-20"), { stage: 3, dry: true, fruit: 0 });
  assert.equal(treeState([], 0, null).dry, false);
});

test("each passed checkpoint is one fruit", () => {
  const s = treeState([...lessons(100), "A1:checkpoint", "A2:checkpoint"], 3, "2026-10-01");
  assert.equal(s.fruit, 2);
  assert.equal(treeSvg(s).match(/var\(--fruit\)/g)?.length, 2);
  assert.match(treeSvg({ ...s, dry: true }), /--leaf-dry/);
});
