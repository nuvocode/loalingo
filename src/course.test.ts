// Run: pnpm test  (node --test, native TS type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCourse, buildPath } from "./course.ts";

const en = readFileSync(new URL("../courses/en.yml", import.meta.url), "utf8");

test("bundled courses/en.yml is valid and builds a sequential A1 path", () => {
  const c = parseCourse(en, "en.yml");
  const { units, remaining } = buildPath(c.levels.A1!, "A1", new Set([c.levels.A1!.units[0].steps[0].id]));
  const nodes = units.flatMap((u) => u.nodes.filter((n) => n.kind === "step"));
  assert.deepEqual(nodes.slice(0, 3).map((n) => n.state), ["done", "current", "locked"]);
  assert.equal(remaining, nodes.length - 1);
  assert.equal(units.at(-1)!.nodes.at(-1)!.kind, "checkpoint");
});

test("broken YAML fails with file, path and reason", () => {
  const bad = (text: string, re: RegExp) => assert.throws(() => parseCourse(text, "x.yml"), re);
  bad("name: A\nname: B\n", /x\.yml: Map keys must be unique at line 2/);
  bad(en.replace("type: match", "type: quiz"), /x\.yml:[\s\S]*levels\.A1\.units\[0\]\.steps\[0\]\.activities\[2\]\.type/);
  bad(en.replace("id: introduce-yourself", "id: basic-greetings"), /duplicate step id "basic-greetings"/);
  bad(en.replace("vocabulary: [one,", "vocab: [one,"), /vocab/);
});
