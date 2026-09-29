import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (l: string) => JSON.parse(readFileSync(new URL(`./locales/${l}.json`, import.meta.url), "utf8"));
const flat = (o: Record<string, any>, p = ""): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, String(v)] as [string, string]]));

const en = flat(load("en")), tr = flat(load("tr"));

// i18next plural suffixes differ per language (tr has a single form), so compare the base keys.
const base = (rows: [string, string][]) => [...new Set(rows.map(([k]) => k.replace(/_(zero|one|two|few|many|other)$/, "")))].sort();

test("en and tr have identical key sets", () => {
  assert.deepEqual(base(en), base(tr));
});

// Garden theme: hearts -> drops, streak -> roots, freeze -> greenhouse, chest -> harvest basket.
test("no pre-garden wording in user-visible text", () => {
  const bad = (rows: [string, string][], re: RegExp) => rows.filter(([, v]) => re.test(v)).map(([k]) => k);
  assert.deepEqual(bad(en, /\b(hearts?|streaks?|chests?|freeze)\b/i), []);
  assert.deepEqual(bad(tr, /kalp|\bseri|sandık|dondur/i), []);
});

// Lily is a Duolingo character; the hotel receptionist is Mia.
test("no Duolingo character names in user-visible text", () => {
  for (const rows of [en, tr]) assert.deepEqual(rows.filter(([, v]) => /\bLily\b/i.test(v)).map(([k]) => k), []);
});
