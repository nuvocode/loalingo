import { test } from "node:test";
import assert from "node:assert/strict";
import { CEFR } from "./course.ts";
import { BIOMES, biomeScene } from "./biomes.ts";

test("every CEFR level has its own biome and a scene", () => {
  assert.equal(new Set(CEFR.map((l) => BIOMES[l].id)).size, CEFR.length);
  for (const l of CEFR) {
    const svg = biomeScene(l, 120);
    assert.match(svg, /^<svg[^>]*viewBox="0 0 400 120"/);
    assert.ok(!svg.includes("NaN"), l);
  }
});
