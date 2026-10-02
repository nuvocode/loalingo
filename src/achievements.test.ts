import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { achievements, FAMILIES, nearest, type AchInput } from "./achievements.ts";

const zero: AchInput = { bestStreak: 0, bestDayXp: 0, xp: 0, lessons: 0, stories: 0, legendary: 0, words: 0 };

test("tiers are earned at their goal, ids are unique", () => {
  const list = achievements({ ...zero, bestStreak: 7, xp: 99 });
  assert.equal(new Set(list.map((a) => a.id)).size, list.length);
  assert.deepEqual(list.filter((a) => a.earned).map((a) => a.id), ["streak1", "streak2"]);
  for (const f of FAMILIES) assert.deepEqual([...f.tiers].sort((a, b) => a - b), [...f.tiers], f.id); // ascending, so tier order = difficulty
});

test("nearest: one per family, closest first, never an earned one", () => {
  const near = nearest(achievements({ ...zero, bestStreak: 7, xp: 900, lessons: 9, words: 10 }));
  assert.deepEqual(near.map((a) => a.id), ["lessons2", "xp2", "streak3"]); // 90%, 90% (smaller goal first), 23%
  assert.ok(near.every((a) => !a.earned));
  const all = Object.fromEntries(Object.keys(zero).map((k) => [k, 1e6])) as AchInput;
  assert.deepEqual(nearest(achievements(all)), []);
});

test("every family has a title and a description in every locale", () => {
  const dir = new URL("./locales/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const ach = JSON.parse(readFileSync(new URL(f, dir), "utf8")).profile.ach;
    for (const fam of FAMILIES) {
      assert.equal(typeof ach?.[fam.id]?.title, "string", `${f} ${fam.id}.title`);
      assert.equal(typeof ach[fam.id].desc_other, "string", `${f} ${fam.id}.desc_other`);
    }
  }
});
